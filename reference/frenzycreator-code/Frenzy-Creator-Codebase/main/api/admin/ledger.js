/**
 * GET /api/admin/ledger
 *
 * Returns the canonical lifetime ledger for every affiliate in one shot.
 * Single source of truth for:
 *   - admin payouts page (balances list, "Send Payout" modal totals)
 *   - admin overview tab (total NGR / total unpaid)
 *   - admin affiliate detail page (earned / paid / owed)
 *
 * Browser admin code MUST use this endpoint instead of recomputing locally.
 * If three different pages compute the same number three different ways
 * they WILL drift apart (see the Anthony bug: payouts said owed, dashboard
 * said negative, modal said something else again).
 *
 * Headers:  X-Admin-Token (required)
 * Response: {
 *   totals: { unpaid, totalEarned, lifetimePaid, lifetimeNgr, affiliateCount },
 *   ledgers: [ { email, fullname, status, ...ledger fields } ]
 * }
 */

const { createClient } = require('@supabase/supabase-js');
const { requireAdminAuth } = require('../_lib/adminAuth');
const { setCors } = require('../_lib/cors');
const { computeAllLedgers, norm } = require('../_lib/ledger');

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
    const { ledgers, raw } = await computeAllLedgers(supabase);
    const users = raw.users || [];
    const userByEmail = Object.create(null);
    users.forEach(u => {
      const e = norm(u.email);
      if (e) userByEmail[e] = u;
    });

    const enriched = Object.values(ledgers).map(l => {
      const u = userByEmail[l.email] || {};
      return Object.assign({}, l, {
        fullname: u.fullname || '',
        status: u.status || 'unknown'
      });
    });

    enriched.sort((a, b) => b.owed - a.owed);

    let unpaid = 0;
    let totalEarned = 0;
    let lifetimePaid = 0;
    let lifetimeNgr = 0;
    enriched.forEach(l => {
      unpaid += l.owed;
      totalEarned += l.totalEarned;
      lifetimePaid += l.lifetimePaid;
      lifetimeNgr += l.lifetimeNgr;
    });

    return res.status(200).json({
      totals: {
        unpaid,
        totalEarned,
        lifetimePaid,
        lifetimeNgr,
        affiliateCount: enriched.length,
        affiliatesOwedCount: enriched.filter(l => l.owed > 0.01).length,
        affiliatesInDeficitCount: enriched.filter(l => l.inDeficit).length
      },
      ledgers: enriched
    });
  } catch (err) {
    console.error('[admin/ledger]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
