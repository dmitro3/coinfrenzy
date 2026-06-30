/**
 * POST /api/admin/session
 *
 * Validates admin credentials against the Supabase `admins` table (server-side,
 * using the service role key so the browser never reads that table directly) and
 * issues a short-lived HMAC-signed session token.
 *
 * Request body: { username: string, password: string }
 * Response 200: { token: string, expiresIn: number }  (expiresIn in seconds)
 * Response 401: { error: 'Invalid credentials' }
 * Response 500: { error: 'Server configuration error' }
 *
 * Requires env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_SESSION_SECRET
 */

const { createClient } = require('@supabase/supabase-js');
const { timingSafeEqual } = require('crypto');
const { issueToken } = require('../_lib/adminAuth');
const { setCors } = require('../_lib/cors');

const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 hours

function safeEqual(a, b) {
  try {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

module.exports = async function handler(req, res) {
  setCors(res, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const contentType = String(req.headers['content-type'] || '');
  if (!contentType.includes('application/json')) {
    return res.status(415).json({ error: 'Content-Type must be application/json' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[admin/session] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return res.status(500).json({ error: 'Server configuration error: missing Supabase credentials' });
  }

  if (!process.env.ADMIN_SESSION_SECRET) {
    console.warn('[admin/session] ADMIN_SESSION_SECRET not set — using fallback derived from service key');
  }

  const { username, password } = req.body || {};

  if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'username and password are required' });
  }

  if (username.length > 128 || password.length > 256) {
    return res.status(400).json({ error: 'Invalid credentials' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let adminRow;
  try {
    const { data, error } = await supabase
      .from('admins')
      .select('username, password_hash, role, display_name')
      .eq('username', username.trim().toLowerCase())
      .single();

    if (error || !data) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    adminRow = data;
  } catch (err) {
    console.error('[admin/session] Supabase query error:', err);
    return res.status(500).json({ error: 'Server configuration error' });
  }

  if (!safeEqual(password, adminRow.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  let token;
  try {
    token = issueToken(adminRow.username);
  } catch (err) {
    console.error('[admin/session] Token issue error:', err.message);
    return res.status(500).json({ error: 'Server configuration error' });
  }

  return res.status(200).json({
    token,
    expiresIn: SESSION_TTL_SECONDS,
    username: adminRow.username,
    role: adminRow.role || 'admin',
    displayName: adminRow.display_name || adminRow.username
  });
};
