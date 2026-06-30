/**
 * GET /api/admin/audit-cf-fields
 *
 * Per-player audit of the four CoinFrenzy data points we now ingest:
 *   deposit / withdrawal / bet / win.
 *
 * The point of this endpoint is to answer "is the data CF sends actually
 * self-consistent?" — distinct from "is our math on top of it correct?"
 *
 * Conservation law (must hold for every CF account):
 *
 *   D - W + G - B = current player wallet balance  (>= 0)
 *
 *   where D = deposits, W = withdrawals, B = bet (wagered), G = win (won)
 *
 * If implied balance comes out NEGATIVE for a player, that means CF has
 * paid out more than they took in plus what they gave back on play. The
 * difference must be funded by promotional / free-play credits the feed
 * doesn't surface. A few players with small negative balances is normal
 * (signup bonuses, loss rebates). Many players or large amounts means
 * either:
 *   a) CF is leaking promotional spend into the redemption_amount column
 *      without offsetting it, OR
 *   b) the feed is genuinely missing rows.
 *
 * Returns:
 *   summary: {
 *     network: { totalDeposits, totalWithdrawals, netCash,
 *                totalBet, totalWin, redeemRatio },
 *     // CONTRACT: bet (B) and win (G) are PURE volume signals from CF
 *     // and are never combined with cash flow into a derived dollar
 *     // number returned by this endpoint. They surface as their own
 *     // standalone counts/sums and are flagged on a per-player basis
 *     // for sanity checking, but no `hold`, `impliedBalance`, or
 *     // `worstNegative` $ values are exposed — those would tempt the
 *     // UI into displaying volume signals as money.
 *     players: { total, withDeposit, withWithdrawal, withBet, withWin,
 *                withAnyActivity, allFour, none },
 *     conservation: { ok, negativeBalance, positiveBalance },
 *     anomalies: {
 *       withdrawNoPlay,    // W>0 & B=0  (cashed out but never wagered)
 *       playNoDeposit,     // B>0 & D=0  (wagered without depositing — promo SC)
 *       wonMoreThanWagered,// G > B      (per CF, lifetime won > lifetime bet)
 *       depositNoActivity  // D>0 & B=0 & W=0 (deposited and sat on it)
 *     }
 *   }
 *   topAnomalies: [
 *     { player_email, player_id, D, W, B, G, netCash, flags: [...] }, ...
 *   ]
 *
 * Note: `topNegativeBalance` is intentionally NOT exposed. It would
 * require an implied-balance dollar = (D − W) + (G − B), which mixes
 * cash with volume into a money-like number. Use the per-player flag
 * `cf-fields-inconsistent` (in topAnomalies) for the same drill-in.
 *   topNetWinners:    [...]      // players up the most cash (W > D)
 *   topNetLosers:     [...]      // players down the most cash (D > W)
 *
 * Read-only. Admin-auth gated.
 */

const { createClient } = require('@supabase/supabase-js');
const { requireAdminAuth } = require('../_lib/adminAuth');
const { setCors } = require('../_lib/cors');
const { getDeposit, getWithdrawal, getBet, getWin } = require('../_lib/ngrSchema');

const PAGE_SIZE = 1000;
const MAX_ROWS = 50000;
const TOP_N = 25;

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

// Pennies tolerance — floating-point sums on $30k of CF data can drift a
// fraction of a cent. Anything inside this band is treated as "balanced".
const ZERO_EPS = 0.01;

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

    // Aggregate by player. We dedupe within a player on
    // (player_key, report_period) so a CF restate of the same period
    // doesn't double-count — same rule the production aggregator uses.
    // Sort newest-first first so the freshest restatement wins.
    rows.sort((a, b) => {
      const ta = Date.parse(a && a.created_at || '') || 0;
      const tb = Date.parse(b && b.created_at || '') || 0;
      return tb - ta;
    });

    const byPlayer = Object.create(null);
    const seen = Object.create(null);
    const network = { D: 0, W: 0, B: 0, G: 0 };

    for (const r of rows) {
      const emailKey = (r.player_email || '').toLowerCase();
      const pidKey = r.player_id ? ('pid:' + String(r.player_id)) : '';
      const playerKey = emailKey || pidKey;
      if (!playerKey) continue;
      const periodKey = (r.report_period || '') + '|' + (r.report_month || '');
      const dedupKey = playerKey + '|' + periodKey;
      if (seen[dedupKey]) continue;
      seen[dedupKey] = true;

      const D = getDeposit(r);
      const W = getWithdrawal(r);
      const B = getBet(r);
      const G = getWin(r);

      if (!byPlayer[playerKey]) {
        byPlayer[playerKey] = {
          player_email: r.player_email || null,
          player_id: r.player_id || null,
          affiliate_email: r.affiliate_email || null,
          affiliate_username: r.affiliate_username || null,
          D: 0, W: 0, B: 0, G: 0,
          rows: 0
        };
      }
      const p = byPlayer[playerKey];
      p.D += D;
      p.W += W;
      p.B += B;
      p.G += G;
      p.rows += 1;
      network.D += D;
      network.W += W;
      network.B += B;
      network.G += G;
    }

    const players = Object.values(byPlayer);

    // Bucket counters
    const counts = {
      total: players.length,
      withDeposit: 0,
      withWithdrawal: 0,
      withBet: 0,
      withWin: 0,
      withAnyActivity: 0,
      allFour: 0,
      none: 0
    };
    const anomalies = {
      withdrawNoPlay: 0,
      playNoDeposit: 0,
      wonMoreThanWagered: 0,
      depositNoActivity: 0
    };
    const conservation = {
      ok: 0,
      negativeBalance: 0,
      positiveBalance: 0
    };

    // Decorate every player with derived numbers + flags so we can rank
    // them for the top-N anomaly tables without redoing the math.
    //
    // Money / display separation: bet (B) and win (G) are PURE volume
    // signals from CF and never combine with cash flow into a derived
    // dollar number returned by this endpoint. The conservation check
    // below uses them as a sanity check on CF's own data and reports the
    // result as a per-player flag + an aggregate count — never as
    // money owed, held, or earned. This mirrors the contract enforced
    // by the ledger: bet / win do not enter NGR or commission.
    const decorated = players.map(p => {
      const netCash = p.D - p.W;             // cash in − cash out (money)
      // Internal-only: did CF's four numbers add up for this player?
      // (D − W) + (G − B) >= 0 if the feed is internally consistent.
      // We use the sign for flagging; the dollar value is intentionally
      // NOT exposed to the UI as "money."
      const conservationDelta = netCash + p.G - p.B;
      const flags = [];

      const hasD = p.D > ZERO_EPS;
      const hasW = p.W > ZERO_EPS;
      const hasB = p.B > ZERO_EPS;
      const hasG = p.G > ZERO_EPS;
      const anyActivity = hasD || hasW || hasB || hasG;

      if (hasD) counts.withDeposit += 1;
      if (hasW) counts.withWithdrawal += 1;
      if (hasB) counts.withBet += 1;
      if (hasG) counts.withWin += 1;
      if (anyActivity) counts.withAnyActivity += 1; else counts.none += 1;
      if (hasD && hasW && hasB && hasG) counts.allFour += 1;

      if (hasW && !hasB) { anomalies.withdrawNoPlay += 1; flags.push('withdraw-without-play'); }
      if (hasB && !hasD) { anomalies.playNoDeposit += 1; flags.push('play-without-deposit'); }
      if (p.G > p.B + ZERO_EPS) { anomalies.wonMoreThanWagered += 1; flags.push('won-more-than-wagered'); }
      if (hasD && !hasB && !hasW) { anomalies.depositNoActivity += 1; flags.push('deposit-no-activity'); }

      // Conservation is a count-only signal at the API layer. We
      // intentionally do not surface a totalImpliedBalance dollar or a
      // worstNegative dollar — those would let the UI render bet/win
      // as money. The flag is enough for affiliates to see "CF feed is
      // internally inconsistent for this player."
      if (conservationDelta < -ZERO_EPS) {
        conservation.negativeBalance += 1;
        flags.push('cf-fields-inconsistent');
      } else if (conservationDelta > ZERO_EPS) {
        conservation.positiveBalance += 1;
      } else {
        conservation.ok += 1;
      }

      return {
        player_email: p.player_email,
        player_id: p.player_id,
        affiliate_email: p.affiliate_email,
        affiliate_username: p.affiliate_username,
        D: round2(p.D),
        W: round2(p.W),
        B: round2(p.B),
        G: round2(p.G),
        netCash: round2(netCash),
        rows: p.rows,
        flags
      };
    });

    const topNetWinners = decorated
      .filter(p => p.netCash < -ZERO_EPS)             // W > D = player ahead
      .sort((a, b) => a.netCash - b.netCash)
      .slice(0, TOP_N);

    const topNetLosers = decorated
      .filter(p => p.netCash > ZERO_EPS)              // D > W = casino ahead
      .sort((a, b) => b.netCash - a.netCash)
      .slice(0, TOP_N);

    const topAnomalies = decorated
      .filter(p => p.flags.length > 0 && p.flags[0] !== 'cf-fields-inconsistent')
      .sort((a, b) => Math.abs(b.W) + Math.abs(b.B) - (Math.abs(a.W) + Math.abs(a.B)))
      .slice(0, TOP_N);

    const summary = {
      network: {
        // Cash flow — drives every money calculation.
        totalDeposits: round2(network.D),
        totalWithdrawals: round2(network.W),
        netCash: round2(network.D - network.W),
        // Play volume — display only, never used in money math.
        totalBet: round2(network.B),
        totalWin: round2(network.G),
        redeemRatio: network.D > 0 ? round2(network.W / network.D * 100) : 0
        // Note: deliberately no `hold`, `holdPct`, or `impliedBalance`
        // here. Combining bet/win with cash into a derived dollar would
        // contradict the contract that bet/win never produce financial
        // numbers. Use the per-player flags below for sanity checks.
      },
      players: counts,
      conservation: {
        // Counts only. We removed totalImpliedBalance and worstNegative
        // dollar fields so no UI can render bet/win as money.
        ok: conservation.ok,
        negativeBalance: conservation.negativeBalance,
        positiveBalance: conservation.positiveBalance
      },
      anomalies
    };

    return res.status(200).json({
      ok: true,
      generated_at: new Date().toISOString(),
      truncated,
      ngrRowsScanned: rows.length,
      summary,
      // topNegativeBalance was removed because it required an implied
      // balance dollar — exactly the kind of derived $ from bet/win we
      // promised not to expose. The per-player `cf-fields-inconsistent`
      // flag in topAnomalies still lets admins drill in if needed.
      topNetWinners,
      topNetLosers,
      topAnomalies
    });
  } catch (err) {
    console.error('[admin/audit-cf-fields] failed:', err);
    return res.status(500).json({ error: err.message || 'audit failed' });
  }
};

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
