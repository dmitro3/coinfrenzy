/**
 * GET /api/admin/ngr-feed-status
 *
 * Diagnostic endpoint that answers "is CoinFrenzy actually feeding us?"
 *
 * Surfaces:
 *   - latest 25 raw ngr_data rows with EVERY column populated, including a
 *     derived `_canonicalKey` and `_periodShape` so you can tell at a glance
 *     when two different-looking report_periods describe the same window
 *   - row counts for last 24h / 7d / 30d
 *   - aggregated deposits / withdrawals / NGR for last 7d / 30d / lifetime
 *   - count of unique affiliates touched in last 7 days
 *   - period format breakdown (counts per detected shape)
 *   - "suspicious" row counts that are usually the smoking gun for a bug:
 *       * ngr != 0 but purchase + redemption == 0  (CF sending NGR-only)
 *       * all-zero rows                            (no-op pushes)
 *       * affiliate_email IS NULL                  (orphans for the
 *                                                   reconcile-attribution
 *                                                   tool to repair)
 *
 * Read-only. Admin-auth gated. Safe to call as often as the admin wants.
 */

const { createClient } = require('@supabase/supabase-js');
const { requireAdminAuth } = require('../_lib/adminAuth');
const { setCors } = require('../_lib/cors');
const { normalizePeriod } = require('../_lib/reportPeriod');
const { buildAttribLookups, resolveAffiliateEmail, PLAYER_LOOKUP_SELECT } = require('../_lib/ledger');
const {
  detectNgrColumns,
  describeSchema,
  getDeposit,
  getWithdrawal,
  getBet,
  getWin,
  getGgr
} = require('../_lib/ngrSchema');

const SAMPLE_LIMIT = 25;
const PAGE_SIZE = 1000;
// Hard cap on how many rows we'll scan in this request. ngr_data is small
// enough today that we can afford a full table scan, but cap it so a
// runaway dataset can't time us out at 10k+ scale. If we ever exceed this
// we surface a `truncated: true` flag so admin knows the counts are conservative.
const MAX_ROWS = 50000;

function isWithinMs(rowMs, nowMs, windowMs) {
  return Number.isFinite(rowMs) && (nowMs - rowMs) <= windowMs;
}

// `select *` so a missing column never tanks the entire diagnostic — we
// would rather see "column X doesn't exist" surfaced in the `schema`
// section than crash the integrity tab the way redemption_amount did.
async function fetchAllRows(supabase) {
  const out = [];
  let offset = 0;
  let truncated = false;
  while (offset < MAX_ROWS) {
    const { data, error } = await supabase
      .from('ngr_data')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data || [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  if (offset >= MAX_ROWS) truncated = true;
  return { rows: out, truncated };
}

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
    const { rows, truncated } = await fetchAllRows(supabase);

    // Detect the live schema so the UI can warn when a critical column
    // (deposits, withdrawals, NGR) is missing — that's exactly what was
    // hiding behind the "redemption_amount does not exist" failure.
    const availableColumns = await detectNgrColumns(supabase, { force: true });
    const schemaInfo = describeSchema(availableColumns);

    // Pull users + players so we can compute attribution-resolution stats.
    // These tell admin which join path (username / email / player) every
    // NGR row is using. Username is the canonical cross-system ID — we
    // expect the vast majority of rows to resolve via username. Anything
    // resolving via email-only, or unresolvable, is a config bug.
    const [usersRes, playersAcc] = await Promise.all([
      supabase.from('users').select('email, status, fullname, casino_referral_code, coinfrenzy_affiliate_id'),
      (async () => {
        const out = [];
        let off = 0;
        while (off < MAX_ROWS) {
          const { data, error } = await supabase
            .from('players')
            .select(PLAYER_LOOKUP_SELECT)
            .range(off, off + PAGE_SIZE - 1);
          if (error) throw error;
          const r = data || [];
          out.push(...r);
          if (r.length < PAGE_SIZE) break;
          off += PAGE_SIZE;
        }
        return out;
      })()
    ]);
    const lookups = buildAttribLookups(usersRes.data || [], playersAcc);

    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const SEVEN_DAYS = 7 * ONE_DAY;
    const THIRTY_DAYS = 30 * ONE_DAY;

    // sums shapes were trimmed when we stopped consuming CF's NGR /
    // commission. We now track the raw cash flow + the new volume signals
    // (bet / win) and derive everything else from there.
    const counts = { total: rows.length, last24h: 0, last7d: 0, last30d: 0 };
    const sums7d = { deposits: 0, withdrawals: 0, bet: 0, win: 0, ggr: 0 };
    const sums30d = { deposits: 0, withdrawals: 0, bet: 0, win: 0, ggr: 0 };
    const sumsLifetime = { deposits: 0, withdrawals: 0, bet: 0, win: 0, ggr: 0 };
    const affiliates7d = Object.create(null);
    const affiliatesLifetime = Object.create(null);

    const shapeCounts = Object.create(null);
    // resolutionPaths is the breakdown for EVERY row (not just orphans):
    // how many rows attributed via the canonical username path vs the
    // legacy email path vs a player join vs nothing-at-all.
    const resolutionPaths = {
      via_username: 0,
      via_email: 0,
      via_player_id: 0,
      via_player_email: 0,
      unresolvable: 0
    };
    const suspicious = {
      // ngrOnlyZeroFlows retired 2026-04 — CF no longer sends ngr_amount,
      // so a "ngr without cash flow" check would flag every row.
      allZero: 0,
      missingUsernameOnRow: 0,
      missingAffiliate: 0,
      negativePurchaseOrRedemption: 0,
      unparseablePeriod: 0,
      // Subset of resolutionPaths that came from rows missing affiliate_email
      // (kept for backwards compat with the existing UI card).
      resolvedViaUsername: 0,
      resolvedViaPlayerId: 0,
      resolvedViaPlayerEmail: 0,
      unresolvable: 0
    };
    const unparseableSamples = [];

    let lastCreatedAt = null;
    let lastCreatedAtMs = 0;

    for (const r of rows) {
      const createdMs = Date.parse(r.created_at || '') || 0;
      // Tolerant accessors handle every known column alias for each
      // financial concept. We deliberately no longer read CF's `ngr_amount`
      // / `commission_amount` here (the dev removed them from the feed —
      // we calculate NGR + commission ourselves with Option D).
      const purchase = getDeposit(r);
      const redemption = getWithdrawal(r);
      const bet = getBet(r);
      const win = getWin(r);
      const ggr = getGgr(r);
      const aff = (r.affiliate_email || '').toLowerCase();

      // Lifetime
      sumsLifetime.deposits += purchase;
      sumsLifetime.withdrawals += redemption;
      sumsLifetime.bet += bet;
      sumsLifetime.win += win;
      sumsLifetime.ggr += ggr;
      if (aff) affiliatesLifetime[aff] = true;

      if (createdMs > lastCreatedAtMs) {
        lastCreatedAtMs = createdMs;
        lastCreatedAt = r.created_at;
      }

      if (isWithinMs(createdMs, now, ONE_DAY)) counts.last24h += 1;
      if (isWithinMs(createdMs, now, SEVEN_DAYS)) {
        counts.last7d += 1;
        sums7d.deposits += purchase;
        sums7d.withdrawals += redemption;
        sums7d.bet += bet;
        sums7d.win += win;
        sums7d.ggr += ggr;
        if (aff) affiliates7d[aff] = true;
      }
      if (isWithinMs(createdMs, now, THIRTY_DAYS)) {
        counts.last30d += 1;
        sums30d.deposits += purchase;
        sums30d.withdrawals += redemption;
        sums30d.bet += bet;
        sums30d.win += win;
        sums30d.ggr += ggr;
      }

      // Smoking-gun checks. Without CF's ngr_amount we use the cash-flow
      // + bet/win signals to spot rows that look broken.
      if (purchase === 0 && redemption === 0 && bet === 0 && win === 0) {
        suspicious.allZero += 1;
      }
      if (!r.affiliate_username) suspicious.missingUsernameOnRow += 1;
      if (!aff) suspicious.missingAffiliate += 1;
      if (purchase < 0 || redemption < 0) suspicious.negativePurchaseOrRedemption += 1;

      // Resolution-path tally (every row, not just orphans). We use the
      // SAME resolver the aggregators use so this breakdown is exactly
      // how earnings get attributed.
      const meta = { via: 'none' };
      const resolved = resolveAffiliateEmail(r, lookups, meta);
      if (meta.via === 'username') resolutionPaths.via_username += 1;
      else if (meta.via === 'email') resolutionPaths.via_email += 1;
      else if (meta.via === 'player_id') resolutionPaths.via_player_id += 1;
      else if (meta.via === 'player_email') resolutionPaths.via_player_email += 1;
      else resolutionPaths.unresolvable += 1;
      // Backwards-compat: feed the orphan-specific buckets too.
      if (!aff) {
        if (meta.via === 'username') suspicious.resolvedViaUsername += 1;
        else if (meta.via === 'player_id') suspicious.resolvedViaPlayerId += 1;
        else if (meta.via === 'player_email') suspicious.resolvedViaPlayerEmail += 1;
        else if (meta.via === 'unresolvable') suspicious.unresolvable += 1;
      }
      // resolved is only used for the diagnostic side-effect; don't keep.
      void resolved;

      // Period shape breakdown
      const np = normalizePeriod(r.report_period, r.report_month);
      shapeCounts[np.shape] = (shapeCounts[np.shape] || 0) + 1;
      if (np.shape === 'unparseable') {
        suspicious.unparseablePeriod += 1;
        if (unparseableSamples.length < 10) {
          unparseableSamples.push({
            id: r.id,
            report_period: r.report_period,
            report_month: r.report_month,
            affiliate_email: r.affiliate_email,
            created_at: r.created_at
          });
        }
      }
    }

    // Latest sample with derived columns so admin can see at a glance
    // when two different-looking periods collapse to the same window.
    const latestSample = rows.slice(0, SAMPLE_LIMIT).map(r => {
      const np = normalizePeriod(r.report_period, r.report_month);
      return {
        ...r,
        _canonicalKey: np.canonicalKey,
        _periodShape: np.shape,
        _periodMonth: np.monthKey
      };
    });

    // Health verdict so the UI can render a green / amber / red badge.
    let health;
    if (counts.total === 0) {
      health = { status: 'red', message: 'No NGR rows in the database. CoinFrenzy has never pushed.' };
    } else if (lastCreatedAtMs === 0) {
      health = { status: 'amber', message: 'Rows exist but none have a parseable created_at timestamp.' };
    } else if (now - lastCreatedAtMs > 3 * ONE_DAY) {
      const days = Math.floor((now - lastCreatedAtMs) / ONE_DAY);
      health = { status: 'red', message: 'Last push was ' + days + ' day' + (days === 1 ? '' : 's') + ' ago. CoinFrenzy may have stopped feeding us.' };
    } else if (now - lastCreatedAtMs > ONE_DAY) {
      health = { status: 'amber', message: 'No new rows in the last 24 hours.' };
    } else {
      health = { status: 'green', message: counts.last24h + ' row' + (counts.last24h === 1 ? '' : 's') + ' received in the last 24 hours.' };
    }

    // Surface the username-collision and missing-username lists so admin
    // can see config errors that would silently break attribution.
    const usernameCollisionList = Object.keys(lookups.usernameCollisions || {})
      .map(k => ({ username: k, claimedBy: lookups.usernameCollisions[k] }))
      .slice(0, 50);

    return res.status(200).json({
      ok: true,
      generated_at: new Date(now).toISOString(),
      truncated,
      health,
      // schema is the most important new field — it tells the admin UI
      // exactly which columns the live ngr_data table has and which
      // standard concepts (deposit, withdrawal, ngr, ggr, commission)
      // resolve to a real column. If `concepts.withdrawal.hasAny === false`
      // every NGR row will look like pure profit because we have nothing
      // to subtract; the UI MUST surface that as a red banner.
      schema: schemaInfo,
      lastReceivedAt: lastCreatedAt,
      counts,
      sums: {
        last7d: sums7d,
        last30d: sums30d,
        lifetime: sumsLifetime
      },
      uniqueAffiliates: {
        last7d: Object.keys(affiliates7d).length,
        lifetime: Object.keys(affiliatesLifetime).length
      },
      periodShapes: shapeCounts,
      // resolutionPaths is the canonical "where do earnings come from"
      // breakdown — username should dominate. anything via_email or
      // unresolvable is a config flag worth chasing.
      resolutionPaths,
      attributionConfig: {
        affiliatesWithoutCfUsername: lookups.affiliatesWithoutUsername || [],
        usernameCollisions: usernameCollisionList
      },
      suspicious,
      unparseableSamples,
      latestSample
    });
  } catch (err) {
    console.error('[admin/ngr-feed-status] failed:', err);
    return res.status(500).json({ error: err.message || 'feed-status failed' });
  }
};
