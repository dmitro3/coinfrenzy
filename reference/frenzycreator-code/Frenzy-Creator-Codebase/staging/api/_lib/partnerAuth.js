/**
 * Server-side partner session token validator.
 *
 * Tokens are issued by POST /api/partner/session after the server validates
 * partner credentials (email + PIN) against the Supabase `users` table.
 * Tokens are HMAC-SHA256 signed with PARTNER_SESSION_SECRET and expire in 24 hours.
 *
 * Usage in a route handler:
 *   const { requirePartnerAuth } = require('../../_lib/partnerAuth');
 *   const partner = requirePartnerAuth(req, res);
 *   if (!partner) return; // 401 already sent
 */

const { createHmac, timingSafeEqual } = require('crypto');

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getSecret() {
  const s = (process.env.PARTNER_SESSION_SECRET || '').trim();
  if (s) return s;
  const fallback = (process.env.SUPABASE_SERVICE_ROLE_KEY || 'fallback-partner-secret').trim();
  return createHmac('sha256', 'frenzy-partner-session').update(fallback).digest('hex');
}

/**
 * Produces a signed token string: `email:expiry:hmac`
 * @param {string} email
 * @returns {string}
 */
function issuePartnerToken(email) {
  const expiry = Date.now() + SESSION_TTL_MS;
  const payload = `${email}:${expiry}`;
  const mac = createHmac('sha256', getSecret()).update(payload).digest('hex');
  return `${payload}:${mac}`;
}

/**
 * Verifies a partner token. Returns `{ email, expiry }` or null.
 * @param {string} token
 * @returns {{ email: string, expiry: number } | null}
 */
function verifyPartnerToken(token) {
  if (!token || typeof token !== 'string') return null;
  const colonIdx = token.lastIndexOf(':');
  if (colonIdx === -1) return null;

  const providedMac = token.slice(colonIdx + 1);
  const rest = token.slice(0, colonIdx);
  const lastColon = rest.lastIndexOf(':');
  if (lastColon === -1) return null;

  const email = rest.slice(0, lastColon);
  const expiryStr = rest.slice(lastColon + 1);
  const expiry = parseInt(expiryStr, 10);

  if (!email || isNaN(expiry)) return null;
  if (Date.now() > expiry) return null;

  const payload = `${email}:${expiry}`;
  let expectedMac;
  try {
    expectedMac = createHmac('sha256', getSecret()).update(payload).digest('hex');
  } catch {
    return null;
  }

  try {
    const a = Buffer.from(providedMac);
    const b = Buffer.from(expectedMac);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  return { email, expiry };
}

/**
 * Middleware: validates X-Partner-Token header.
 * Returns { email } on success, null + sends 401 on failure.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @returns {{ email: string } | null}
 */
function requirePartnerAuth(req, res) {
  const token = String(req.headers['x-partner-token'] || '').trim();
  const result = verifyPartnerToken(token);
  if (!result) {
    res.status(401).json({ error: 'Unauthorized — valid partner session required' });
    return null;
  }
  return result;
}

module.exports = { issuePartnerToken, verifyPartnerToken, requirePartnerAuth };
