const { createClient } = require('@supabase/supabase-js');
const { timingSafeEqual } = require('crypto');

const FIELD_LIMITS = {
  player_id: 128,
  player_name: 256,
  player_email: 320,
  affiliate_username: 128,
  affiliate_email: 320,
  source: 64,
  promo_code_used: 64,
  status: 32
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function safeCompare(a, b) {
  try {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function validateFieldLengths(fields) {
  for (const [key, maxLen] of Object.entries(FIELD_LIMITS)) {
    const val = fields[key];
    if (val != null && typeof val === 'string' && val.length > maxLen) {
      return `Field '${key}' exceeds maximum length of ${maxLen}`;
    }
  }
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Api-Key');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const contentType = String(req.headers['content-type'] || '');
  if (!contentType.includes('application/json')) {
    return res.status(415).json({ error: 'Content-Type must be application/json' });
  }

  const expectedKey = (process.env.FRENZY_CREATOR_API_KEY || '').trim();
  if (!expectedKey) {
    console.error('[webhook/player-registration] Missing FRENZY_CREATOR_API_KEY');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const authHeader = String(req.headers['authorization'] || '');
  let token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    token = String(req.headers['x-api-key'] || '').trim();
  }

  if (!safeCompare(token, expectedKey)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body = req.body || {};
  const {
    player_id,
    player_name,
    player_email,
    affiliate_username,
    affiliate_email,
    signup_date,
    status,
    source,
    promo_code_used
  } = body;

  if (!player_id || !promo_code_used) {
    return res.status(400).json({
      error: 'Missing required fields',
      required: ['player_id', 'promo_code_used']
    });
  }

  if (typeof player_id !== 'string' || typeof promo_code_used !== 'string') {
    return res.status(400).json({ error: 'player_id and promo_code_used must be strings' });
  }

  const lengthError = validateFieldLengths(body);
  if (lengthError) {
    return res.status(400).json({ error: lengthError });
  }

  // Validate signup_date is ISO 8601 if provided; fall back to server time
  let resolvedSignupDate = new Date().toISOString();
  if (signup_date) {
    if (typeof signup_date !== 'string' || !ISO_DATE_RE.test(signup_date)) {
      return res.status(400).json({ error: 'signup_date must be an ISO 8601 datetime string' });
    }
    resolvedSignupDate = signup_date;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[webhook/player-registration] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const normalizedPromo = promo_code_used.toLowerCase();

    // Resolve affiliate_email from promo code if not provided
    let resolvedAffiliateEmail = affiliate_email || null;
    if (!resolvedAffiliateEmail && normalizedPromo) {
      try {
        const { data: ownerRow } = await supabase
          .from('users')
          .select('email')
          .contains('campaigns', [{ slug: normalizedPromo }])
          .limit(1)
          .single();
        if (ownerRow && ownerRow.email) {
          resolvedAffiliateEmail = ownerRow.email;
          console.log('[webhook/player-registration] Resolved affiliate_email from promo code:', resolvedAffiliateEmail);
        }
      } catch (lookupErr) {
        console.log('[webhook/player-registration] Promo code owner lookup returned no match');
      }
    }

    const { error } = await supabase
      .from('players')
      .upsert({
        player_id,
        player_name: player_name || null,
        player_email: player_email || null,
        affiliate_username: affiliate_username || null,
        affiliate_email: resolvedAffiliateEmail,
        signup_date: resolvedSignupDate,
        status: status || 'active',
        source: source || 'PROMO_CODE',
        promo_code_used: normalizedPromo
      }, { onConflict: 'player_id' });

    if (error) {
      console.error('[webhook/player-registration] Supabase upsert error:', error);
      return res.status(500).json({ error: 'Failed to save player registration' });
    }

    // Auto-create L2 relationship if the promo code owner was referred by another affiliate
    if (resolvedAffiliateEmail) {
      try {
        const { data: affiliateUser } = await supabase
          .from('users')
          .select('email, l2_enabled')
          .eq('email', resolvedAffiliateEmail)
          .single();

        if (affiliateUser) {
          // Check if this affiliate was themselves referred by another affiliate (player record exists)
          const { data: affiliateAsPlayer } = await supabase
            .from('players')
            .select('affiliate_email')
            .eq('player_email', resolvedAffiliateEmail)
            .not('affiliate_email', 'is', null)
            .limit(1)
            .single();

          if (affiliateAsPlayer && affiliateAsPlayer.affiliate_email) {
            const parentEmail = affiliateAsPlayer.affiliate_email;
            // Check parent has L2 enabled
            const { data: parentUser } = await supabase
              .from('users')
              .select('l2_enabled')
              .eq('email', parentEmail)
              .single();

            if (parentUser && parentUser.l2_enabled) {
              await supabase
                .from('level2_relationships')
                .upsert({
                  parent_affiliate: parentEmail,
                  child_affiliate: resolvedAffiliateEmail
                }, { onConflict: 'parent_affiliate,child_affiliate', ignoreDuplicates: true });
              console.log('[webhook/player-registration] L2 relationship ensured:', parentEmail, '->', resolvedAffiliateEmail);
            }
          }
        }
      } catch (l2Err) {
        console.log('[webhook/player-registration] L2 auto-link skipped:', l2Err.message);
      }
    }

    return res.status(200).json({ success: true, player_id });
  } catch (err) {
    console.error('[webhook/player-registration] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
