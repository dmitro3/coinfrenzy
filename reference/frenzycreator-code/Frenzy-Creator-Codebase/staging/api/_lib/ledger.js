/**
 * api/_lib/ledger.js
 *
 * THE single source of truth for affiliate financial aggregation.
 *
 * Every page that shows "earned", "owed", "balance", or "paid" for an
 * affiliate MUST go through this module. Three different formulas living in
 * three different places is exactly how Anthony ended up "owed money on the
 * payouts page but negative on the dashboard". Don't recompute it elsewhere.
 *
 * Aggregation rules (lifetime-rolling, no date cutoff, ever):
 *   0. NGR is computed BY US, NOT taken from CoinFrenzy's ngr_amount column.
 *      (CF's value is kept on the ledger as `reportedNgr` for audit-modal
 *      reference only — never used for commissions or owed amounts.)
 *
 *   1. lifetimeNetCash = sum(purchase_amount) − sum(redeem_amount)
 *                        deduped by (affiliate, player_email, period).
 *
 *   1b. lifetimeNgr   = lifetimeNetCash >= 0
 *                          ? lifetimeNetCash * 0.75   (casino won — 25% off
 *                                                      for game-provider /
 *                                                      license fees on GGR)
 *                          : lifetimeNetCash          (player won — no fees,
 *                                                      casino's full cash loss)
 *      This is "Option D": fees apply only when the casino wins. Provider
 *      revenue-share contracts charge on positive GGR only, so we don't
 *      inflate losses with a phantom fee CF assumes is there.
 *
 *   2. l1Earned      = max(0, lifetimeNgr) * revShareL1 / 100
 *                      Negative lifetime NGR earns $0 commission. The deficit
 *                      carries forward inside `lifetimeNgr` itself.
 *   3. l2NetSubNgr   = sum across ALL L2 children of child.lifetimeNgr
 *                      (negative subs DO drag down positive subs — aggregate
 *                       network performance is what matters for L2)
 *   4. l2Earned      = max(0, l2NetSubNgr) * revShareL2 / 100
 *                      One profitable sub can't earn the parent commission
 *                      while the rest of the network is bleeding the house.
 *   5. totalEarned   = l1Earned + l2Earned
 *   6. lifetimePaid  = sum of payouts.amount where status='paid'
 *   7. owedBeforeBlock = max(0, totalEarned - lifetimePaid)
 *   8. owed          = lifetimeNgr < 0 ? 0 : owedBeforeBlock   ← public display
 *                      An affiliate in personal NGR deficit earns $0 owed
 *                      across BOTH L1 and L2 until they climb back to
 *                      positive on their own players. They can't collect
 *                      L2 commission while they're underwater on L1.
 *   9. ngrDeficit    = max(0, -lifetimeNgr)  ← dollars of NGR to clear
 *   10. payDeficit   = max(0, lifetimePaid - totalEarned)  ← overpaid clawback
 *
 * `owed` is what gets shown on the payouts page. We deliberately clamp at 0
 * so an affiliate in clawback territory sees "$0 owed" (not a demoralizing
 * red negative). Both deficits are kept in the payload for admin audit.
 */

const { periodKey } = require('./reportPeriod');
const { getDeposit, getWithdrawal, getBet, getWin, getNgr } = require('./ngrSchema');

// `select *` on ngr_data so a missing column never crashes the entire query.
// We had `purchase_amount, redemption_amount` in the explicit list and the
// dev's schema had different names — every read failed, dashboard showed $0,
// nothing worked. Trading a few extra bytes per row for a query that ALWAYS
// succeeds is the right call. The accessors in ngrSchema.js handle the
// alias chain for the actual financial fields.
const NGR_SELECT = '*';
const PAYOUT_SELECT = 'affiliate_email, amount, status, paid_at';
const USER_LOOKUP_SELECT = 'email, casino_referral_code, coinfrenzy_affiliate_id, fullname';
// Include `id` (the players UUID) so the attribution lookup can match
// ngr_data.player_id, which is a UUID FK to players.id (NOT the
// external text players.player_id from CoinFrenzy). Without `id`,
// every NGR row that lacked an explicit affiliate_email would fail
// player_id-based attribution and silently get dropped.
const PLAYER_LOOKUP_SELECT = 'id, player_id, player_email, affiliate_email, affiliate_username';

const PAGE_SIZE = 1000;

/**
 * Lowercase + trim a string for case-insensitive comparison.
 */
function norm(s) {
  return String(s == null ? '' : s).trim().toLowerCase();
}

/**
 * Numeric coercion that treats null/undefined/'' as 0.
 */
function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Option D NGR formula. The single place this rule lives.
 *
 *   netCash >= 0  →  netCash * 0.75   (fees come off the win)
 *   netCash <  0  →  netCash          (full loss, no fees on losses)
 *
 * Keep this in sync with admin.html's optionDNgr() mirror.
 */
function optionDNgr(deposits, withdrawals) {
  const netCash = num(deposits) - num(withdrawals);
  return netCash >= 0 ? netCash * 0.75 : netCash;
}

/**
 * Page through any Supabase select to bypass the 1000-row default cap.
 * `queryFn(offset, limit)` must return a Supabase query (not the result).
 */
async function fetchAllPages(queryFn) {
  const all = [];
  let offset = 0;
  while (true) {
    const { data, error } = await queryFn(offset, PAGE_SIZE);
    if (error) throw error;
    const rows = data || [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

/**
 * Pull every ngr_data row in the system. Used by computeAllLedgers and the
 * admin /api/admin/ledger endpoint. For per-affiliate computation, prefer
 * fetchNgrRowsForAffiliate which is bounded.
 */
async function fetchAllNgrRows(supabase) {
  return fetchAllPages((offset, limit) =>
    supabase.from('ngr_data').select(NGR_SELECT).range(offset, offset + limit - 1)
  );
}

/**
 * Pull every payout. Same caveat as fetchAllNgrRows.
 */
async function fetchAllPayouts(supabase) {
  return fetchAllPages((offset, limit) =>
    supabase.from('payouts').select(PAYOUT_SELECT).range(offset, offset + limit - 1)
  );
}

/**
 * Build the lookup tables used by `resolveAffiliateEmail` to attribute
 * NGR rows to the right affiliate.
 *
 * CoinFrenzy username (stored as users.casino_referral_code) is the
 * canonical cross-system ID — every applicant is required to provide it
 * during registration. Email is internal-only; CF doesn't know it. So
 * the resolver always looks at username FIRST and only falls back to
 * the email column or a player join when no username path matches.
 *
 * `usernameCollisions` lets the diagnostic surface any case where two of
 * our affiliates claimed the same CF username — that's a config error
 * because earnings would be ambiguous (we keep the first one we see and
 * skip the second so we never silently mis-attribute money).
 */
function buildAttribLookups(users, players) {
  const usernameToEmail = Object.create(null);
  const usernameCollisions = Object.create(null);
  const playerIdToAff = Object.create(null);
  const playerEmailToAff = Object.create(null);
  const affiliatesWithoutUsername = [];

  for (const u of users || []) {
    const email = norm(u.email);
    if (!email) continue;

    // Primary CF identifier the affiliate gave us at registration.
    // We also accept coinfrenzy_affiliate_id (CF's internal numeric ID,
    // some affiliates have one stored) and the literal email local-part
    // as last-resort aliases — but those are weak matches.
    const primaryUsername = norm(u.casino_referral_code);
    const aliases = [
      primaryUsername,
      norm(u.coinfrenzy_affiliate_id),
      // Local-part of email as a defensive fallback — handles the case
      // where CF stamped affiliate_username with the affiliate's email.
      email.indexOf('@') > 0 ? email.split('@')[0] : ''
    ].filter(Boolean);

    for (const k of aliases) {
      if (!usernameToEmail[k]) {
        usernameToEmail[k] = email;
      } else if (usernameToEmail[k] !== email) {
        // Two different affiliates claim the same alias — record the
        // collision so admin can fix it. We KEEP the first claim so
        // earnings don't move silently when the second one is added.
        if (!usernameCollisions[k]) usernameCollisions[k] = [usernameToEmail[k]];
        if (usernameCollisions[k].indexOf(email) === -1) {
          usernameCollisions[k].push(email);
        }
      }
    }

    // Track approved affiliates (anyone with a status field set OR no
    // status — best-effort) who didn't give us a CF username so admin
    // can chase them up. They literally cannot earn until this is set.
    const status = norm(u.status);
    const isApprovedish = !status || status === 'approved';
    if (isApprovedish && !primaryUsername) {
      affiliatesWithoutUsername.push(email);
    }
  }

  for (const p of players || []) {
    const aff = norm(p.affiliate_email);
    if (!aff) continue;
    // Map BOTH key shapes to the affiliate so resolveAffiliateEmail
    // matches whether the ngr_data row was keyed by the external CF
    // text id (p.player_id) or the internal UUID FK (p.id).
    if (p.id) {
      const uid = String(p.id);
      if (!playerIdToAff[uid]) playerIdToAff[uid] = aff;
    }
    if (p.player_id) {
      const pid = String(p.player_id);
      if (!playerIdToAff[pid]) playerIdToAff[pid] = aff;
    }
    const pe = norm(p.player_email);
    if (pe && !playerEmailToAff[pe]) playerEmailToAff[pe] = aff;
  }

  return {
    usernameToEmail,
    usernameCollisions,
    playerIdToAff,
    playerEmailToAff,
    affiliatesWithoutUsername
  };
}

/**
 * Resolve an NGR row to a canonical affiliate email.
 *
 * Resolution order (username FIRST — it's the cross-system ID we trust):
 *   1. row.affiliate_username matches a known affiliate (canonical join)
 *   2. row.affiliate_email is set (internal canonical, used when CF
 *      explicitly stamped one — this happens when CF was given the
 *      affiliate's email at some point in the past)
 *   3. row.player_id maps to a player whose affiliate_email we know
 *   4. row.player_email maps to a player whose affiliate_email we know
 *
 * Returns '' when nothing resolves. Those rows are unattributable and
 * MUST be surfaced by the diagnostic endpoint, never silently absorbed.
 *
 * Also returns the resolution path via the optional `outMeta` object so
 * the diagnostic can break down WHERE earnings are coming from.
 */
function resolveAffiliateEmail(row, lookups, outMeta) {
  if (!row) {
    if (outMeta) outMeta.via = 'none';
    return '';
  }

  if (lookups) {
    const uname = norm(row.affiliate_username);
    if (uname && lookups.usernameToEmail[uname]) {
      if (outMeta) outMeta.via = 'username';
      return lookups.usernameToEmail[uname];
    }
  }

  const direct = norm(row.affiliate_email);
  if (direct) {
    if (outMeta) outMeta.via = 'email';
    return direct;
  }

  if (lookups) {
    if (row.player_id != null && row.player_id !== '') {
      const pid = String(row.player_id);
      if (lookups.playerIdToAff[pid]) {
        if (outMeta) outMeta.via = 'player_id';
        return lookups.playerIdToAff[pid];
      }
    }
    const pe = norm(row.player_email);
    if (pe && lookups.playerEmailToAff[pe]) {
      if (outMeta) outMeta.via = 'player_email';
      return lookups.playerEmailToAff[pe];
    }
  }

  if (outMeta) outMeta.via = 'unresolvable';
  return '';
}

/**
 * Aggregate lifetime NGR per affiliate from a flat list of ngr_data rows.
 * Dedup key is (affiliate_email, player_email, period) so the same player
 * legitimately referred by two affiliates contributes to BOTH ledgers
 * (no silent drop), but a single affiliate's duplicated row for the same
 * (player, period) is counted once.
 *
 * `lookups` (from buildAttribLookups) is optional but strongly recommended:
 * without it, rows missing affiliate_email get dropped.
 */
function aggregateLifetimeNgr(ngrRows, lookups) {
  const seen = Object.create(null);
  const byAff = Object.create(null);

  // Sort by created_at desc so the FIRST row we see for any
  // (aff, player, period) bucket is the most recently pushed — corrections
  // from CoinFrenzy win over earlier values.
  const sorted = (ngrRows || []).slice().sort((a, b) => {
    const ta = Date.parse(a.created_at || '') || 0;
    const tb = Date.parse(b.created_at || '') || 0;
    return tb - ta;
  });

  for (const r of sorted) {
    const aff = resolveAffiliateEmail(r, lookups);
    if (!aff) continue;
    const playerKey = norm(r.player_email) || ('pid:' + (r.player_id || ''));
    // periodKey() collapses the same window in different CoinFrenzy
    // report_period shapes (compact / full ISO / month) to one value.
    const pKey = periodKey(r.report_period, r.report_month);
    const dedupKey = aff + '|' + playerKey + '|' + pKey;
    if (seen[dedupKey]) continue;
    seen[dedupKey] = true;

    if (!byAff[aff]) {
      byAff[aff] = {
        lifetimeNgr: 0,    // computed from cash flow at the end (Option D)
        reportedNgr: 0,    // legacy CF ngr_amount sum (no longer populated by feed)
        purchases: 0,
        redemptions: 0,
        // bet / win = total wagered / total won over the lifetime. Pure
        // volume signals from CF used by the "Wagered" / "Total Play" tiles.
        // They DO NOT participate in NGR or commission math.
        totalBet: 0,
        totalWin: 0,
        rowsCounted: 0,
        playersSeen: Object.create(null)
      };
    }
    const agg = byAff[aff];
    // Tolerant accessors handle every known column alias (purchase_amount /
    // deposit_amount / redeem_amount / withdrawal_amount / ...). See
    // api/_lib/ngrSchema.js.
    agg.purchases += getDeposit(r);
    agg.redemptions += getWithdrawal(r);
    agg.totalBet += getBet(r);
    agg.totalWin += getWin(r);
    // CF used to send ngr_amount but no longer does. We keep the
    // accumulator on the ledger so any stale row that still carries
    // a value can be surfaced in the row-inspector — but every UI
    // surface that drives money has been switched to OUR Option D NGR
    // computed below from cash flow only.
    agg.reportedNgr += getNgr(r);
    agg.rowsCounted += 1;
    if (playerKey) agg.playersSeen[playerKey] = true;
  }

  // Apply Option D AT LIFETIME GRANULARITY — once, on the deduped totals.
  // Doing this per-row would systematically over-count drag because a deposit
  // day (positive cash) and a redeem day (negative cash) would each be scaled
  // independently and the result wouldn't match (deposits − withdrawals) × k.
  Object.keys(byAff).forEach(function(aff) {
    const a = byAff[aff];
    a.lifetimeNgr = optionDNgr(a.purchases, a.redemptions);
  });

  return byAff;
}

/**
 * Sum lifetime payouts (status='paid') per affiliate.
 */
function aggregateLifetimePaid(payouts) {
  const byAff = Object.create(null);
  for (const p of payouts || []) {
    if (norm(p.status) !== 'paid') continue;
    const aff = norm(p.affiliate_email);
    if (!aff) continue;
    if (!byAff[aff]) byAff[aff] = 0;
    byAff[aff] += num(p.amount);
  }
  return byAff;
}

/**
 * Build a lookup of email -> { revShareL1, revShareL2, l2Enabled } from a
 * users array. Accepts both DB column names (rev_share_l1, l2_enabled) and
 * the camelCased shape the admin UI uses.
 */
function buildRevShareMap(users) {
  const map = Object.create(null);
  for (const u of users || []) {
    const email = norm(u.email);
    if (!email) continue;
    const l1 = parseFloat(u.rev_share_l1 != null ? u.rev_share_l1 : u.revShareL1);
    const l2 = parseFloat(u.rev_share_l2 != null ? u.rev_share_l2 : u.revShareL2);
    map[email] = {
      revShareL1: Number.isFinite(l1) ? l1 : 10,
      revShareL2: Number.isFinite(l2) ? l2 : 5,
      l2Enabled: !!(u.l2_enabled != null ? u.l2_enabled : u.l2Enabled)
    };
  }
  return map;
}

/**
 * Build a parent -> [child, ...] map from level2_relationships rows.
 */
function buildL2ChildMap(l2Rels) {
  const byParent = Object.create(null);
  for (const r of l2Rels || []) {
    const parent = norm(r.parent_affiliate);
    const child = norm(r.child_affiliate || r.sub_affiliate);
    if (!parent || !child) continue;
    if (!byParent[parent]) byParent[parent] = [];
    byParent[parent].push(child);
  }
  return byParent;
}

/**
 * Take pre-aggregated NGR / paid / users / L2 data and produce the canonical
 * ledger object for a single affiliate.
 *
 * This is the function every UI surface should ultimately call. Both the
 * server endpoints and the admin browser code go through here.
 */
function buildLedgerFor(email, ngrByAff, paidByAff, revShareMap, l2ChildMap) {
  const aff = norm(email);
  const ngr = ngrByAff[aff] || {
    lifetimeNgr: 0,
    reportedNgr: 0,
    purchases: 0,
    redemptions: 0,
    totalBet: 0,
    totalWin: 0,
    rowsCounted: 0,
    playersSeen: {}
  };
  const cfg = revShareMap[aff] || { revShareL1: 10, revShareL2: 5, l2Enabled: false };

  const lifetimeNgr = ngr.lifetimeNgr;
  const reportedNgr = ngr.reportedNgr || 0;
  const totalBet = ngr.totalBet || 0;
  const totalWin = ngr.totalWin || 0;
  const l1Earned = lifetimeNgr > 0 ? lifetimeNgr * (cfg.revShareL1 / 100) : 0;

  // L2 commission is on AGGREGATE sub-affiliate NGR. One profitable sub
  // can't earn the parent commission while the rest of their network is
  // bleeding. Each child's NGR sums (positive AND negative) into the
  // aggregate, then we clamp at zero and apply the rate.
  let l2NetSubNgr = 0;
  const l2Breakdown = [];
  if (cfg.l2Enabled) {
    const children = l2ChildMap[aff] || [];
    for (const child of children) {
      const childNgr = (ngrByAff[child] && ngrByAff[child].lifetimeNgr) || 0;
      l2NetSubNgr += childNgr;
      // No per-child earned amount because earnings are computed on the
      // aggregate, not per-child. We surface lifetimeNgr per child so admin
      // can see exactly which sub is dragging the network down.
      l2Breakdown.push({ child, lifetimeNgr: childNgr });
    }
  }
  const l2Earned = l2NetSubNgr > 0 ? l2NetSubNgr * (cfg.revShareL2 / 100) : 0;

  const totalEarned = l1Earned + l2Earned;
  const lifetimePaid = paidByAff[aff] || 0;
  const net = totalEarned - lifetimePaid;
  const owedBeforeBlock = net > 0 ? net : 0;
  const payDeficit = net < 0 ? -net : 0;

  // PERSONAL DEFICIT GATE: if the affiliate's own lifetimeNgr is negative,
  // they earn $0 owed across the board (L1 + L2) until they climb back to
  // positive on their own players. This prevents the awkward situation
  // where Anthony (personal NGR -$966) collects $1.31 of L2 commission
  // from a profitable sub while himself $966 underwater. Per product
  // decision: must clear personal deficit before any earnings unlock.
  const ngrDeficit = lifetimeNgr < 0 ? -lifetimeNgr : 0;
  const personalDeficitBlocks = lifetimeNgr < 0;
  const owed = personalDeficitBlocks ? 0 : owedBeforeBlock;

  return {
    email: aff,
    revShareL1: cfg.revShareL1,
    revShareL2: cfg.revShareL2,
    l2Enabled: cfg.l2Enabled,
    lifetimeNgr,
    reportedNgr,
    purchases: ngr.purchases,
    redemptions: ngr.redemptions,
    totalBet,
    totalWin,
    rowsCounted: ngr.rowsCounted,
    playersTouched: Object.keys(ngr.playersSeen || {}).length,
    l1Earned,
    l2Earned,
    l2NetSubNgr,
    l2Breakdown,
    totalEarned,
    lifetimePaid,
    owedBeforeBlock,
    owed,
    // ngrDeficit  = how much positive NGR they need to add before any
    //               earnings unlock again (display: "must clear $X first").
    // payDeficit  = how much commission they were over-paid relative to
    //               what they've earned (back-end clawback tracking).
    // deficit     = legacy field, kept for backwards compat with existing
    //               UI; use ngrDeficit + payDeficit for the new logic.
    deficit: payDeficit,
    ngrDeficit,
    payDeficit,
    personalDeficitBlocks,
    inDeficit: ngrDeficit > 0.01 || payDeficit > 0.01
  };
}

/**
 * Compute every affiliate's ledger in one shot. Used by:
 *   - admin payouts page (balances list)
 *   - admin overview tab (totals)
 *   - admin /api/admin/ledger endpoint
 *
 * One pass over ngr_data + payouts means the numbers can never disagree
 * with themselves across the same render.
 */
async function computeAllLedgers(supabase, opts) {
  const options = opts || {};
  const ngrRows = options.ngrRows || (await fetchAllNgrRows(supabase));
  const payouts = options.payouts || (await fetchAllPayouts(supabase));

  let users = options.users;
  if (!users) {
    const { data } = await supabase
      .from('users')
      .select('email, rev_share_l1, rev_share_l2, l2_enabled, status, fullname, casino_referral_code, coinfrenzy_affiliate_id');
    users = data || [];
  }

  let players = options.players;
  if (!players) {
    const players_acc = await fetchAllPages((offset, limit) =>
      supabase.from('players').select(PLAYER_LOOKUP_SELECT).range(offset, offset + limit - 1)
    );
    players = players_acc;
  }

  let l2Rels = options.l2Rels;
  if (!l2Rels) {
    const { data } = await supabase
      .from('level2_relationships')
      .select('parent_affiliate, child_affiliate, l2_percent');
    l2Rels = data || [];
  }

  const lookups = buildAttribLookups(users, players);
  const ngrByAff = aggregateLifetimeNgr(ngrRows, lookups);
  const paidByAff = aggregateLifetimePaid(payouts);
  const revShareMap = buildRevShareMap(users);
  const l2ChildMap = buildL2ChildMap(l2Rels);

  // Union of every email that has any activity (NGR, payout, or user record),
  // so we don't silently drop affiliates who have payouts but no NGR yet.
  const allEmails = Object.create(null);
  Object.keys(ngrByAff).forEach(e => { allEmails[e] = true; });
  Object.keys(paidByAff).forEach(e => { allEmails[e] = true; });
  for (const u of users) {
    const e = norm(u.email);
    if (e) allEmails[e] = true;
  }

  const ledgers = {};
  Object.keys(allEmails).forEach(e => {
    ledgers[e] = buildLedgerFor(e, ngrByAff, paidByAff, revShareMap, l2ChildMap);
  });

  return {
    ledgers,
    raw: { ngrByAff, paidByAff, revShareMap, l2ChildMap, users, players, l2Rels, lookups }
  };
}

/**
 * Compute one affiliate's ledger. Cheaper than computeAllLedgers because we
 * only fetch what's needed, but L2 still requires sub-affiliate NGR so we
 * page that in too.
 */
async function computeLedgerForEmail(supabase, email) {
  const aff = norm(email);
  if (!aff) throw new Error('email is required');

  // We need every NGR row for this affiliate AND every NGR row for any of
  // their L2 children. Easiest: pull all rows once. ngr_data is small enough
  // for the foreseeable future; revisit if it gets >100k rows.
  const ngrRows = await fetchAllNgrRows(supabase);
  const payouts = await fetchAllPayouts(supabase);

  const { data: usersData } = await supabase
    .from('users')
    .select('email, rev_share_l1, rev_share_l2, l2_enabled, fullname, casino_referral_code, coinfrenzy_affiliate_id');
  const players = await fetchAllPages((offset, limit) =>
    supabase.from('players').select(PLAYER_LOOKUP_SELECT).range(offset, offset + limit - 1)
  );
  const { data: l2Data } = await supabase
    .from('level2_relationships')
    .select('parent_affiliate, child_affiliate, l2_percent');

  const lookups = buildAttribLookups(usersData || [], players || []);
  const ngrByAff = aggregateLifetimeNgr(ngrRows, lookups);
  const paidByAff = aggregateLifetimePaid(payouts);
  const revShareMap = buildRevShareMap(usersData || []);
  const l2ChildMap = buildL2ChildMap(l2Data || []);

  return buildLedgerFor(aff, ngrByAff, paidByAff, revShareMap, l2ChildMap);
}

module.exports = {
  // Public API
  computeAllLedgers,
  computeLedgerForEmail,

  // Lower-level building blocks (exported so admin UI mirror can match exactly)
  aggregateLifetimeNgr,
  aggregateLifetimePaid,
  buildRevShareMap,
  buildL2ChildMap,
  buildLedgerFor,
  buildAttribLookups,
  resolveAffiliateEmail,

  // Helpers
  norm,
  num,
  optionDNgr,

  // Constants useful for callers
  NGR_SELECT,
  PAYOUT_SELECT,
  USER_LOOKUP_SELECT,
  PLAYER_LOOKUP_SELECT
};
