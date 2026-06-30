/**
 * Shared CORS helper for same-origin proxy routes.
 *
 * Set ALLOWED_ORIGIN in Vercel env vars to your production domain.
 * Defaults to https://frenzycreator.com.
 *
 * The webhook (/api/webhook/*) is called server-to-server by CoinFrenzy
 * and does not use this helper — it relies on bearer token auth instead.
 */
const ALLOWED_ORIGIN = (process.env.ALLOWED_ORIGIN || 'https://frenzycreator.com').trim();

/**
 * @param {import('http').ServerResponse} res
 * @param {string} methods  e.g. 'GET, OPTIONS' or 'POST, OPTIONS'
 */
function setCors(res, methods) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token, X-Partner-Token');
}

module.exports = { setCors, ALLOWED_ORIGIN };
