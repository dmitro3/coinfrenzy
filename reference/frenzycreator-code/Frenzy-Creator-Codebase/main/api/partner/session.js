/**
 * POST /api/partner/session
 *
 * Validates partner credentials (email + PIN) against the Supabase `users` table
 * using the service role key (so PIN never needs to be compared client-side) and
 * issues a short-lived HMAC-signed session token.
 *
 * Request body: { email: string, pin: string }
 * Response 200: { token: string, expiresIn: number }
 * Response 401: { error: 'Invalid credentials' }
 * Response 403: { error: 'Account not approved' }
 * Response 500: { error: 'Server configuration error' }
 *
 * Requires env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PARTNER_SESSION_SECRET
 */

const { createClient } = require('@supabase/supabase-js');
const { timingSafeEqual } = require('crypto');
const { issuePartnerToken } = require('../_lib/partnerAuth');
const { setCors } = require('../_lib/cors');

const SESSION_TTL_SECONDS = 24 * 60 * 60; // 24 hours

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
  const partnerSecret = process.env.PARTNER_SESSION_SECRET;

  if (!supabaseUrl || !supabaseServiceKey || !partnerSecret) {
    console.error('[partner/session] Missing required env vars');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const { email, pin } = req.body || {};

  if (!email || !pin || typeof email !== 'string' || typeof pin !== 'string') {
    return res.status(400).json({ error: 'email and pin are required' });
  }

  if (email.length > 320 || pin.length > 16) {
    return res.status(400).json({ error: 'Invalid credentials' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let userRow;
  try {
    const { data, error } = await supabase
      .from('users')
      .select('email, pin, status')
      .eq('email', email.trim().toLowerCase())
      .single();

    if (error || !data) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    userRow = data;
  } catch (err) {
    console.error('[partner/session] Supabase query error:', err);
    return res.status(500).json({ error: 'Server configuration error' });
  }

  if (!safeEqual(pin, userRow.pin)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (userRow.status !== 'approved') {
    return res.status(403).json({ error: 'Account not approved' });
  }

  let token;
  try {
    token = issuePartnerToken(userRow.email);
  } catch (err) {
    console.error('[partner/session] Token issue error:', err.message);
    return res.status(500).json({ error: 'Server configuration error' });
  }

  return res.status(200).json({
    token,
    expiresIn: SESSION_TTL_SECONDS,
    email: userRow.email
  });
};
