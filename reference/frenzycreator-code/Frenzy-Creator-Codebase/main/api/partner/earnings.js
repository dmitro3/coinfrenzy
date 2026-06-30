/**
 * POST /api/partner/earnings
 *
 * Returns the authenticated affiliate's earnings data.
 *
 * IMPORTANT — attribution and aggregation rules are STRICT here so that what
 * the partner sees on their dashboard always matches what admin sees on the
 * payouts page. Two rules to remember:
 *
 *   1. ATTRIBUTION
 *      A player counts for this affiliate only if:
 *        a. players.affiliate_email == this affiliate's email, OR
 *        b. players.affiliate_email is empty AND players.promo_code_used IS
 *           one of this affiliate's campaign slugs.
 *      Slug match NEVER overrides someone else's affiliate_email — that's
 *      what caused Jerry to see "ricotv" signups that actually belonged to
 *      Rico (Jerry happened to have a campaign with the same slug).
 *
 *   2. EARNINGS / OWED
 *      Always computed via api/_lib/ledger.computeLedgerForEmail so the
 *      partner can never see a different number than admin. Lifetime-rolling,
 *      negative weeks carry forward, owed clamped at $0 when in deficit.
 *
 * Headers:  X-Partner-Token (required)
 * Response: {
 *   players: [...],            per-player display data
 *   periodTotals: {...},       commission per period (display-only, sums to <= owed)
 *   playerPeriods: {...},      per-player period list for client filtering
 *   signupsByPromo: {...},     real signup counts per slug
 *   revShare: number,
 *   ledger: {                  THE numbers — show these, never recompute
 *     lifetimeNgr, l1Earned, l2Earned, totalEarned, lifetimePaid, owed, deficit
 *   },
 *   totalReferrals: number
 * }
 */

const { createClient } = require('@supabase/supabase-js');
const { requirePartnerAuth } = require('../_lib/partnerAuth');
const { setCors } = require('../_lib/cors');
const { computeLedgerForEmail, norm } = require('../_lib/ledger');
const { periodKey, derivedMonth } = require('../_lib/reportPeriod');
const { getDeposit, getWithdrawal, getBet, getWin } = require('../_lib/ngrSchema');

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

  const supabase = createClient(supabaseUrl, supabaseKey);
  const email = partner.email.toLowerCase();

  try {
    const userRes = await supabase
      .from('users')
      .select('rev_share_l1, campaigns, casino_referral_code, coinfrenzy_affiliate_id, fullname')
      .eq('email', email)
      .single();

    if (userRes.error || !userRes.data) {
      return res.status(404).json({ error: 'Affiliate not found' });
    }

    const revShare = parseFloat(userRes.data.rev_share_l1) || 10;
    const campaigns = Array.isArray(userRes.data.campaigns) ? userRes.data.campaigns : [];
    const promoCodes = campaigns
      .map(c => norm(c && c.slug))
      .filter(Boolean);

    // Aliases that CoinFrenzy might stamp into ngr_data.affiliate_username
    // when they don't know our internal email. We accept any of these so
    // the partner sees their data regardless of which identifier CF used.
    const usernameAliases = [
      norm(userRes.data.casino_referral_code),
      norm(userRes.data.coinfrenzy_affiliate_id),
      norm(userRes.data.fullname)
    ].filter(Boolean);

    // Pull players via THREE simple queries and merge — belt-and-suspenders
    // because the count discrepancy with admin has been hard to pin down.
    // Admin uses .eq('affiliate_email', emailLower) and reliably gets the
    // ground-truth number (345 for Anthony). The partner endpoint should
    // never undercount that:
    //
    //   Query 1 (.eq)    — matches admin EXACTLY. If admin sees 345 with
    //                      this filter, partner gets 345 too. No PostgREST
    //                      .ilike() / .or() weirdness in the way.
    //   Query 2 (.ilike) — superset that also catches mixed-case
    //                      affiliate_email rows the webhook may have
    //                      stored without lowercasing
    //                      (api/webhook/player-registration.js#147).
    //   Query 3 (.in)    — slug fallback for players that came in via a
    //                      promo code with no affiliate_email attached.
    //
    // All three are PAGINATED via .range() so a partner with > 1000 players
    // (Supabase's silent default cap) never gets truncated. The strict
    // attribution filter at the end de-dups by id and rejects anything not
    // legitimately ours, so over-pulling is safe.
    const PLAYER_COLS = 'id, player_id, player_name, player_email, username, signup_date, created_at, affiliate_email, promo_code_used, total_ngr, total_deposits, total_withdrawals';
    const ilikeSafe = email.replace(/[\\%_]/g, '\\$&');

    const eqOwnedRows = await fetchAllPaginated(
      (offset, pageSize) => supabase
        .from('players')
        .select(PLAYER_COLS)
        .eq('affiliate_email', email)
        .range(offset, offset + pageSize - 1)
    );
    const ilikeOwnedRows = await fetchAllPaginated(
      (offset, pageSize) => supabase
        .from('players')
        .select(PLAYER_COLS)
        .ilike('affiliate_email', ilikeSafe)
        .range(offset, offset + pageSize - 1)
    );
    const slugOwnedRows = promoCodes.length > 0
      ? await fetchAllPaginated(
          (offset, pageSize) => supabase
            .from('players')
            .select(PLAYER_COLS)
            .in('promo_code_used', promoCodes)
            .range(offset, offset + pageSize - 1)
        )
      : [];

    const promoSet = Object.create(null);
    promoCodes.forEach(p => { promoSet[p] = true; });

    // STRICT attribution filter — see rule #1 in the file header.
    const seen = Object.create(null);
    const merged = eqOwnedRows.concat(ilikeOwnedRows).concat(slugOwnedRows);
    const players = merged.filter(p => {
      const ae = norm(p.affiliate_email);
      const promo = norm(p.promo_code_used);
      const mineByEmail = ae === email;
      const mineBySlugFallback = !ae && promo && promoSet[promo];
      if (!mineByEmail && !mineBySlugFallback) return false;
      if (seen[p.id]) return false;
      seen[p.id] = true;
      return true;
    });

    // Diagnostic counts surfaced both in Vercel logs AND back to the client
    // so we can see exactly where rows are lost the next time these
    // numbers diverge from admin's tile.
    const diag = {
      eqOwned: eqOwnedRows.length,
      ilikeOwned: ilikeOwnedRows.length,
      slugOwned: slugOwnedRows.length,
      merged: merged.length,
      attributed: players.length,
      promoCodes: promoCodes.length,
      // Filled in below after NGR aggregation + sanitizedPlayers build:
      ngrRowsTotal: 0,
      ngrRowsKept: 0,
      ngrRowsDroppedAttribution: 0,
      ngrRowsDroppedDedup: 0,
      ngrRowsWithDeposit: 0,
      playersWithDeposits: 0
    };

    // Real signup count per promo slug. Counted on player_email so duplicate
    // `players` rows for the same person don't inflate the number.
    const signupsByPromo = {};
    const seenByPromo = {};
    players.forEach(p => {
      const promo = norm(p.promo_code_used);
      if (!promo) return;
      const key = norm(p.player_email) || ('id:' + p.id);
      if (!seenByPromo[promo]) seenByPromo[promo] = {};
      if (seenByPromo[promo][key]) return;
      seenByPromo[promo][key] = true;
      signupsByPromo[promo] = (signupsByPromo[promo] || 0) + 1;
    });

    // Per-player NGR breakdown (for the player table + period filter). This
    // pulls the same ngr_data rows but scoped narrowly to keep the payload
    // small. We widen the query to include rows attributed by any of:
    //   - affiliate_email = me                              (canonical)
    //   - affiliate_username IN (my CF aliases)             (CF natural id)
    //   - player_id        IN (my players)                  (player join)
    //   - player_email     IN (my players' emails)          (player join, by email)
    // Then we resolve client-side and only count rows that map to me.
    const ngrRows = await fetchAllNgrRows(supabase, email, players, usernameAliases);

    // Build a per-affiliate fast-membership set so we can drop NGR rows
    // that landed in our query (because they joined on a shared player_id)
    // but actually belong to a different affiliate.
    const myPlayerIdSet = Object.create(null);
    const myPlayerEmailSet = Object.create(null);
    players.forEach(p => {
      if (p.player_id) myPlayerIdSet[String(p.player_id)] = true;
      if (p.id) myPlayerIdSet[String(p.id)] = true;
      const pe = norm(p.player_email);
      if (pe) myPlayerEmailSet[pe] = true;
    });
    const myUsernameSet = Object.create(null);
    usernameAliases.forEach(u => { myUsernameSet[u] = true; });

    // Attribution rule (relaxed Nov 2026):
    //   1. affiliate_email matches us           → ours
    //   2. affiliate_username matches us        → ours
    //   3. player is in OUR players table       → ours
    //
    // Step 3 used to be gated on affiliate_email being empty (the
    // anti-poaching guard). We dropped that gate because CoinFrenzy
    // sometimes stamps ngr_data rows with stale or wrong affiliate_email
    // values, and the resulting "everyone shows Signed up" UX is worse
    // than the poaching corner case. The players table is OUR source
    // of truth — if a player landed there via our promo code, their
    // revenue is ours.
    function rowBelongsToMe(n) {
      const ae = norm(n.affiliate_email);
      if (ae && ae === email) return true;
      const un = norm(n.affiliate_username);
      if (un && myUsernameSet[un]) return true;
      if (n.player_id != null && myPlayerIdSet[String(n.player_id)]) return true;
      const pe = norm(n.player_email);
      if (pe && myPlayerEmailSet[pe]) return true;
      return false;
    }

    // Dedup uses periodKey() so two rows for the same window in different
    // CoinFrenzy report_period shapes (compact vs full ISO) collapse to one.
    // The display label (period) keeps the canonical month so the per-period
    // breakdown stays human-readable.
    const ngrByPlayer = {};
    const ngrSeen = {};
    let ngrRowsKept = 0;
    let ngrRowsDroppedAttribution = 0;
    let ngrRowsDroppedDedup = 0;
    let ngrRowsWithDeposit = 0;
    for (const n of ngrRows) {
      if (!rowBelongsToMe(n)) { ngrRowsDroppedAttribution += 1; continue; }
      const pKey = periodKey(n.report_period, n.report_month);
      const dedupKey = norm(n.player_email) + '|' + pKey;
      if (ngrSeen[dedupKey]) { ngrRowsDroppedDedup += 1; continue; }
      ngrSeen[dedupKey] = true;
      ngrRowsKept += 1;
      if (getDeposit(n) > 0) ngrRowsWithDeposit += 1;

      // We compute per-player NGR ourselves from the raw cash flow below
      // (Option D), so we no longer read CF's ngr_amount here. Bet / win
      // are NEW informational signals from CF used by the "Total Play"
      // tile on the partner dashboard — they DO NOT participate in NGR
      // or commission math.
      const deposits = getDeposit(n);
      const withdrawals = getWithdrawal(n);
      const bet = getBet(n);
      const win = getWin(n);
      const period = derivedMonth(n.report_period, n.report_month) || 'unknown';
      // Per-period NGR uses the SAME Option D formula applied to the
      // period's net cash. Used by the per-period commission breakdown.
      const periodNetCash = deposits - withdrawals;
      const periodNgr = periodNetCash >= 0 ? periodNetCash * 0.75 : periodNetCash;

      const addTo = (key) => {
        if (!key) return;
        if (!ngrByPlayer[key]) ngrByPlayer[key] = {
          totalDeposits: 0,
          totalWithdrawals: 0,
          totalBet: 0,
          totalWin: 0,
          periods: {}
        };
        ngrByPlayer[key].totalDeposits += deposits;
        ngrByPlayer[key].totalWithdrawals += withdrawals;
        ngrByPlayer[key].totalBet += bet;
        ngrByPlayer[key].totalWin += win;
        if (!ngrByPlayer[key].periods[period]) ngrByPlayer[key].periods[period] = 0;
        ngrByPlayer[key].periods[period] += periodNgr;
      };
      addTo(n.player_id);
      addTo(norm(n.player_email));
    }

    // Canonical lifetime ledger — owed/earned/paid all live here.
    const ledger = await computeLedgerForEmail(supabase, email);

    // Distribute the affiliate's actual L1 commission across positive-NGR
    // players for display only. Per-row commission is purely cosmetic; the
    // header "owed" comes from the ledger.
    // Use Option D per-player so the proportional split matches what each
    // player's NGR shows in the table.
    const positiveNgrSum = players.reduce((s, p) => {
      const agg = ngrByPlayer[p.id]
        || ngrByPlayer[p.player_id]
        || ngrByPlayer[norm(p.player_email)]
        || { totalDeposits: 0, totalWithdrawals: 0 };
      const aggDep = agg.totalDeposits || 0;
      const aggWit = agg.totalWithdrawals || 0;
      const dep = aggDep > 0 ? aggDep : (parseFloat(p.total_deposits) || 0);
      const wit = aggWit > 0 ? aggWit : (parseFloat(p.total_withdrawals) || 0);
      const netCash = dep - wit;
      const playerNgr = netCash >= 0 ? netCash * 0.75 : netCash;
      return s + Math.max(0, playerNgr);
    }, 0);

    // Treat strings like "null", "null null", "undefined undefined", or
    // pure whitespace as missing. CoinFrenzy occasionally stores those
    // when first/last name aren't filled, and they were leaking into
    // the partner UI as literal "null null" recent-signup rows.
    const cleanField = (v) => {
      if (v == null) return '';
      const s = String(v).trim();
      if (!s) return '';
      const lower = s.toLowerCase();
      if (lower === 'null' || lower === 'undefined') return '';
      // Collapse "null null", "undefined null", "null undefined", etc.
      if (/^(null|undefined)(\s+(null|undefined))+$/i.test(s)) return '';
      return s;
    };

    let playersWithDeposits = 0;
    const sanitizedPlayers = players.map(p => {
      // Schema gotcha: players.player_id is the external CF text ID
      // (e.g. "12345"), but ngr_data.player_id is a UUID referencing
      // players.id. The aggregator keys by ngr_data.player_id (UUID)
      // via addTo(n.player_id), so the lookup MUST use p.id (UUID)
      // first or every purchaser silently shows as $0 / Signed up.
      // Fall back to the text id and email for older rows that may
      // have been keyed differently.
      const agg = ngrByPlayer[p.id]
        || ngrByPlayer[p.player_id]
        || ngrByPlayer[norm(p.player_email)]
        || { totalDeposits: 0, totalWithdrawals: 0, totalBet: 0, totalWin: 0 };
      // Fall back to the players table totals when ngr_data hasn't joined
      // for this player yet. The players table is updated directly by the
      // CoinFrenzy webhook on every purchase, so a purchaser will always
      // show as "Purchased" even before the daily ngr_data sync lands —
      // which is what the user sees as "no one shows as a purchaser".
      const aggDeposits = (agg.totalDeposits || 0);
      const aggWithdrawals = (agg.totalWithdrawals || 0);
      const fallbackDeposits = parseFloat(p.total_deposits) || 0;
      const fallbackWithdrawals = parseFloat(p.total_withdrawals) || 0;
      const effectiveDeposits = aggDeposits > 0 ? aggDeposits : fallbackDeposits;
      const effectiveWithdrawals = aggWithdrawals > 0 ? aggWithdrawals : fallbackWithdrawals;
      if (effectiveDeposits > 0) playersWithDeposits += 1;
      // Per-player NGR uses Option D on the player's lifetime cash flow so
      // it matches the affiliate's canonical lifetime NGR (which also
      // applies Option D once on the totals). CF stopped sending its own
      // ngr_amount column — we calculate it ourselves end-to-end now.
      const playerNetCash = effectiveDeposits - effectiveWithdrawals;
      const playerNgr = playerNetCash >= 0 ? playerNetCash * 0.75 : playerNetCash;
      let commission = 0;
      if (ledger.l1Earned > 0 && positiveNgrSum > 0 && playerNgr > 0) {
        commission = ledger.l1Earned * (playerNgr / positiveNgrSum);
      }
      const cleanUsername = cleanField(p.username);
      const cleanName = cleanField(p.player_name);
      const cleanEmail = cleanField(p.player_email);
      const username = cleanUsername || cleanEmail.split('@')[0] || 'player';
      const displayName = cleanName || username;
      return {
        id: p.id,
        username: username,
        name: displayName,
        joined: p.signup_date || p.created_at,
        // Purchases / redemptions come from CoinFrenzy via ngr_data so the
        // partner sees the exact same totals admin sees, with a fallback
        // to the players table totals (kept fresh by the webhook) when
        // ngr_data hasn't propagated yet.
        deposits: Math.round(effectiveDeposits * 100) / 100,
        withdrawals: Math.round(effectiveWithdrawals * 100) / 100,
        // Total wagered + total won. Surfaced as "Total Play" on the
        // partner dashboard — informational, never used in commission math.
        totalBet: Math.round((agg.totalBet || 0) * 100) / 100,
        totalWin: Math.round((agg.totalWin || 0) * 100) / 100,
        ngr: Math.round((playerNgr || 0) * 100) / 100,
        commission: Math.round(commission * 100) / 100
      };
    });

    // Period totals: aggregate NGR per period across affiliate, clamp at 0,
    // then apply rate. Display-only; will sum to <= ledger.l1Earned.
    const periodNgrTotals = {};
    for (const p of players) {
      const agg = ngrByPlayer[p.id] || ngrByPlayer[p.player_id] || ngrByPlayer[norm(p.player_email)] || { periods: {} };
      for (const [period, ngr] of Object.entries(agg.periods)) {
        if (!periodNgrTotals[period]) periodNgrTotals[period] = 0;
        periodNgrTotals[period] += ngr;
      }
    }
    const periodTotals = {};
    for (const [period, ngr] of Object.entries(periodNgrTotals)) {
      periodTotals[period] = ngr > 0 ? ngr * (revShare / 100) : 0;
    }

    const playerPeriods = {};
    for (const p of players) {
      const agg = ngrByPlayer[p.id] || ngrByPlayer[p.player_id] || ngrByPlayer[norm(p.player_email)] || { periods: {} };
      for (const [period] of Object.entries(agg.periods)) {
        if (!playerPeriods[p.id]) playerPeriods[p.id] = [];
        if (!playerPeriods[p.id].includes(period)) playerPeriods[p.id].push(period);
      }
    }

    return res.status(200).json({
      players: sanitizedPlayers,
      periodTotals: periodTotals,
      playerPeriods: playerPeriods,
      signupsByPromo: signupsByPromo,
      revShare: revShare,
      // Canonical numbers — partner UI shows ledger.owed for "balance",
      // ledger.totalEarned for "lifetime earned", etc.
      ledger: {
        lifetimeNgr: ledger.lifetimeNgr,
        // Surface raw deposits + withdrawals so partner UI can show
        // a transparency tooltip on the Lifetime tile. Same numbers
        // admin sees on the Integrity tab.
        lifetimeDeposits: ledger.purchases || 0,
        lifetimeWithdrawals: ledger.redemptions || 0,
        // Total wagered + total won across the affiliate's whole
        // network. Drives the "Total Play" tile on the partner
        // dashboard. Pure volume — no commission / NGR contribution.
        totalBet: ledger.totalBet || 0,
        totalWin: ledger.totalWin || 0,
        l1Earned: ledger.l1Earned,
        l2Earned: ledger.l2Earned,
        // Partner UI uses this to know whether to label the L2
        // tile as "Sub-affiliates · all-time" ($0 = no activity yet)
        // vs. "Not enabled on your account" ($0 = expected).
        l2Enabled: ledger.l2Enabled === true,
        totalEarned: ledger.totalEarned,
        lifetimePaid: ledger.lifetimePaid,
        owed: ledger.owed,
        deficit: ledger.deficit,
        inDeficit: ledger.inDeficit,
        rowsCounted: ledger.rowsCounted,
        playersTouched: ledger.playersTouched
      },
      totalReferrals: sanitizedPlayers.length,
      // Per-stage row counts so the client (or anyone tailing Vercel
      // logs) can immediately see whether a count mismatch is upstream
      // (DB query returned the wrong number) or downstream (strict
      // attribution filter rejected legit rows).
      diagnostics: (function() {
        diag.ngrRowsTotal = ngrRows.length;
        diag.ngrRowsKept = ngrRowsKept;
        diag.ngrRowsDroppedAttribution = ngrRowsDroppedAttribution;
        diag.ngrRowsDroppedDedup = ngrRowsDroppedDedup;
        diag.ngrRowsWithDeposit = ngrRowsWithDeposit;
        diag.playersWithDeposits = playersWithDeposits;
        console.log('[partner/earnings] email=' + email + ' counts=' + JSON.stringify(diag));
        return diag;
      })()
    });

  } catch (err) {
    console.error('[partner/earnings] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Generic paginator for any Supabase select query. Supabase silently caps
// a single .select() at 1000 rows, which has bitten us when admin used
// the simple .eq form and partner used a fancier filter — partner would
// silently truncate while admin had no rows to truncate.
async function fetchAllPaginated(buildQuery) {
  const pageSize = 1000;
  const all = [];
  let offset = 0;
  while (true) {
    const { data, error } = await buildQuery(offset, pageSize);
    if (error) {
      console.error('[partner/earnings] paginated query error at offset ' + offset + ':', error);
      break;
    }
    const rows = data || [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

async function fetchAllNgrRows(supabase, affiliateEmail, players, usernameAliases) {
  const allRows = [];
  const seenRowKey = Object.create(null);
  const pageSize = 1000;
  // `*` so a renamed/dropped column never crashes this entire query.
  // Aggregators read financial fields via the tolerant accessors.
  const SELECT_COLS = '*';

  // CHUNKING — the ngr_data query used to build a SINGLE giant .or() with
  // affiliate_email + player_id.in.(N uuids) + player_email.in.(N emails)
  // + affiliate_username.in.(...). For partners with 1000+ direct
  // referrals the resulting URL blew past PostgREST's ~16KB query string
  // limit, the request silently 414'd (or got truncated), the catch
  // below break'd the loop, and every single player ended up with
  // aggDeposits=0. Symptom: dashboard shows N referrals but 0 paying,
  // 0 play, no commission. Hit production for Dalt at ~1347 referrals.
  //
  // Fix: split the player_id and player_email IN-clauses into chunks
  // small enough to keep each query string well under the limit. We
  // also run a separate first query for the cheap matchers
  // (affiliate_email + affiliate_username aliases) so even a partial
  // failure of the player-join queries still surfaces CF-stamped rows.
  const CHUNK_SIZE = 200;

  const playerIds = players.map(p => p.player_id || p.id).filter(Boolean);
  const playerEmails = players.map(p => (p.player_email || '').toLowerCase()).filter(Boolean);

  // Build the always-cheap base OR (no IN-list explosions): affiliate_email
  // + affiliate_username aliases. This will pull every NGR row CF stamped
  // with the partner's identifier directly, regardless of player table
  // join state.
  const baseOrParts = ['affiliate_email.ilike.' + affiliateEmail];
  if (Array.isArray(usernameAliases) && usernameAliases.length > 0) {
    baseOrParts.push('affiliate_username.in.(' + usernameAliases.map(u => '"' + u.replace(/"/g, '\\"') + '"').join(',') + ')');
  }
  const baseOrExpr = baseOrParts.join(',');

  async function runQueryPaginated(orExpr, label) {
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from('ngr_data')
        .select(SELECT_COLS)
        .or(orExpr)
        .range(offset, offset + pageSize - 1);
      if (error) {
        console.error('[partner/earnings] ngr_data ' + label + ' page error at offset ' + offset + ':', error);
        break;
      }
      const rows = data || [];
      // Dedup as we accumulate so the cheap base query + player-join
      // chunks don't double-count rows that match multiple OR parts.
      for (const r of rows) {
        const key = r.id != null ? 'id:' + r.id : ('np:' + (r.player_id || '') + '|' + (r.report_period || ''));
        if (seenRowKey[key]) continue;
        seenRowKey[key] = true;
        allRows.push(r);
      }
      if (rows.length < pageSize) break;
      offset += pageSize;
    }
  }

  // 1) Cheap base query: affiliate_email + username aliases. Always runs.
  await runQueryPaginated(baseOrExpr, 'base');

  // 2) Player_id chunks. Each chunk is its own OR with the base parts so
  //    we don't lose CF-stamped matches while hunting for player joins.
  for (let i = 0; i < playerIds.length; i += CHUNK_SIZE) {
    const chunk = playerIds.slice(i, i + CHUNK_SIZE);
    const orExpr = baseOrExpr + ',player_id.in.(' + chunk.map(id => '"' + String(id).replace(/"/g, '\\"') + '"').join(',') + ')';
    await runQueryPaginated(orExpr, 'pid-chunk-' + (i / CHUNK_SIZE));
  }

  // 3) Player_email chunks. Same chunking strategy.
  for (let i = 0; i < playerEmails.length; i += CHUNK_SIZE) {
    const chunk = playerEmails.slice(i, i + CHUNK_SIZE);
    const orExpr = baseOrExpr + ',player_email.in.(' + chunk.map(e => '"' + e.replace(/"/g, '\\"') + '"').join(',') + ')';
    await runQueryPaginated(orExpr, 'pe-chunk-' + (i / CHUNK_SIZE));
  }

  console.log('[partner/earnings] ngr_data fetch complete: ' + allRows.length + ' unique rows for ' + affiliateEmail + ' (players=' + players.length + ', pidChunks=' + Math.ceil(playerIds.length / CHUNK_SIZE) + ', emailChunks=' + Math.ceil(playerEmails.length / CHUNK_SIZE) + ')');

  return allRows;
}
