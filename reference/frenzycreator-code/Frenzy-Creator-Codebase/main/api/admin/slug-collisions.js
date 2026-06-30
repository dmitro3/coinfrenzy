/**
 * GET /api/admin/slug-collisions
 *
 * Admin-only report listing every campaign slug that's claimed by more than
 * one affiliate. Used by the admin "Data Integrity" panel so collisions
 * found in legacy data can be cleaned up manually before the new
 * server-side uniqueness check (api/partner/check-slug) blocks any new
 * duplicates.
 *
 * Headers:  X-Admin-Token (required)
 * Response: { collisions: [{ slug, owners: [{ email, fullname, campaignName, campaignId }] }] }
 */

const { createClient } = require('@supabase/supabase-js');
const { requireAdminAuth } = require('../_lib/adminAuth');
const { setCors } = require('../_lib/cors');
const { findAllCollisions } = require('../_lib/slugLookup');

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

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const collisions = await findAllCollisions(supabase);
    return res.status(200).json({ collisions });
  } catch (err) {
    console.error('[admin/slug-collisions]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
