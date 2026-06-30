/**
 * GET /api/admin/slug-lookup?slug=<slug>
 *
 * Admin tool: "Who owns this promo code?" Searches across every user
 * (approved, pending, denied, revision_required, deleted-but-still-row)
 * and returns every owner with their status.
 *
 * This exists because the partner-side check tells Jerry "this code is
 * already in use" without naming the holder (privacy), and the collision
 * report only surfaces 2+ owners. So when a partner is mysteriously
 * blocked from claiming a slug, admin uses THIS endpoint to find the
 * single owner that's blocking them.
 *
 * Headers:  X-Admin-Token (required)
 * Query:    slug=string
 * Response: {
 *   slug,
 *   owners: [{ email, fullname, status }],
 *   blockingOwners: [...],   // subset that still actively reserve the slug
 *   inactiveOwners: [...]    // ghosts; informational only
 * }
 */

const { createClient } = require('@supabase/supabase-js');
const { requireAdminAuth } = require('../_lib/adminAuth');
const { setCors } = require('../_lib/cors');
const { findSlugOwners, normalizeSlug, isBlockingStatus } = require('../_lib/slugLookup');

module.exports = async function handler(req, res) {
  setCors(res, 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const admin = requireAdminAuth(req, res);
  if (!admin) return;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const rawSlug = (req.query && req.query.slug) || '';
  const normalized = normalizeSlug(rawSlug);
  if (!normalized) {
    return res.status(400).json({ error: 'slug query param required (a-z, 0-9, -)' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const owners = await findSlugOwners(supabase, normalized, { includeInactive: true });
    const blockingOwners = owners.filter(o => isBlockingStatus(o.status));
    const inactiveOwners = owners.filter(o => !isBlockingStatus(o.status));
    return res.status(200).json({
      slug: normalized,
      owners,
      blockingOwners,
      inactiveOwners,
      taken: blockingOwners.length > 0
    });
  } catch (err) {
    console.error('[admin/slug-lookup]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
