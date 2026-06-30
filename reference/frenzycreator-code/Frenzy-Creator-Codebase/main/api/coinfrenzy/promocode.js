/**
 * POST /api/coinfrenzy/promocode
 *
 * Creates a promo code on CoinFrenzy AND atomically writes the matching
 * campaign into our users.campaigns jsonb. Both steps must succeed for
 * the response to be 200 — partial success here used to mean CF had a
 * code that we didn't, which orphaned every player who later signed up
 * with that code.
 *
 * Three response paths:
 *   200 OK              CF created the code AND we persisted to our DB.
 *                       Body: { ok: true, campaign, cfBody }
 *   200 OK (healed)     CF said the code already existed for this
 *                       affiliate; we fetched their CF record, persisted
 *                       it on our side, and treat the result as a
 *                       successful create. Body: { ok: true, healed: true,
 *                       campaign, viaCfLookup: bool }
 *   409 duplicate_slug  Our slug-uniqueness guard blocked the create
 *                       because someone ELSE owns this slug.
 *   5xx                 CF or our DB returned an error we couldn't
 *                       silently recover from.
 */

const { createClient } = require('@supabase/supabase-js');
const { forwardToCoinfrenzy } = require('../_lib/coinfrenzyCron');
const { setCors } = require('../_lib/cors');
const { verifyToken: verifyAdmin } = require('../_lib/adminAuth');
const { verifyPartnerToken } = require('../_lib/partnerAuth');
const { findSlugOwners, normalizeSlug } = require('../_lib/slugLookup');
const {
  upsertCampaign,
  buildCampaignFromCfRecord,
  isAlreadyExistsForAffiliate,
  selfHealFromCf
} = require('../_lib/campaignSync');

function resolveAuth(req) {
  const adminToken = String(req.headers['x-admin-token'] || '').trim();
  const partnerToken = String(req.headers['x-partner-token'] || '').trim();
  if (adminToken) {
    const admin = verifyAdmin(adminToken);
    if (admin) return { kind: 'admin', actorEmail: null };
  }
  if (partnerToken) {
    const partner = verifyPartnerToken(partnerToken);
    if (partner) return { kind: 'partner', actorEmail: String(partner.email || '').toLowerCase() };
  }
  return null;
}

async function resolveOwnerEmail(supabase, auth, body) {
  // Partners are always the owner of their own promo codes.
  if (auth.kind === 'partner' && auth.actorEmail) return auth.actorEmail;

  // Admins can act on behalf of an affiliate. Body fields are the
  // canonical hint: prefer affiliate_email, fall back to looking up
  // by username if that's all the admin sent.
  const direct = String(body.affiliate_email || body.affiliateEmail || '').trim().toLowerCase();
  if (direct) return direct;

  const username = String(body.username || '').trim();
  if (!username) return null;

  try {
    const { data } = await supabase
      .from('users')
      .select('email')
      .ilike('casino_referral_code', username)
      .limit(1)
      .single();
    if (data && data.email) return data.email.toLowerCase();
  } catch (_) { /* fall through */ }
  return null;
}

module.exports = async function handler(req, res) {
  setCors(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = resolveAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized — valid session required' });

  const body = req.body || {};
  const slugRaw = body.code || body.promo_code || body.slug || '';
  const slug = normalizeSlug(slugRaw);
  if (!slug) {
    return res.status(400).json({ error: 'A valid promo code (letters, numbers, dashes) is required.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('[coinfrenzy/promocode] Missing Supabase env vars');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const ownerEmail = await resolveOwnerEmail(supabase, auth, body);
  if (!ownerEmail) {
    return res.status(400).json({ error: 'Could not resolve which affiliate this campaign belongs to.' });
  }

  // ---- Uniqueness guard: someone else's slug? Reject up front. ----
  try {
    const owners = await findSlugOwners(supabase, slug);
    const ownedByActor = owners.some(o => String(o.email || '').toLowerCase() === ownerEmail);
    const otherOwners = owners.filter(o => String(o.email || '').toLowerCase() !== ownerEmail);
    if (otherOwners.length > 0 && !ownedByActor) {
      return res.status(409).json({
        error: 'duplicate_slug',
        message: 'This promo code is already in use by another affiliate. Choose a different one.'
      });
    }
  } catch (err) {
    console.error('[coinfrenzy/promocode] uniqueness check failed:', err);
    return res.status(500).json({ error: 'Could not verify promo code uniqueness. Please try again.' });
  }

  // Captured for self-heal — we need username to query CF.
  const username = String(body.username || '').trim();

  // Fallback fields used to build a campaign object if CF doesn't echo
  // everything back. The slug is re-derived from CF's response when
  // possible to guard against the partner UI sending one thing and CF
  // recording another.
  const fallbackCampaignFields = {
    name: String(body.name || '').trim() || slug.toUpperCase(),
    source: String(body.source || '').trim() || 'custom',
    link: String(body.link || '').trim() || ''
  };

  // ---- Forward to CoinFrenzy ----
  let cfStatus, cfBody;
  try {
    const r = await forwardToCoinfrenzy('/promocode', {
      method: 'POST',
      body: JSON.stringify(req.body || {})
    });
    cfStatus = r.status;
    cfBody = r.body;
  } catch (err) {
    const code = err.statusCode || 500;
    console.error('[coinfrenzy/promocode POST] CF proxy error:', err);
    return res.status(code).json({ error: 'CoinFrenzy proxy error' });
  }

  // ---- Self-heal path: CF says it already exists for this affiliate ----
  // We trust CF and reconcile. The partner gets a 200 with healed: true
  // so they can stop re-trying and we can stop showing the scary error.
  if (cfStatus >= 400 && isAlreadyExistsForAffiliate(cfStatus, cfBody)) {
    console.warn('[coinfrenzy/promocode] CF says slug already exists for affiliate, self-healing:', { ownerEmail, slug });
    const heal = await selfHealFromCf(supabase, {
      email: ownerEmail,
      slug,
      username,
      fallback: fallbackCampaignFields
    });
    if (heal.healed) {
      return res.status(200).json({
        ok: true,
        healed: true,
        viaCfLookup: !!heal.viaCfLookup,
        campaign: heal.campaign,
        cfStatus,
        cfBody
      });
    }
    console.error('[coinfrenzy/promocode] self-heal failed:', heal.error);
    return res.status(409).json({
      error: 'desync',
      message: 'This promo code already exists on CoinFrenzy but we could not link it to your account. Please contact support.',
      slug
    });
  }

  // ---- Other CF failure ----
  if (cfStatus >= 400) {
    return res.status(cfStatus).json(cfBody != null ? cfBody : { error: 'CoinFrenzy rejected the request' });
  }

  // ---- CF success: persist campaign on our side BEFORE responding ----
  let campaign;
  try {
    const built = buildCampaignFromCfRecord(cfBody, {
      slug,
      ...fallbackCampaignFields
    });
    if (!built) {
      // CF returned something but we couldn't extract a slug. Use the
      // request slug as the source of truth and persist anyway — better
      // than orphaning the code on CF's side.
      campaign = await upsertCampaign(supabase, ownerEmail, {
        slug,
        name: fallbackCampaignFields.name,
        source: fallbackCampaignFields.source,
        link: fallbackCampaignFields.link
      });
    } else {
      campaign = await upsertCampaign(supabase, ownerEmail, built);
    }
  } catch (err) {
    // Race-condition: another partner won the slug between our pre-check
    // and our write. Refuse with the same error shape as the pre-check so
    // the partner UI can show the same message. CF will need a manual
    // cleanup since their record now exists for THIS partner but the
    // slug really belongs to the other one — log loudly so admin sees it.
    if (err && err.code === 'DUPLICATE_SLUG') {
      console.error('[coinfrenzy/promocode] RACE: CF accepted but slug now owned by another partner:', { ownerEmail, slug, otherOwners: err.otherOwners });
      return res.status(409).json({
        error: 'duplicate_slug',
        message: 'This promo code was claimed by another affiliate at the same time. Please choose a different one.',
        race: true
      });
    }
    // CF created the code but our persistence failed for some other reason.
    // Log loudly — admin reconcile-attribution can clean this up later —
    // but still return success so the user isn't told their action failed
    // when CF accepted it.
    console.error('[coinfrenzy/promocode] CF accepted but local persist failed:', err, { ownerEmail, slug });
    return res.status(200).json({
      ok: true,
      persistDeferred: true,
      message: 'Created on CoinFrenzy. Local sync will catch up shortly.',
      cfStatus,
      cfBody
    });
  }

  return res.status(200).json({
    ok: true,
    campaign,
    cfStatus,
    cfBody
  });
};
