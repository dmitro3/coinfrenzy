/**
 * POST /api/partner/lookup
 *
 * Looks up a user by email or phone for the login flow.
 * Returns the user's profile data if found (no password/secret fields exposed
 * beyond what the user themselves entered).
 *
 * This replaces the direct `supabaseClient.from('users').select('*').eq('email', ...)`
 * call that previously ran with the anon key in the browser.
 *
 * Request body: { identifier: string }  (email or phone)
 * Response 200: { user: { ... } }
 * Response 404: { error: 'not_found' }
 */

const { createClient } = require('@supabase/supabase-js');
const { setCors } = require('../_lib/cors');

const SAFE_FIELDS = [
  'email', 'fullname', 'phone', 'pin', 'discord', 'status',
  'iscreator', 'isvip', 'onboardingcomplete', 'signature', 'messages',
  'campaigns', 'rev_share_l1', 'rev_share_l2', 'l2_enabled',
  'casino_referral_code', 'coinfrenzy_affiliate_id',
  'revision_note', 'revision_sent_at',
  'registeredat', 'approvedat', 'created_at'
].join(', ');

module.exports = async function handler(req, res) {
  setCors(res, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const { identifier } = req.body || {};
  if (!identifier || typeof identifier !== 'string') {
    return res.status(400).json({ error: 'identifier is required' });
  }

  const clean = identifier.trim().toLowerCase();
  if (clean.length > 320) {
    return res.status(400).json({ error: 'Invalid identifier' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const isEmail = clean.includes('@');
    const { data, error } = await supabase
      .from('users')
      .select(SAFE_FIELDS)
      .eq(isEmail ? 'email' : 'phone', clean)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'not_found' });
    }

    return res.status(200).json({ user: data });
  } catch (err) {
    console.error('[partner/lookup]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
