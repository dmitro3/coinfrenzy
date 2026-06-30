/**
 * Server-side admin session token validator.
 *
 * Tokens are issued by POST /api/admin/session after the server validates
 * credentials against the Supabase `admins` table using the service role key.
 * Tokens are HMAC-SHA256 signed with ADMIN_SESSION_SECRET and expire in 8 hours.
 *
 * Usage in a route handler:
 *   const { requireAdminAuth } = require('../_lib/adminAuth');
 *   const admin = requireAdminAuth(req, res);
 *   if (!admin) return; // 401 already sent
 */

const { createHmac, timingSafeEqual } = require('crypto');

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function getSecret() {
  const s = (process.env.ADMIN_SESSION_SECRET || '').trim();
  if (s) return s;
  const fallback = (process.env.SUPABASE_SERVICE_ROLE_KEY || 'fallback-secret').trim();
  return createHmac('sha256', 'frenzy-admin-session').update(fallback).digest('hex');
}

/**
 * Produces a signed token string: `username:expiry:hmac`
 * @param {string} username
 * @returns {string}
 */
function issueToken(username) {
  const expiry = Date.now() + SESSION_TTL_MS;
  const payload = `${username}:${expiry}`;
  const mac = createHmac('sha256', getSecret()).update(payload).digest('hex');
  return `${payload}:${mac}`;
}

/**
 * Verifies a token. Returns `{ username, expiry }` on success, null on failure.
 * Uses timingSafeEqual to prevent timing attacks.
 * @param {string} token
 * @returns {{ username: string, expiry: number } | null}
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split(':');
  if (parts.length !== 3) return null;

  const [username, expiryStr, providedMac] = parts;
  const expiry = parseInt(expiryStr, 10);
  if (!username || isNaN(expiry)) return null;
  if (Date.now() > expiry) return null;

  const payload = `${username}:${expiry}`;
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

  return { username, expiry };
}

/**
 * Express/Vercel middleware: reads X-Admin-Token header and validates it.
 * Sends 401 and returns null if invalid; returns { username } if valid.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @returns {{ username: string } | null}
 */
function requireAdminAuth(req, res) {
  const token = String(req.headers['x-admin-token'] || '').trim();
  const result = verifyToken(token);
  if (!result) {
    res.status(401).json({ error: 'Unauthorized — valid admin session required' });
    return null;
  }
  return result;
}

module.exports = { issueToken, verifyToken, requireAdminAuth };
