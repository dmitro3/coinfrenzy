/**
 * POST /api/admin/set-sponsor
 *
 * Move a child affiliate under a different sponsor (parent in the L2
 * hierarchy). This is the canonical "re-parent" operation — every other
 * UI that needs to change attribution should call here.
 *
 * Body:
 *   {
 *     child_email:  string  (required, the affiliate being moved)
 *     parent_email: string|null  (sponsor email, or null/'coinfrenzy' to
 *                                 mark the child as un-sponsored / direct
 *                                 under CoinFrenzy)
 *     l2_percent:   number   (optional, defaults to global rev_share_l2_default)
 *   }
 *
 * What happens:
 *   1. The child's existing level2_relationships row (if any) is deleted.
 *   2. If parent_email is provided and not "coinfrenzy", a new row is
 *      inserted with the requested l2_percent (or the global default).
 *   3. The new parent's `users.l2_enabled` flag is forced to true so the
 *      partner-side UI immediately shows the sub-affiliate breakdown.
 *
 * Guardrails:
 *   - Child cannot be its own parent.
 *   - Cycle prevention: parent's full ancestry is walked; if child
 *     appears anywhere up the chain, the move is rejected.
 *   - Both child and parent must exist in `users` (lookup is case-
 *     insensitive on email).
 *
 * Idempotent: setting the same parent twice is a no-op (the upsert path
 * handles it cleanly).
 */

const { createClient } = require('@supabase/supabase-js');
const { requireAdminAuth } = require('../_lib/adminAuth');
const { setCors } = require('../_lib/cors');

const SENTINEL_NONE = new Set(['coinfrenzy', 'coin frenzy', 'none', 'null', '']);

function norm(email) {
  return String(email || '').trim().toLowerCase();
}

function isSentinelNoSponsor(value) {
  if (value === null || value === undefined) return true;
  return SENTINEL_NONE.has(norm(value));
}

/**
 * Walk up from `start` following parent_affiliate links. Returns the
 * full ancestry as a Set of lowercased emails. Bounded at 50 hops as a
 * cheap cycle escape — real hierarchies should never come close.
 */
async function buildAncestry(supabase, start) {
  const visited = new Set();
  let cur = norm(start);
  for (let i = 0; i < 50 && cur && !visited.has(cur); i++) {
    visited.add(cur);
    const { data, error } = await supabase
      .from('level2_relationships')
      .select('parent_affiliate')
      .ilike('child_affiliate', cur)
      .limit(1);
    if (error) throw error;
    if (!data || !data[0]) break;
    cur = norm(data[0].parent_affiliate);
  }
  return visited;
}

async function getDefaultL2Percent(supabase) {
  try {
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'rev_share_l2_default')
      .limit(1);
    if (data && data[0]) {
      const n = parseFloat(data[0].value);
      if (Number.isFinite(n)) return n;
    }
  } catch (_) {}
  return 5;
}

module.exports = async function handler(req, res) {
  setCors(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const admin = requireAdminAuth(req, res);
  if (!admin) return;

  const body = req.body || {};
  const childEmail = norm(body.child_email);
  const parentRaw = body.parent_email;
  const isClearing = isSentinelNoSponsor(parentRaw);
  const parentEmail = isClearing ? null : norm(parentRaw);
  const requestedPct = body.l2_percent != null ? parseFloat(body.l2_percent) : null;

  if (!childEmail) return res.status(400).json({ error: 'child_email required' });
  if (parentEmail && parentEmail === childEmail) {
    return res.status(400).json({ error: 'An affiliate cannot sponsor themselves' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Verify both affiliates exist (case-insensitive). Without this guard
    // we'd happily create a relationship pointing at a typo.
    const { data: childUserRow, error: childErr } = await supabase
      .from('users')
      .select('email, status')
      .ilike('email', childEmail)
      .limit(1);
    if (childErr) throw childErr;
    if (!childUserRow || !childUserRow[0]) {
      return res.status(404).json({ error: 'child_email not found in users table' });
    }

    let parentUserRow = null;
    if (parentEmail) {
      const { data, error } = await supabase
        .from('users')
        .select('email, status')
        .ilike('email', parentEmail)
        .limit(1);
      if (error) throw error;
      if (!data || !data[0]) {
        return res.status(404).json({ error: 'parent_email not found in users table' });
      }
      parentUserRow = data[0];

      // Cycle prevention. Walk parent's ancestry — if the child appears
      // anywhere up the chain, the move would create a loop (e.g. moving
      // A under B when B is already under A's grandchild). Reject before
      // we touch the database.
      const ancestry = await buildAncestry(supabase, parentEmail);
      if (ancestry.has(childEmail)) {
        return res.status(400).json({
          error: 'Move would create a cycle (the proposed sponsor is already downstream of this affiliate)'
        });
      }
    }

    // Drop existing parent (if any). Always do this even when re-parenting
    // — the table has a UNIQUE constraint on (parent, child), but we also
    // don't want a stale row hanging around if we change the parent.
    const { error: delErr } = await supabase
      .from('level2_relationships')
      .delete()
      .ilike('child_affiliate', childEmail);
    if (delErr) throw delErr;

    let inserted = null;
    if (parentEmail) {
      const pct = Number.isFinite(requestedPct)
        ? requestedPct
        : await getDefaultL2Percent(supabase);

      // Always store emails lowercased. Several legacy queries against
      // level2_relationships use `.eq('parent_affiliate', emailLower)`
      // which is case-sensitive at the PostgREST layer — preserving the
      // users-table casing here would silently break downstream tiles
      // (Network Total, Affiliate Leaderboard L2 rollups, etc.) any time
      // an admin's email happens to be stored mixed-case. Lowercase is
      // the canonical normalization everywhere else in the codebase.
      const { data: insData, error: insErr } = await supabase
        .from('level2_relationships')
        .insert({
          parent_affiliate: parentEmail,   // already normalized via norm()
          child_affiliate: childEmail,     // already normalized via norm()
          l2_percent: pct
        })
        .select()
        .single();
      if (insErr) throw insErr;
      inserted = insData;

      // Auto-enable L2 on the parent so their partner dashboard shows
      // the sub-affiliate roll-up without needing a second admin click.
      // Best-effort — the relationship is the source of truth either way.
      try {
        await supabase
          .from('users')
          .update({ l2_enabled: true })
          .ilike('email', parentEmail);
      } catch (_) {}
    }

    return res.status(200).json({
      ok: true,
      child_email: childEmail,
      parent_email: parentEmail,
      cleared: isClearing,
      relationship: inserted,
      message: parentEmail
        ? `${childEmail} is now sponsored by ${parentEmail}`
        : `${childEmail} is now under CoinFrenzy (no sponsor)`
    });
  } catch (err) {
    console.error('[admin/set-sponsor] failed:', err);
    return res.status(500).json({ error: err.message || 'set-sponsor failed' });
  }
};
