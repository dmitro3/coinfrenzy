/**
 * POST /api/partner/register
 *
 * Handles new affiliate registration server-side:
 *   1. Checks for duplicate email/phone
 *   2. Inserts the new user row with status='pending'
 *   3. Updates additional fields after insert
 *
 * No auth token required (registration is open).
 *
 * Request body: { user: { fullName, email, phone, pin, discord, ... } }
 * Response 200: { ok: true }
 * Response 409: { error: 'duplicate', message: '...' }
 */

const { createClient } = require('@supabase/supabase-js');
const { setCors } = require('../_lib/cors');

module.exports = async function handler(req, res) {
  setCors(res, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { user } = req.body || {};

  if (!user || !user.email) {
    return res.status(400).json({ error: 'user.email is required' });
  }

  const email = user.email.trim().toLowerCase();
  const phone = (user.phone || '').trim();

  try {
    // Duplicate check
    let orFilter = 'email.eq.' + email;
    if (phone) orFilter += ',phone.eq.' + phone;

    const { data: existing } = await supabase
      .from('users')
      .select('email')
      .or(orFilter)
      .limit(1);

    if (existing && existing.length > 0) {
      return res.status(409).json({
        error: 'duplicate',
        message: 'An account with this email or phone already exists. Please sign in.'
      });
    }

    // Insert minimal row
    const minimalData = {
      fullname: user.fullName || '',
      email: email,
      phone: phone,
      pin: user.pin || '0000',
      status: 'pending',
      casino_referral_code: user.casinoReferralCode || '',
      registeredat: user.registeredAt || new Date().toISOString()
    };

    const { error: insertError } = await supabase
      .from('users')
      .insert([minimalData]);

    if (insertError) {
      if (insertError.code === '23505' || (insertError.message && insertError.message.includes('duplicate'))) {
        return res.status(409).json({
          error: 'duplicate',
          message: 'An account with this email already exists.'
        });
      }
      console.error('[partner/register] Insert error:', insertError);
      return res.status(500).json({ error: 'Registration failed' });
    }

    // Update with additional fields
    const extraData = {};
    if (user.discord) extraData.discord = user.discord;
    if (user.isCreator !== undefined) extraData.iscreator = !!user.isCreator;
    if (user.referralSource) extraData.referral_source = user.referralSource;
    if (user.referralDetail) extraData.referral_detail = user.referralDetail;

    if (user.agreement && user.agreement.signatureImage) {
      const sig = user.agreement.signatureImage;
      if (sig.length < 500000) {
        extraData.signature = sig;
      }
    }

    if (Object.keys(extraData).length > 0) {
      await supabase.from('users').update(extraData).eq('email', email);
    }

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('[partner/register] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
