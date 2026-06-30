/**
 * POST /api/admin/reconcile-attribution
 *
 * One-shot backfill that fixes orphaned player + ngr_data rows.
 *
 * Why this exists:
 *   Promo codes used to be persisted client-side after a successful CF
 *   create. Any time that client-side write didn't happen (network blip,
 *   tab close, JS error), CF kept the code but our users.campaigns lost
 *   it. Players who later signed up using that code arrived via webhook
 *   with affiliate_email = NULL and the slug→affiliate lookup failed,
 *   so the player was saved with NO attribution. Same for the NGR rows
 *   that followed.
 *
 *   The /api/coinfrenzy/promocode rewrite fixes this going forward by
 *   persisting server-side, but every existing orphan row needs to be
 *   re-attributed. This endpoint walks the orphans and fills them in.
 *
 * What it does (idempotent — safe to run any number of times):
 *   1. Build a slug → affiliate_email map from users.campaigns.
 *   2. For every players row where affiliate_email is NULL or doesn't
 *      match the slug owner, set affiliate_email to the slug owner.
 *   3. For every ngr_data row where affiliate_email is NULL (or, if
 *      `opts.fixWrong` is set, doesn't match the player's now-correct
 *      attribution), set it to the right one.
 *
 * Body (all optional):
 *   {
 *     dryRun: bool        // default false — when true, report counts but don't write
 *     fixWrong: bool      // default false — also rewrite rows whose attribution
 *                         //   disagrees with the slug owner (use carefully)
 *     onlyEmail: string   // restrict the scan to one affiliate (for targeted fixes)
 *   }
 *
 * Response:
 *   {
 *     ok: true,
 *     dryRun: bool,
 *     slugMap: { 'jerry': 'jerry@example.com', ... },
 *     players: { scanned, missing, wrong, fixed, sample: [...] },
 *     ngr:     { scanned, missing, wrong, fixed, sample: [...] }
 *   }
 */

const { createClient } = require('@supabase/supabase-js');
const { requireAdminAuth } = require('../_lib/adminAuth');
const { setCors } = require('../_lib/cors');
const { normalizeSlug } = require('../_lib/slugLookup');

const PAGE_SIZE = 1000;
// Cap concurrent UPDATEs to keep Supabase happy at 10k+ scale. Without
// batching, a single reconcile of 5k rows would fan out 5k parallel
// HTTP requests — death by connection pool. 50 at a time is well under
// PostgREST's default concurrency limits.
const WRITE_BATCH = 50;

async function fetchAllPaginated(table, columns, queryFn) {
  const out = [];
  let offset = 0;
  while (true) {
    const q = queryFn(offset, offset + PAGE_SIZE - 1);
    const { data, error } = await q;
    if (error) {
      throw new Error(`fetchAllPaginated(${table}) failed at offset ${offset}: ${error.message}`);
    }
    const rows = data || [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return out;
}

/**
 * Build a normalized-slug → owner-email map from every approved-or-not
 * user's campaigns. We INCLUDE non-approved users because attribution
 * is about who the slug *belongs* to, not who's currently active. A
 * pending account that owns "ricotv" should still be the rightful
 * recipient of any "ricotv" signups — better to attribute correctly
 * and leave admin to decide on payout policy.
 *
 * If a slug is claimed by multiple users (collision), we DO NOT pick
 * a winner — collisions are skipped and reported separately, because
 * silently picking one would mis-attribute money.
 */
function buildSlugOwnerMap(users) {
  const owners = Object.create(null); // slug -> [emails]
  for (const u of users || []) {
    if (!u || !u.email) continue;
    let camps = u.campaigns;
    if (typeof camps === 'string') {
      try { camps = JSON.parse(camps); } catch { camps = null; }
    }
    if (!Array.isArray(camps)) continue;
    const seen = Object.create(null);
    for (const c of camps) {
      const s = normalizeSlug(c && c.slug);
      if (!s || seen[s]) continue;
      seen[s] = true;
      if (!owners[s]) owners[s] = [];
      owners[s].push(String(u.email).toLowerCase());
    }
  }
  // Collapse to single-owner entries; surface collisions separately.
  const map = Object.create(null);
  const collisions = [];
  for (const s of Object.keys(owners)) {
    if (owners[s].length === 1) {
      map[s] = owners[s][0];
    } else {
      collisions.push({ slug: s, owners: owners[s] });
    }
  }
  return { map, collisions };
}

module.exports = async function handler(req, res) {
  setCors(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const admin = requireAdminAuth(req, res);
  if (!admin) return;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  const body = req.body || {};
  const dryRun = !!body.dryRun;
  // SAFETY: rewriting an existing affiliate_email = literally moving
  // money between affiliates. We require an explicit confirmation
  // token so a stray automation can never trigger it. Today the admin
  // UI does NOT expose this flag at all — only direct API calls with
  // the right token can mutate non-null attribution.
  const fixWrongRequested = !!body.fixWrong;
  const fixWrongConfirmed = body.fixWrongConfirm === 'I-UNDERSTAND-THIS-MOVES-MONEY';
  const fixWrong = fixWrongRequested && fixWrongConfirmed;
  if (fixWrongRequested && !fixWrongConfirmed) {
    return res.status(400).json({
      error: 'fix_wrong_requires_confirmation',
      message: 'fixWrong: true requires fixWrongConfirm: "I-UNDERSTAND-THIS-MOVES-MONEY"'
    });
  }
  const onlyEmail = body.onlyEmail ? String(body.onlyEmail).toLowerCase().trim() : '';
  const actorAdmin = (admin && (admin.username || admin.email)) || 'unknown-admin';

  try {
    // 1) Build slug → owner map
    const users = await fetchAllPaginated('users', null, (lo, hi) =>
      supabase.from('users').select('email, status, campaigns').range(lo, hi)
    );
    const { map: slugMap, collisions } = buildSlugOwnerMap(users);

    // 2) Walk players. Anything with no affiliate_email + a known
    //    slug → fill it in. Anything with a wrong affiliate_email +
    //    a known slug → only fill if fixWrong was passed.
    let playerQuery = (lo, hi) => supabase
      .from('players')
      .select('id, player_email, affiliate_email, promo_code_used')
      .range(lo, hi);
    if (onlyEmail) {
      // When restricting, include both rows already attributed to this
      // affiliate AND null-attributed rows whose slug maps to them.
      // The simplest safe filter: pull the lot, filter in JS — but for
      // perf we restrict to rows where affiliate_email matches OR is
      // null. Wrong-attribution detection still needs the JS pass.
      playerQuery = (lo, hi) => supabase
        .from('players')
        .select('id, player_email, affiliate_email, promo_code_used')
        .or('affiliate_email.is.null,affiliate_email.eq.' + onlyEmail)
        .range(lo, hi);
    }
    const players = await fetchAllPaginated('players', null, playerQuery);

    const playerStats = { scanned: players.length, missing: 0, wrong: 0, fixed: 0, sample: [] };
    const playerUpdates = [];

    for (const p of players) {
      const slug = normalizeSlug(p.promo_code_used);
      if (!slug) continue;
      const correct = slugMap[slug];
      if (!correct) continue;
      if (onlyEmail && correct !== onlyEmail) continue;

      const current = (p.affiliate_email || '').toLowerCase();
      if (!current) {
        playerStats.missing += 1;
        playerUpdates.push({ id: p.id, set: correct, was: null });
        if (playerStats.sample.length < 25) {
          playerStats.sample.push({ id: p.id, player_email: p.player_email, slug, was: null, becomes: correct });
        }
      } else if (current !== correct) {
        playerStats.wrong += 1;
        if (fixWrong) {
          playerUpdates.push({ id: p.id, set: correct, was: current });
          if (playerStats.sample.length < 25) {
            playerStats.sample.push({ id: p.id, player_email: p.player_email, slug, was: current, becomes: correct });
          }
        }
      }
    }

    if (!dryRun && playerUpdates.length > 0) {
      const writeStats = await applyAttributionWrites(
        supabase, 'players', playerUpdates, fixWrong, actorAdmin
      );
      playerStats.fixed = writeStats.applied;
      playerStats.skippedRaceSafety = writeStats.skipped;
      playerStats.writeErrors = writeStats.errors;
    }

    // 3) Walk ngr_data with the same logic.
    let ngrQuery = (lo, hi) => supabase
      .from('ngr_data')
      .select('id, player_email, affiliate_email, promo_code_used')
      .range(lo, hi);
    if (onlyEmail) {
      ngrQuery = (lo, hi) => supabase
        .from('ngr_data')
        .select('id, player_email, affiliate_email, promo_code_used')
        .or('affiliate_email.is.null,affiliate_email.eq.' + onlyEmail)
        .range(lo, hi);
    }
    let ngrRows = [];
    try {
      ngrRows = await fetchAllPaginated('ngr_data', null, ngrQuery);
    } catch (ngrErr) {
      // ngr_data may not have promo_code_used column in some envs.
      // Re-try without it and rely on the player-level join via player_email.
      console.warn('[reconcile-attribution] ngr_data fetch fell back (likely missing column):', ngrErr.message);
      ngrQuery = (lo, hi) => supabase
        .from('ngr_data')
        .select('id, player_email, affiliate_email')
        .range(lo, hi);
      ngrRows = await fetchAllPaginated('ngr_data', null, ngrQuery);
    }

    // Build a player_email → correct affiliate map from the players
    // table we just (potentially) repaired, so NGR rows missing a
    // promo_code_used can still be repaired via their player.
    const playerEmailToAff = Object.create(null);
    for (const p of players) {
      const e = (p.player_email || '').toLowerCase();
      if (!e) continue;
      // Use the post-repair attribution: if we just fixed the player,
      // use the correct value; else current value.
      const wouldBeCorrect = (() => {
        const slug = normalizeSlug(p.promo_code_used);
        const correct = slug ? slugMap[slug] : null;
        if (correct) return correct;
        return (p.affiliate_email || '').toLowerCase() || null;
      })();
      if (wouldBeCorrect) playerEmailToAff[e] = wouldBeCorrect;
    }

    const ngrStats = { scanned: ngrRows.length, missing: 0, wrong: 0, fixed: 0, sample: [] };
    const ngrUpdates = [];

    for (const n of ngrRows) {
      const slug = normalizeSlug(n.promo_code_used);
      const slugCorrect = slug ? slugMap[slug] : null;
      const playerCorrect = playerEmailToAff[(n.player_email || '').toLowerCase()] || null;
      const correct = slugCorrect || playerCorrect;
      if (!correct) continue;
      if (onlyEmail && correct !== onlyEmail) continue;

      const current = (n.affiliate_email || '').toLowerCase();
      if (!current) {
        ngrStats.missing += 1;
        ngrUpdates.push({ id: n.id, set: correct, was: null });
        if (ngrStats.sample.length < 25) {
          ngrStats.sample.push({ id: n.id, player_email: n.player_email, slug: slug || null, was: null, becomes: correct });
        }
      } else if (current !== correct) {
        ngrStats.wrong += 1;
        if (fixWrong) {
          ngrUpdates.push({ id: n.id, set: correct, was: current });
          if (ngrStats.sample.length < 25) {
            ngrStats.sample.push({ id: n.id, player_email: n.player_email, slug: slug || null, was: current, becomes: correct });
          }
        }
      }
    }

    if (!dryRun && ngrUpdates.length > 0) {
      const writeStats = await applyAttributionWrites(
        supabase, 'ngr_data', ngrUpdates, fixWrong, actorAdmin
      );
      ngrStats.fixed = writeStats.applied;
      ngrStats.skippedRaceSafety = writeStats.skipped;
      ngrStats.writeErrors = writeStats.errors;
    }

    return res.status(200).json({
      ok: true,
      dryRun,
      fixWrong,
      onlyEmail: onlyEmail || null,
      slugMap,
      collisions,
      players: playerStats,
      ngr: ngrStats
    });
  } catch (err) {
    console.error('[reconcile-attribution] failed:', err);
    return res.status(500).json({ error: err.message || 'Reconcile failed' });
  }
};

/**
 * SAFE batched writer with full audit trail.
 *
 * Two non-negotiable safety rules:
 *
 *   1. CONDITIONAL UPDATE — When fixing a NULL row, we add
 *      `.is('affiliate_email', null)` to the UPDATE so the row is only
 *      written if it's STILL null at the moment of the write. Race-loss
 *      is reported, never silently overwritten. This is the strongest
 *      guarantee we can give without a real DB transaction:
 *        "we never re-attribute a row whose attribution changed under us."
 *
 *   2. WRONG-FIX REQUIRES EXPLICIT CONFIRMATION — Any row whose
 *      affiliate_email is currently SET is only touched when
 *      `fixWrong=true` was passed AND the confirm token matched. Even
 *      then we re-read the row first and only proceed if its current
 *      value still matches what we intended to overwrite. Atomic check-
 *      and-set, application-side.
 *
 * Every successful write is logged to attribution_audit_log with the
 * before/after values, the actor admin, and a timestamp. Every skip
 * (race-loss or value-changed) is logged too, so admin can prove the
 * audit trail is complete.
 */
async function applyAttributionWrites(supabase, table, updates, allowWrong, actorAdmin) {
  let applied = 0;
  let skipped = 0;
  let errors = 0;
  const auditEntries = [];

  for (let i = 0; i < updates.length; i += WRITE_BATCH) {
    const slice = updates.slice(i, i + WRITE_BATCH);
    const results = await Promise.all(slice.map(async u => {
      try {
        if (u.was == null) {
          // NULL -> value: conditional update, only writes if STILL null.
          // Supabase returns the updated row(s) so we can detect race-loss.
          const r = await supabase
            .from(table)
            .update({ affiliate_email: u.set })
            .eq('id', u.id)
            .is('affiliate_email', null)
            .select('id, affiliate_email');
          if (r.error) return { ok: false, raceLoss: false, error: r.error.message, u };
          const rowsAffected = (r.data || []).length;
          if (rowsAffected === 0) {
            // Row's affiliate_email is no longer null → another path
            // already attributed it. Don't touch.
            return { ok: false, raceLoss: true, u };
          }
          return { ok: true, u };
        }

        // Existing-value -> new-value: only allowed with explicit confirm.
        if (!allowWrong) {
          return { ok: false, raceLoss: false, refused: true, u };
        }

        // Atomic-ish check-and-set: re-read, verify it still equals
        // what we recorded as `u.was`, then write.
        const cur = await supabase
          .from(table)
          .select('id, affiliate_email')
          .eq('id', u.id)
          .single();
        if (cur.error) return { ok: false, error: cur.error.message, u };
        const liveCurrent = ((cur.data && cur.data.affiliate_email) || '').toLowerCase();
        if (liveCurrent !== (u.was || '').toLowerCase()) {
          return { ok: false, raceLoss: true, u, liveCurrent };
        }
        const w = await supabase
          .from(table)
          .update({ affiliate_email: u.set })
          .eq('id', u.id)
          .eq('affiliate_email', u.was)
          .select('id, affiliate_email');
        if (w.error) return { ok: false, error: w.error.message, u };
        const wRows = (w.data || []).length;
        if (wRows === 0) return { ok: false, raceLoss: true, u };
        return { ok: true, u };
      } catch (e) {
        return { ok: false, error: e.message || 'unknown', u };
      }
    }));

    for (const r of results) {
      if (r.ok) {
        applied += 1;
        auditEntries.push({
          table_name: table,
          row_id: r.u.id,
          field: 'affiliate_email',
          old_value: r.u.was || null,
          new_value: r.u.set,
          actor: actorAdmin,
          source: 'reconcile-attribution',
          status: 'applied'
        });
      } else if (r.raceLoss || r.refused) {
        skipped += 1;
        auditEntries.push({
          table_name: table,
          row_id: r.u.id,
          field: 'affiliate_email',
          old_value: r.u.was || null,
          new_value: r.u.set,
          actor: actorAdmin,
          source: 'reconcile-attribution',
          status: r.refused ? 'refused-fixWrong-not-confirmed' : 'skipped-race-loss'
        });
      } else {
        errors += 1;
        auditEntries.push({
          table_name: table,
          row_id: r.u.id,
          field: 'affiliate_email',
          old_value: r.u.was || null,
          new_value: r.u.set,
          actor: actorAdmin,
          source: 'reconcile-attribution',
          status: 'error',
          error: r.error || ''
        });
      }
    }
  }

  // Persist the audit batch. If the table doesn't exist yet (migration not
  // applied), fall back to structured console logs so we still have a
  // trail. Never let audit-log failure mask the data write.
  if (auditEntries.length > 0) {
    try {
      const ins = await supabase.from('attribution_audit_log').insert(auditEntries);
      if (ins.error) throw new Error(ins.error.message);
    } catch (logErr) {
      console.error('[reconcile-attribution] audit log persist failed; emitting to stdout:', logErr.message);
      for (const e of auditEntries) {
        console.log('[ATTRIBUTION_AUDIT]', JSON.stringify(e));
      }
    }
  }

  return { applied, skipped, errors };
}
