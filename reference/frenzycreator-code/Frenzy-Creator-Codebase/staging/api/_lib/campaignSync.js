/**
 * api/_lib/campaignSync.js
 *
 * Server-side persistence + self-heal for the campaigns array on
 * users.campaigns (jsonb). Created because the CoinFrenzy ↔ our DB sync
 * was relying on client-side localStorage writes after a successful
 * `/promocode` POST. Any tab close, network blip, or unhandled error
 * after CF accepted the create left CF holding a code we couldn't see —
 * which then made admin slug-lookup say "FREE" while CF refused
 * recreate with "promo code already exists for this affiliate", and
 * orphaned every player who later signed up with that code (because
 * `users.campaigns` had no entry to map the slug back to its owner).
 *
 * THIS module is the only correct place to add a campaign to a user's
 * jsonb. Anything client-side is now treated as a hint, not the truth.
 *
 * Exports:
 *   upsertCampaign(supabase, email, campaign)    - idempotent add by slug
 *   fetchCfUserCodes(username)                   - GET /user/:username, normalized
 *   selfHealFromCf(supabase, email, slug, ...)   - reconcile when CF says 409
 *   buildCampaignFromCfRecord(record, fallback)  - normalize CF response → our shape
 */

const { forwardToCoinfrenzy } = require('./coinfrenzyCron');
const { normalizeSlug } = require('./slugLookup');

/**
 * Pull the most useful id out of a CoinFrenzy response, regardless of
 * whether it came back at the top level, under `data`, or wrapped as
 * an array. Mirrors partner.html#extractCoinfrenzyRecordId.
 */
function extractCfId(obj) {
  if (!obj || typeof obj !== 'object') return '';
  const direct = obj.id != null ? obj.id : (obj.ID != null ? obj.ID : null);
  if (direct != null && String(direct) !== '') return String(direct);
  const nested = obj.data;
  if (nested && typeof nested === 'object') {
    const v = nested.id != null ? nested.id : nested.ID;
    if (v != null && String(v) !== '') return String(v);
  }
  return '';
}

/**
 * CoinFrenzy can hand back the user-codes list in several shapes
 * depending on the endpoint version. Pull every plausible array of
 * promo-code-shaped objects out of the payload defensively.
 */
function extractCfPromoArray(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const candidates = [
    payload.promocodes,
    payload.promo_codes,
    payload.codes,
    payload.data && payload.data.promocodes,
    payload.data && payload.data.promo_codes,
    payload.data && payload.data.codes,
    Array.isArray(payload.data) ? payload.data : null,
    Array.isArray(payload) ? payload : null
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }
  return [];
}

/**
 * Pull a slug out of a CF promocode record under any of the field
 * names CF has been seen to use. Returns the normalized form, or '' if
 * nothing slug-shaped is present.
 */
function extractRecordSlug(rec) {
  if (!rec || typeof rec !== 'object') return '';
  const raw =
    rec.code ||
    rec.promo_code ||
    rec.promocode ||
    rec.slug ||
    rec.name ||
    '';
  return normalizeSlug(raw);
}

/**
 * Build a campaign object in our internal shape from a CoinFrenzy
 * promocode record, falling back to caller-provided defaults for
 * fields CF doesn't echo back. The slug is the one piece we never
 * trust the caller for — we re-derive it from the CF record so a
 * partner can never end up with a stored campaign whose slug doesn't
 * match what CF actually has.
 */
function buildCampaignFromCfRecord(record, fallback) {
  const fb = fallback || {};
  const slug = extractRecordSlug(record) || normalizeSlug(fb.slug);
  if (!slug) return null;
  return {
    id: fb.id || ('camp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
    name: (record && (record.name || record.title)) || fb.name || slug.toUpperCase(),
    slug,
    source: (record && record.source) || fb.source || 'custom',
    link: fb.link || '',
    createdAt: (record && (record.created_at || record.createdAt)) || fb.createdAt || new Date().toISOString(),
    cf_promo_id: extractCfId(record) || fb.cf_promo_id || ''
  };
}

/**
 * Idempotently add (or replace by slug) a campaign on this user's
 * users.campaigns jsonb. If a campaign with the same normalized slug
 * already exists for this user, we MERGE rather than insert — this
 * keeps repeated self-heal calls safe to run.
 *
 * Returns the persisted campaign object (post-merge), or throws.
 */
async function upsertCampaign(supabase, email, campaign) {
  if (!campaign || typeof campaign !== 'object') {
    throw new Error('upsertCampaign: campaign object required');
  }
  const slug = normalizeSlug(campaign.slug);
  if (!slug) throw new Error('upsertCampaign: campaign.slug is required');

  const lowerEmail = String(email || '').trim().toLowerCase();
  if (!lowerEmail) throw new Error('upsertCampaign: email required');

  // RACE-CONDITION GUARD — re-check global slug ownership AT WRITE TIME.
  // Without this, two simultaneous create-promo requests for the same slug
  // could both pass the upstream check, both land at upsertCampaign, and
  // both write — giving us a real two-owner collision. We cannot use a
  // unique DB constraint because campaigns is a jsonb array, so this
  // application-level re-check is the safety net. If anyone else already
  // owns the slug, we throw — the caller surfaces "duplicate_slug" rather
  // than silently mis-attributing.
  try {
    const { findSlugOwners } = require('./slugLookup');
    const liveOwners = await findSlugOwners(supabase, slug, { includeInactive: true });
    const otherOwners = liveOwners.filter(o => String(o.email || '').toLowerCase() !== lowerEmail);
    if (otherOwners.length > 0) {
      const err = new Error('upsertCampaign: slug ' + slug + ' already owned by ' + otherOwners.map(o => o.email).join(','));
      err.code = 'DUPLICATE_SLUG';
      err.otherOwners = otherOwners;
      throw err;
    }
  } catch (raceErr) {
    if (raceErr && raceErr.code === 'DUPLICATE_SLUG') throw raceErr;
    // Don't fail the write just because the safety check itself errored.
    // Log loudly and continue — the upstream uniqueness check at
    // /api/coinfrenzy/promocode already covered the common case.
    console.warn('[campaignSync] race-check could not run, proceeding:', raceErr.message);
  }

  // Read current campaigns for this user
  const userRes = await supabase
    .from('users')
    .select('email, campaigns')
    .ilike('email', lowerEmail)
    .single();

  if (userRes.error || !userRes.data) {
    throw new Error('upsertCampaign: user not found for ' + lowerEmail);
  }

  let campaigns = userRes.data.campaigns;
  if (typeof campaigns === 'string') {
    try { campaigns = JSON.parse(campaigns); } catch { campaigns = []; }
  }
  if (!Array.isArray(campaigns)) campaigns = [];

  let merged = false;
  const next = campaigns.map(existing => {
    if (!existing || typeof existing !== 'object') return existing;
    if (normalizeSlug(existing.slug) === slug) {
      merged = true;
      return {
        // Keep existing id/createdAt to preserve client references; only
        // overwrite fields where the new value is meaningful.
        id: existing.id || campaign.id,
        name: campaign.name || existing.name,
        slug,
        source: campaign.source || existing.source,
        link: campaign.link || existing.link,
        createdAt: existing.createdAt || campaign.createdAt,
        cf_promo_id: campaign.cf_promo_id || existing.cf_promo_id || ''
      };
    }
    return existing;
  });

  if (!merged) {
    next.push({
      id: campaign.id || ('camp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
      name: campaign.name || slug.toUpperCase(),
      slug,
      source: campaign.source || 'custom',
      link: campaign.link || '',
      createdAt: campaign.createdAt || new Date().toISOString(),
      cf_promo_id: campaign.cf_promo_id || ''
    });
  }

  const updateRes = await supabase
    .from('users')
    .update({ campaigns: next })
    .ilike('email', lowerEmail);

  if (updateRes.error) {
    throw new Error('upsertCampaign: update failed: ' + updateRes.error.message);
  }

  // Return the persisted shape so callers can hand it back to the client.
  return next.find(c => normalizeSlug(c && c.slug) === slug) || null;
}

/**
 * Pull every promo code CoinFrenzy has registered for `username`. We
 * use this for self-heal and admin diagnostics. Returns:
 *   { ok: true, codes: [{ slug, cf_promo_id, name, source, raw }] }
 *   { ok: false, status, error }
 *
 * Tolerant of CF returning an envelope, an array, or a single object.
 */
async function fetchCfUserCodes(username) {
  const u = String(username || '').trim();
  if (!u) return { ok: false, status: 400, error: 'username required' };

  let res;
  try {
    res = await forwardToCoinfrenzy('/user/' + encodeURIComponent(u), { method: 'GET' });
  } catch (err) {
    return { ok: false, status: err.statusCode || 500, error: err.message || 'CF request failed' };
  }

  if (res.status >= 400) {
    return { ok: false, status: res.status, error: 'CF returned ' + res.status, raw: res.body };
  }

  const arr = extractCfPromoArray(res.body);
  const codes = arr
    .map(rec => {
      const slug = extractRecordSlug(rec);
      if (!slug) return null;
      return {
        slug,
        cf_promo_id: extractCfId(rec),
        name: (rec && (rec.name || rec.title)) || '',
        source: (rec && rec.source) || '',
        raw: rec
      };
    })
    .filter(Boolean);

  return { ok: true, codes, raw: res.body };
}

/**
 * Self-heal entry point. Called when CF replies that a promo code
 * already exists for this affiliate but our DB doesn't have it yet.
 *
 * Strategy:
 *   1. Try to fetch the affiliate's full code list from CF
 *      (GET /user/:username) and find the matching slug.
 *   2. If found, build a campaign object from the CF record and
 *      upsert into users.campaigns.
 *   3. If CF lookup fails or doesn't echo this slug, write a minimal
 *      campaign with the data we already had locally — the goal is
 *      "never leave a CF code unmapped on our side again."
 *
 * Returns:
 *   { healed: true, campaign }                 - repaired
 *   { healed: false, error }                   - couldn't even write a fallback
 */
async function selfHealFromCf(supabase, opts) {
  const email = String((opts && opts.email) || '').toLowerCase();
  const slug = normalizeSlug(opts && opts.slug);
  const username = (opts && opts.username) || '';
  const fallback = (opts && opts.fallback) || {};
  if (!email || !slug) {
    return { healed: false, error: 'selfHealFromCf: email + slug required' };
  }

  let cfRecord = null;

  if (username) {
    const lookup = await fetchCfUserCodes(username);
    if (lookup.ok) {
      cfRecord = lookup.codes.find(c => c.slug === slug) || null;
      if (cfRecord) {
        cfRecord = cfRecord.raw || cfRecord;
      }
    } else {
      console.warn('[campaignSync] CF user lookup failed during self-heal:', lookup.status, lookup.error);
    }
  }

  const campaign = buildCampaignFromCfRecord(cfRecord, {
    slug,
    name: fallback.name || slug.toUpperCase(),
    source: fallback.source || 'custom',
    link: fallback.link || ''
  });

  if (!campaign) {
    return { healed: false, error: 'could not construct campaign for slug ' + slug };
  }

  try {
    const persisted = await upsertCampaign(supabase, email, campaign);
    return { healed: true, campaign: persisted, viaCfLookup: !!cfRecord };
  } catch (err) {
    return { healed: false, error: err.message || 'upsert failed' };
  }
}

/**
 * Detect whether an upstream error is the "this slug already belongs
 * to this affiliate" case so callers know when to invoke self-heal.
 *
 * CF doesn't have a stable error code for this; surface text matching
 * of the messages they've been seen to send is the reliable signal.
 */
function isAlreadyExistsForAffiliate(status, body) {
  if (status !== 409 && status !== 400 && status !== 422) return false;
  const text = (() => {
    if (!body) return '';
    if (typeof body === 'string') return body;
    return [body.error, body.message, body.detail, body.reason]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  })();
  return /already exists for this affiliate|already exist.*for this affiliate|promo.*code.*already.*exist/i.test(text);
}

module.exports = {
  upsertCampaign,
  fetchCfUserCodes,
  selfHealFromCf,
  buildCampaignFromCfRecord,
  isAlreadyExistsForAffiliate,
  extractCfId,
  extractCfPromoArray,
  extractRecordSlug
};
