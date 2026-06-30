/**
 * POST /api/partner/l2-earnings
 *
 * Returns the authenticated affiliate's L2 (sub-affiliate) view, computed
 * via the canonical ledger module so the numbers MATCH admin exactly.
 *
 * Implementation strategy: delegate everything to api/_lib/ledger.js
 * #computeAllLedgers — the same code path admin's overview tab uses.
 * Whatever admin shows for a given affiliate's L2, the partner sees the
 * same values here.
 *
 * Headers:  X-Partner-Token (required)
 * Response 200: {
 *   enabled, subs:[{displayName, playerCount, earnings, lifetimeNgr}],
 *   l2Rate, totalEarnings, totalPlayers, diagnostics
 * }
 * Response 401: { error: 'Unauthorized' }
 */

const { createClient } = require('@supabase/supabase-js');
const { requirePartnerAuth } = require('../_lib/partnerAuth');
const { setCors } = require('../_lib/cors');
const { computeAllLedgers, norm } = require('../_lib/ledger');

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
  const email = norm(partner.email);

  // Diagnostics surfaced both to Vercel logs AND to the client so any
  // future zero-display can be debugged in one round-trip.
  const diag = {
    parentEmail: email,
    rels: 0,
    childEmails: 0,
    childrenWithLedger: 0,
    totalPlayers: 0,
    totalEarnings: 0,
    l2Rate: 0,
    l2Enabled: false
  };

  try {
    // One canonical computation. Loads every ngr_data row, every payout,
    // every users row, every players row, every level2_relationships row,
    // builds attribution lookups, and produces a ledger per affiliate via
    // buildLedgerFor — exactly what admin's overview uses. Heavy but
    // correctness > cost, and it caches naturally on Vercel.
    const { ledgers, raw } = await computeAllLedgers(supabase);

    const parentLedger = ledgers[email];
    if (!parentLedger) {
      diag.note = 'no parent ledger — affiliate not in users table or ledger build skipped them';
      console.log('[partner/l2-earnings] ' + JSON.stringify(diag));
      return res.status(200).json({
        enabled: false,
        subs: [],
        l2Rate: 0,
        totalEarnings: 0,
        totalPlayers: 0,
        diagnostics: diag
      });
    }

    diag.l2Rate = parentLedger.revShareL2;
    diag.l2Enabled = parentLedger.l2Enabled;

    // Find this affiliate's children from the L2 child map. We INTENTIONALLY
    // surface relationships even when l2Enabled is false on the user record
    // — admin can assign a sub without remembering to flip the toggle, and
    // an explicit assignment is intent enough to render the section.
    const childEmails = (raw.l2ChildMap[email] || []).slice();
    diag.rels = childEmails.length;
    diag.childEmails = childEmails.length;

    if (childEmails.length === 0) {
      console.log('[partner/l2-earnings] ' + JSON.stringify(diag));
      return res.status(200).json({
        enabled: !!parentLedger.l2Enabled,
        subs: [],
        l2Rate: parentLedger.revShareL2,
        totalEarnings: 0,
        totalPlayers: 0,
        diagnostics: diag
      });
    }

    // Build a quick email -> friendly display name for anonymization.
    // Priority: users.fullname first word -> users.casino_referral_code
    // -> capitalized email local-part. We never leak the full email or
    // full name to the browser, but a recognizable handle ("Anthony"
    // or "anthony123") is far more useful than the generic
    // "Sub-Affiliate 2" placeholder users complained about.
    const nameMap = Object.create(null);
    function titleCase(s) {
      if (!s) return '';
      return String(s).charAt(0).toUpperCase() + String(s).slice(1);
    }
    (raw.users || []).forEach(u => {
      const e = norm(u.email);
      if (!e) return;
      const fn = (u.fullname || '').toString().trim().split(/\s+/)[0] || '';
      const handle = (u.casino_referral_code || '').toString().trim();
      if (fn) {
        nameMap[e] = fn;
      } else if (handle) {
        nameMap[e] = handle;
      }
    });

    // Per-sub registered-player count from the players table.
    // computeAllLedgers loads PLAYER_LOOKUP_SELECT (no totals), so for the
    // L2 view we count rows here — same denominator admin uses on its
    // affiliate profile ("Their Players"), which is the count of every
    // referred player whether or not they've deposited yet.
    //
    // ledger.playersTouched is intentionally narrower (NGR-active players
    // only) and would systematically under-count: a sub with 200 signups
    // and 37 first-time depositors should still show 200 here.
    const playerCountByChild = Object.create(null);
    (raw.players || []).forEach(p => {
      const ae = norm(p.affiliate_email);
      if (!ae) return;
      playerCountByChild[ae] = (playerCountByChild[ae] || 0) + 1;
    });

    // Per-child custom rate from level2_relationships, if set. Falls back
    // to the parent's revShareL2.
    const customRateByChild = Object.create(null);
    (raw.l2Rels || []).forEach(r => {
      const parent = norm(r.parent_affiliate);
      const child = norm(r.child_affiliate || r.sub_affiliate);
      if (parent !== email || !child) return;
      const pct = parseFloat(r.l2_percent);
      if (Number.isFinite(pct) && pct > 0) customRateByChild[child] = pct;
    });

    // Build per-sub view straight from the canonical ledger objects.
    // Each child's lifetimeNgr / playersTouched here match what admin
    // shows on the same affiliate's profile.
    let totalEarnings = 0;
    let totalPlayers = 0;
    let totalBet = 0;
    let totalWin = 0;
    let subIndex = 1;

    const subs = childEmails.map(child => {
      const childLedger = ledgers[child];
      const childNgr = childLedger ? childLedger.lifetimeNgr : 0;
      // Roll each sub's bet/win up so the parent partner can see total
      // network play volume (Total Play tile on the partner dashboard).
      // Pure activity signal — no commission contribution.
      if (childLedger) {
        totalBet += childLedger.totalBet || 0;
        totalWin += childLedger.totalWin || 0;
      }
      // Use registered-referral count (players table) so this matches
      // the "Their Players" number admin shows on the sub-affiliate's
      // profile, instead of the narrower NGR-active count.
      const playerCount = playerCountByChild[child] || 0;
      const ngrActivePlayers = childLedger ? childLedger.playersTouched : 0;
      if (childLedger) diag.childrenWithLedger += 1;

      const rate = customRateByChild[child] || parentLedger.revShareL2 || 5;
      // Per-child clamp at 0 so a deeply negative sub doesn't show as
      // negative earnings on the partner UI. Aggregate L2 commission below
      // also gates on max(0, l2NetSubNgr) per the canonical ledger rule.
      const earnings = childNgr > 0 ? childNgr * (rate / 100) : 0;
      const roundedEarnings = Math.round(earnings * 100) / 100;
      const roundedNgr = Math.round(childNgr * 100) / 100;

      totalPlayers += playerCount;
      totalEarnings += roundedEarnings;

      // Fallback chain so partners always see a recognizable handle
      // instead of "Sub-Affiliate N":
      //   1. users.fullname first word
      //   2. users.casino_referral_code
      //   3. capitalized local-part of the child email (e.g.
      //      "anthony@coinfrenzy.com" -> "Anthony")
      //   4. last resort: "Sub-Affiliate <N>" (only when child has no
      //      email at all, which shouldn't happen)
      let displayName = nameMap[child];
      if (!displayName) {
        const local = (child || '').split('@')[0] || '';
        if (local) displayName = titleCase(local);
      }
      if (!displayName) displayName = 'Sub-Affiliate ' + subIndex;
      subIndex += 1;

      return {
        displayName,
        playerCount,           // total referred players (matches admin)
        ngrActivePlayers,      // subset that has deposited/withdrawn
        earnings: roundedEarnings,
        // Surfacing lifetimeNgr lets the UI show "Building" vs "Earning"
        // status pills without having to recompute anything client-side.
        lifetimeNgr: roundedNgr
      };
    });

    // Sort: highest earners first, then highest player count. Mirrors
    // admin's sort order on the L2 section.
    subs.sort((a, b) => {
      if (b.earnings !== a.earnings) return b.earnings - a.earnings;
      return b.playerCount - a.playerCount;
    });

    // The canonical aggregate L2 commission is on max(0, l2NetSubNgr).
    // We use the parent's ledger.l2Earned directly so the totalEarnings
    // surfaced here MATCHES the L2 line on the payouts page exactly.
    const aggregateL2Earned = Math.round((parentLedger.l2Earned || 0) * 100) / 100;

    diag.totalPlayers = totalPlayers;
    diag.totalEarnings = aggregateL2Earned;
    diag.perChildEarningsSum = Math.round(totalEarnings * 100) / 100;
    diag.parentLifetimeNgr = parentLedger.lifetimeNgr;
    diag.l2NetSubNgr = parentLedger.l2NetSubNgr;
    diag.personalDeficitBlocks = parentLedger.personalDeficitBlocks;
    console.log('[partner/l2-earnings] ' + JSON.stringify(diag));

    return res.status(200).json({
      enabled: true,
      subs,
      l2Rate: parentLedger.revShareL2,
      // totalEarnings = canonical aggregate L2 earned (matches payouts).
      // perChildEarningsSum is informational — the sum of each clamped
      // child slice, which can exceed totalEarnings when one child is
      // deep negative (the aggregate clamps at $0 below the sum).
      totalEarnings: aggregateL2Earned,
      totalPlayers,
      // Network-level play volume from the L2 sub-tree. Partner UI
      // adds this to ledger.totalBet (their own L1 network) to show
      // a true "Total Play" number on the dashboard.
      totalBet: Math.round(totalBet * 100) / 100,
      totalWin: Math.round(totalWin * 100) / 100,
      diagnostics: diag
    });

  } catch (err) {
    console.error('[partner/l2-earnings] Unexpected error:', err, ' diag=', diag);
    return res.status(500).json({
      error: 'Internal server error',
      message: err && err.message ? err.message : String(err),
      diagnostics: diag
    });
  }
};
