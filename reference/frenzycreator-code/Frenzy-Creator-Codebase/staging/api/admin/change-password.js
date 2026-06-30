const { createClient } = require('@supabase/supabase-js');
const { timingSafeEqual } = require('crypto');
const { requireAdminAuth } = require('../_lib/adminAuth');
const { setCors } = require('../_lib/cors');

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

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const admin = requireAdminAuth(req, res);
  if (!admin) return;

  const { current_password, new_password, target_username } = req.body || {};

  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'current_password and new_password are required' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const usernameToUpdate = target_username || admin.username;

  const { data: adminRow, error: fetchErr } = await supabase
    .from('admins')
    .select('username, password_hash, role')
    .eq('username', admin.username)
    .single();

  if (fetchErr || !adminRow) {
    return res.status(401).json({ error: 'Admin account not found' });
  }

  if (!safeEqual(current_password, adminRow.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  if (usernameToUpdate !== admin.username && adminRow.role !== 'master') {
    return res.status(403).json({ error: 'Only master admins can change other accounts' });
  }

  const { error: updateErr } = await supabase
    .from('admins')
    .update({ password_hash: new_password })
    .eq('username', usernameToUpdate);

  if (updateErr) {
    console.error('[admin/change-password] Update error:', updateErr);
    return res.status(500).json({ error: 'Failed to update password' });
  }

  return res.status(200).json({ success: true, message: 'Password updated' });
};
