/**
 * Outbound CoinFrenzy Creator Program API (cron host).
 *
 * Default base: https://dev2-cron.coinfrenzy.com/api/v1/frenzy-creator
 * Override: COINFRENZY_CRON_BASE_URL (no trailing slash).
 *
 * Upstream routes (path is appended to base):
 *   POST   /              Register affiliate
 *   PUT    /:id           Update affiliate
 *   DELETE /:id           Delete affiliate
 *   POST   /promocode     Create promocode
 *   PUT    /promocode/:id Update promocode
 *   DELETE /promocode/:id Delete promocode
 *   GET    /user/:username Verify user
 *   POST   /payout        Payout
 *
 * frenzycreator.com exposes same-origin proxies under /api/coinfrenzy/* (see api/coinfrenzy/).
 *
 * Auth: COINFRENZY_CRON_API_KEY — Authorization: Bearer and X-Api-Key.
 *
 * Diagnostics: set COINFRENZY_CRON_DEBUG_SECRET on Vercel, redeploy, then GET
 * /api/coinfrenzy/health?secret=... to confirm resolved base URL and that the key is set (never exposed).
 * Upstream errors (status >= 400) log: [coinfrenzy/upstream] METHOD url status body
 */

const DEFAULT_BASE = 'https://dev2-cron.coinfrenzy.com/api/v1/frenzy-creator';
const UPSTREAM_TIMEOUT_MS = 25_000;

function stripTrailingSlash(s) {
  return String(s || '').replace(/\/+$/, '');
}

function getCronBaseUrl() {
  const fromEnv = (process.env.COINFRENZY_CRON_BASE_URL || '').trim();
  return stripTrailingSlash(fromEnv || DEFAULT_BASE);
}

function getCronApiKey() {
  return (process.env.COINFRENZY_CRON_API_KEY || '').trim();
}

function buildAuthHeaders(includeJson) {
  const key = getCronApiKey();
  if (!key) return null;
  const h = {
    Authorization: `Bearer ${key}`,
    'X-Api-Key': key
  };
  if (includeJson) {
    h['Content-Type'] = 'application/json';
  }
  return h;
}

/**
 * @param {string} path - path after base, e.g. "/user/foo" or "/promocode"
 * @param {RequestInit} init
 * @returns {Promise<{ status: number, body: unknown, rawText: string }>}
 */
async function forwardToCoinfrenzy(path, init = {}) {
  const method = (init.method || 'GET').toUpperCase();
  const hasJsonBody =
    init.body != null &&
    init.body !== '' &&
    method !== 'GET' &&
    method !== 'HEAD';

  const headers = buildAuthHeaders(hasJsonBody);
  if (!headers) {
    const err = new Error('Missing COINFRENZY_CRON_API_KEY');
    err.statusCode = 500;
    throw err;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${getCronBaseUrl()}${normalizedPath}`;

  // Caller-supplied headers are merged BEFORE auth headers so they can add
  // extra context (e.g. Accept) but cannot override Authorization / X-Api-Key.
  const mergedHeaders = {
    ...(init.headers || {}),
    ...headers
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, {
      ...init,
      headers: mergedHeaders,
      signal: controller.signal
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      const timeoutErr = new Error(`Upstream request timed out after ${UPSTREAM_TIMEOUT_MS / 1000}s`);
      timeoutErr.statusCode = 504;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  const rawText = await res.text();
  let body = null;
  if (rawText) {
    try {
      body = JSON.parse(rawText);
    } catch {
      // Non-JSON upstream response (HTML error page, plain text, etc.)
      // Log server-side for diagnostics but never return raw content to callers
      // to avoid leaking upstream tokens, stack traces, or HTML error pages.
      console.warn('[coinfrenzy/upstream] non-JSON response', method, url, res.status, rawText.slice(0, 500));
      body = null;
    }
  }

  if (res.status >= 400) {
    console.warn('[coinfrenzy/upstream]', method, url, res.status, body);
  }

  return { status: res.status, body, rawText };
}

module.exports = {
  forwardToCoinfrenzy,
  getCronBaseUrl,
  getCronApiKey
};
