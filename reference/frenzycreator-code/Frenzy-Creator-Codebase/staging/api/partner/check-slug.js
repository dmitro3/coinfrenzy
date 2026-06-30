/**
 * POST /api/partner/check-slug
 *
 * Tells the partner UI whether a campaign slug is available globally.
 * Replaces the old localStorage-only check that produced false positives
 * (slugs marked "taken" because another user's data was cached locally) and
 * false negatives (real collisions invisible because the other affiliate
 * hadn't logged in on this browser).
 *
 * Headers:  X-Partner-Token (required)
 * Body:     { slug: string }
 * Response: { slug, taken, ownedByMe, otherOwnerCount }
 *
 * Privacy note: we deliberately do NOT return the email of the other owner
 * to a partner — that would leak which affiliates exist. Admins use a
 * separate endpoint for the full collision report.
 */

const { createClient } = require('@supabase/supabase-js');
const { requirePartnerAuth } = require('../_lib/partnerAuth');
const { setCors } = require('../_lib/cors');
const { checkSlugAvailability, normalizeSlug } = require('../_lib/slugLookup');

module.exports = async function handler(req, res) {
  setCors(res, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const partner = requirePartnerAuth(req, res);
  if (!partner) return;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const { slug } = req.body || {};
  const normalized = normalizeSlug(slug);
  if (!normalized) {
    return res.status(400).json({ error: 'slug must contain at least one [a-z0-9-] character' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const result = await checkSlugAvailability(supabase, normalized, partner.email);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[partner/check-slug]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
