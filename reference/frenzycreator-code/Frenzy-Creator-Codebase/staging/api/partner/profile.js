/**
 * /api/partner/profile
 *
 * GET  — returns the authenticated affiliate's own user row (safe fields only).
 * POST — updates allowed fields on the affiliate's own user row.
 *
 * Headers: X-Partner-Token (required for both)
 *
 * GET  Response 200: { user: { email, status, fullname, phone, ... } }
 * POST Body: { fields: { phone?, pin?, campaigns?, messages?, ... } }
 * POST Response 200: { ok: true }
 */

const { createClient } = require('@supabase/supabase-js');
const { requirePartnerAuth } = require('../_lib/partnerAuth');
const { setCors } = require('../_lib/cors');

const SAFE_SELECT_FIELDS = [
  'email', 'fullname', 'phone', 'pin', 'discord', 'status',
  'iscreator', 'isvip', 'onboardingcomplete', 'signature', 'messages',
  'campaigns', 'rev_share_l1', 'rev_share_l2', 'l2_enabled',
  'casino_referral_code', 'coinfrenzy_affiliate_id',
  'revision_note', 'revision_sent_at',
  'registeredat', 'approvedat', 'created_at'
].join(', ');

const WRITABLE_FIELDS = new Set([
  'fullname', 'phone', 'pin', 'discord', 'campaigns', 'messages',
  'signature', 'onboardingcomplete', 'casino_referral_code',
  'referral_source', 'referral_detail', 'revision_note', 'revision_sent_at'
]);

module.exports = async function handler(req, res) {
  setCors(res, 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const partner = requirePartnerAuth(req, res);
  if (!partner) return;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const email = partner.email.toLowerCase();

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('users')
        .select(SAFE_SELECT_FIELDS)
        .eq('email', email)
        .single();

      if (error || !data) {
        return res.status(404).json({ error: 'User not found' });
      }

      return res.status(200).json({ user: data });
    } catch (err) {
      console.error('[partner/profile GET]', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method === 'POST') {
    const { fields } = req.body || {};
    if (!fields || typeof fields !== 'object') {
      return res.status(400).json({ error: 'fields object is required' });
    }

    const safeUpdate = {};
    for (const [key, val] of Object.entries(fields)) {
      if (WRITABLE_FIELDS.has(key)) {
        safeUpdate[key] = val;
      }
    }

    if (Object.keys(safeUpdate).length === 0) {
      return res.status(400).json({ error: 'No writable fields provided' });
    }

    // Never allow status changes through the partner endpoint
    delete safeUpdate.status;

    try {
      const { error } = await supabase
        .from('users')
        .update(safeUpdate)
        .eq('email', email);

      if (error) {
        console.error('[partner/profile POST] Update error:', error);
        return res.status(500).json({ error: 'Failed to update profile' });
      }

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('[partner/profile POST]', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
