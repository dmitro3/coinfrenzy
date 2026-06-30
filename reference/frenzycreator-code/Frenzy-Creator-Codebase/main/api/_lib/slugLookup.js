/**
 * api/_lib/slugLookup.js
 *
 * Server-side promo-code (campaign slug) ownership lookup.
 *
 * The browser localStorage check that used to live in partner.html
 * (`isPromoCodeTakenGlobally`) was structurally broken: it could only see
 * users whose data happened to be cached in THAT browser. So a brand-new
 * partner saw "available" for slugs that were already taken globally, and
 * a returning partner saw "taken" for slugs that had been deleted long ago.
 *
 * This module is the only authoritative source. Both:
 *   - `/api/partner/check-slug` (live availability check while typing), and
 *   - `/api/coinfrenzy/promocode` (final guard before forwarding to CF)
 * MUST go through findSlugOwners() so a duplicate cannot slip through any
 * code path.
 */

const NORMALIZE_RE = /[^a-z0-9-]/g;

// Statuses that should NEVER block another partner from claiming a slug.
// A pending/denied/revision-required ghost record holding "jerry" was the
// exact reason real-partner Jerry kept getting "this code is already in
// use" when his own backend showed nothing — that record was invisible to
// him because he isn't its owner, and inactive because the user isn't
// approved. Only approved partners can hold a slug.
const BLOCKING_STATUSES = new Set(['approved']);

function isBlockingStatus(status) {
  return BLOCKING_STATUSES.has(String(status || '').toLowerCase());
}

/**
 * Normalize a slug exactly like partner.html does on input
 * (lowercase, strip non-[a-z0-9-], cap at 30 chars). Anything that
 * normalizes to empty is treated as invalid.
 */
function normalizeSlug(raw) {
  if (raw == null) return '';
  return String(raw).trim().toLowerCase().replace(NORMALIZE_RE, '').slice(0, 30);
}

/**
 * Return every user (email + display name) that owns a campaign with this
 * exact slug. An empty array means the slug is free.
 *
 * Implementation note: users.campaigns is a jsonb array of objects, so we
 * use the Postgres `@>` containment operator via Supabase's `contains()`
 * for an indexable lookup. Falls back to a JS scan if that fails (e.g. a
 * malformed campaigns row prevents the operator from matching).
 */
async function findSlugOwners(supabase, slug, opts) {
  const normalized = normalizeSlug(slug);
  if (!normalized) return [];

  // includeInactive=true returns ALL owners (admin tooling); default
  // (false) returns only approved partners (production guard).
  const includeInactive = !!(opts && opts.includeInactive);

  // Primary: jsonb containment query
  try {
    const { data, error } = await supabase
      .from('users')
      .select('email, fullname, status, campaigns')
      .contains('campaigns', [{ slug: normalized }]);
    if (!error && Array.isArray(data)) {
      const all = data.map(u => ({
        email: u.email,
        fullname: u.fullname || '',
        status: u.status || ''
      }));
      const filtered = includeInactive
        ? all
        : all.filter(o => isBlockingStatus(o.status));
      // If the containment query returned NO rows at all, trust it and
      // skip the slow scan. If it returned rows but the active filter
      // emptied them out, also trust it.
      if (data.length === 0 || filtered.length > 0 || includeInactive) {
        return filtered;
      }
      // data.length > 0 but no approved owners -> truly free for new
      // claims, but skip the fallback scan since we already know the
      // jsonb containment found everything.
      return filtered;
    }
    if (error) {
      console.warn('[slugLookup] containment query failed, falling back to scan:', error.message);
    }
  } catch (err) {
    console.warn('[slugLookup] containment query threw, falling back to scan:', err.message);
  }

  // Fallback: paginate through users and JS-scan campaigns. Slow but safe.
  const owners = [];
  const pageSize = 500;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('users')
      .select('email, fullname, status, campaigns')
      .not('campaigns', 'is', null)
      .range(offset, offset + pageSize - 1);
    if (error) {
      console.error('[slugLookup] scan fallback failed:', error);
      return owners;
    }
    const rows = data || [];
    for (const u of rows) {
      let camps = u.campaigns;
      if (typeof camps === 'string') {
        try { camps = JSON.parse(camps); } catch { camps = null; }
      }
      if (!Array.isArray(camps)) continue;
      for (const c of camps) {
        if (c && typeof c === 'object' && normalizeSlug(c.slug) === normalized) {
          if (includeInactive || isBlockingStatus(u.status)) {
            owners.push({
              email: u.email,
              fullname: u.fullname || '',
              status: u.status || ''
            });
          }
          break;
        }
      }
    }
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return owners;
}

/**
 * Convenience: { taken, ownedByMe, owners } for a single slug, scoped to
 * the requesting affiliate. `myEmail` is lowercased for comparison.
 */
async function checkSlugAvailability(supabase, slug, myEmail) {
  const owners = await findSlugOwners(supabase, slug);
  const me = String(myEmail || '').trim().toLowerCase();
  const ownedByMe = owners.some(o => String(o.email || '').toLowerCase() === me);
  // Take just owners that are NOT me, since the partner UI only cares about
  // collisions with OTHER affiliates.
  const others = owners.filter(o => String(o.email || '').toLowerCase() !== me);
  return {
    slug: normalizeSlug(slug),
    taken: others.length > 0,
    ownedByMe,
    otherOwnerCount: others.length
  };
}

/**
 * Scan every user's campaigns and return groups of slugs claimed by more
 * than one affiliate. Used by the admin "data integrity" / collision report.
 */
async function findAllCollisions(supabase) {
  const bySlug = Object.create(null);
  const pageSize = 500;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('users')
      .select('email, fullname, status, campaigns')
      .not('campaigns', 'is', null)
      .range(offset, offset + pageSize - 1);
    if (error) {
      console.error('[slugLookup] collision scan error:', error);
      break;
    }
    const rows = data || [];
    for (const u of rows) {
      let camps = u.campaigns;
      if (typeof camps === 'string') {
        try { camps = JSON.parse(camps); } catch { camps = null; }
      }
      if (!Array.isArray(camps)) continue;
      const seenSlugsForUser = Object.create(null);
      for (const c of camps) {
        if (!c || typeof c !== 'object') continue;
        const s = normalizeSlug(c.slug);
        if (!s) continue;
        if (seenSlugsForUser[s]) continue; // count each user once per slug
        seenSlugsForUser[s] = true;
        if (!bySlug[s]) bySlug[s] = [];
        bySlug[s].push({
          email: u.email,
          fullname: u.fullname || '',
          status: u.status || '',
          campaignName: c.name || '',
          campaignId: c.id || ''
        });
      }
    }
    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  // Surface ANY slug with 2+ owners regardless of status. Each owner row
  // includes status so admin can immediately see whether a collision is a
  // real split (multiple approved partners), a ghost (pending/denied/
  // revision_required holding a code), or both. The active-only block in
  // findSlugOwners now prevents ghosts from blocking new claims, but they
  // should still be cleaned up.
  const collisions = [];
  Object.keys(bySlug).forEach(slug => {
    if (bySlug[slug].length > 1) {
      collisions.push({ slug, owners: bySlug[slug] });
    }
  });
  collisions.sort((a, b) => b.owners.length - a.owners.length || a.slug.localeCompare(b.slug));
  return collisions;
}

module.exports = {
  normalizeSlug,
  findSlugOwners,
  checkSlugAvailability,
  findAllCollisions,
  isBlockingStatus
};
