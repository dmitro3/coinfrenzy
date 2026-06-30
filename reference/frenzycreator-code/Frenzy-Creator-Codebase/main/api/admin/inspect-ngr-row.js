/**
 * GET /api/admin/inspect-ngr-row?player_email=foo@bar.com
 * GET /api/admin/inspect-ngr-row?affiliate_email=foo@bar.com
 *
 * Forensic dump for a single player's (or affiliate's) raw ngr_data rows.
 *
 * Use case: "decoyhunter101 has $700.46 withdrawals on CoinFrenzy but our
 * admin shows $0." — we need to know which COLUMN in ngr_data holds the
 * 700.46 and whether our `getWithdrawal` accessor is checking it.
 *
 * Returns:
 *   - schema.available     — every column on the live ngr_data table
 *   - schema.aliasesByConcept — what `getDeposit/getWithdrawal/...` look at
 *   - rows                 — every ngr_data row matching the query, with:
 *       raw                — the full row JSON (every column)
 *       accessorResults    — what {deposit, withdrawal, ngr, ggr, commission}
 *                            our accessors return for this row
 *       columnsWithValue   — every column on this row that has a non-zero
 *                            numeric value, so you can spot money sitting
 *                            in a column we don't know about
 *   - columnSums           — sum of EVERY numeric column across the rows,
 *                            so the missing-money column jumps out: e.g.
 *                            "cashout_amount: $700.46" while our accessor
 *                            said withdrawals = $0
 *
 * Read-only. Admin-auth gated.
 */

const { createClient } = require('@supabase/supabase-js');
const { requireAdminAuth } = require('../_lib/adminAuth');
const { setCors } = require('../_lib/cors');
const {
  detectNgrColumns,
  describeSchema,
  FIELD_ALIASES,
  getDeposit,
  getWithdrawal,
  getBet,
  getWin,
  getGgr,
  // Kept ONLY for the diagnostic dump — see comment in ngrSchema.js.
  // Money-driving aggregators no longer use these.
  getNgr,
  getCommission
} = require('../_lib/ngrSchema');

const PAGE_SIZE = 1000;
const MAX_ROWS = 5000;

async function fetchAllMatching(supabase, filterFn) {
  const out = [];
  let offset = 0;
  while (offset < MAX_ROWS) {
    const q = filterFn(supabase.from('ngr_data').select('*').range(offset, offset + PAGE_SIZE - 1));
    const { data, error } = await q;
    if (error) throw error;
    const rows = data || [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return out;
}

module.exports = async function handler(req, res) {
  setCors(res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const admin = requireAdminAuth(req, res);
  if (!admin) return;

  const playerEmail = String((req.query && req.query.player_email) || '').trim().toLowerCase();
  const affiliateEmail = String((req.query && req.query.affiliate_email) || '').trim().toLowerCase();
  const playerId = String((req.query && req.query.player_id) || '').trim();

  if (!playerEmail && !affiliateEmail && !playerId) {
    return res.status(400).json({ error: 'one of player_email, affiliate_email, player_id required' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const availableCols = await detectNgrColumns(supabase, { force: true });
    const schemaInfo = describeSchema(availableCols);

    const rows = await fetchAllMatching(supabase, (q) => {
      if (playerEmail) return q.ilike('player_email', playerEmail);
      if (affiliateEmail) return q.ilike('affiliate_email', affiliateEmail);
      return q.eq('player_id', playerId);
    });

    // Column-by-column sums across ALL fetched rows. The missing-money
    // column reveals itself instantly: if `cashout_amount` sums to $700.46
    // and our accessors said withdrawals=$0, we know `cashout_amount` is
    // the column to add to the withdrawal alias list.
    //
    // We aggressively skip non-monetary columns (date strings, ids, etc.)
    // so the "money in unknown columns" banner only fires for real money.
    // A naive parseFloat would think `report_period: "2026-04-20T..."` is
    // a number and flag it as $4,052 of "missing money" — that's a false
    // alarm and erodes trust in the diagnostic.
    const NON_MONETARY = new Set([
      'id', 'created_at', 'updated_at',
      'report_period', 'report_month', 'period', 'month',
      'affiliate_email', 'affiliate_username', 'player_email', 'player_id',
      'currency', 'status', 'type', 'source',
      // Rate / percentage columns. CF sends commission_percent for legacy
      // reasons; it's not money and must never appear in the
      // "unrecognized money" warning. Anything ending in _percent / _pct
      // / _rate is also stripped below.
      'commission_percent', 'commission_pct', 'commission_rate',
      'rev_share', 'rev_share_pct', 'revshare_pct', 'rate', 'pct',
      'percentage'
    ]);
    const isMonetaryCandidate = (key, raw) => {
      if (NON_MONETARY.has(key)) return false;
      if (key.endsWith('_id') || key.endsWith('_at') || key.endsWith('_email') || key.endsWith('_username')) return false;
      // Strip rate-shaped suffixes generically so future columns don't
      // creep back in (e.g. `bonus_rate`, `house_pct`).
      if (key.endsWith('_percent') || key.endsWith('_pct') || key.endsWith('_rate') || key.endsWith('_percentage')) return false;
      // Reject any string that looks like a date / iso timestamp / range
      // (e.g. "2026-04-20T14:00:00.000Z", "2026-04-20_14:00_to_..."). A
      // bare number-as-string like "100.50" is fine.
      if (typeof raw === 'string') {
        if (/[a-zA-Z]/.test(raw)) return false; // any letters = not money
        if (raw.includes(':') || raw.includes('T') || raw.includes('_')) return false;
        if (/^\d{4}-\d{2}/.test(raw)) return false; // YYYY-MM... is a date
      }
      // Also reject yyyymm-shaped numerics (e.g. 202604) that report_month
      // sometimes uses. Real money won't be a clean 6-digit integer
      // starting with "20".
      const n = parseFloat(raw);
      if (Number.isInteger(n) && n >= 200001 && n <= 209912 && Math.abs(n - Math.round(n)) < 1e-9) {
        // 200001-209912 covers yyyymm dates from year 2000 to 2099
        return false;
      }
      return true;
    };
    const columnSums = {};
    const columnNonZeroCounts = {};
    rows.forEach((r) => {
      Object.keys(r || {}).forEach((k) => {
        const v = r[k];
        if (v === null || v === undefined || v === '') return;
        if (!isMonetaryCandidate(k, v)) return;
        const n = parseFloat(v);
        if (!Number.isFinite(n)) return;
        columnSums[k] = (columnSums[k] || 0) + n;
        if (n !== 0) columnNonZeroCounts[k] = (columnNonZeroCounts[k] || 0) + 1;
      });
    });

    // For each row, compute what our accessors return and which non-zero
    // columns exist that our accessors did NOT pick up — those are the
    // suspects for missing money.
    const knownConceptColumns = new Set([
      ...FIELD_ALIASES.deposit,
      ...FIELD_ALIASES.withdrawal,
      ...FIELD_ALIASES.bet,
      ...FIELD_ALIASES.win,
      ...FIELD_ALIASES.ggr,
      ...FIELD_ALIASES.ngr,
      ...FIELD_ALIASES.commission
    ]);

    const enrichedRows = rows.map((r) => {
      const accessorResults = {
        deposit: getDeposit(r),
        withdrawal: getWithdrawal(r),
        bet: getBet(r),
        win: getWin(r),
        ggr: getGgr(r),
        // ngr / commission are LEGACY — surfaced here only so an admin can
        // confirm CF really has stopped sending them. Don't read these
        // anywhere that drives money.
        ngr: getNgr(r),
        commission: getCommission(r)
      };
      const columnsWithValue = {};
      const unknownNumericCols = {};
      Object.keys(r || {}).forEach((k) => {
        const v = r[k];
        if (v === null || v === undefined || v === '') return;
        if (!isMonetaryCandidate(k, v)) return;
        const n = parseFloat(v);
        if (!Number.isFinite(n) || n === 0) return;
        columnsWithValue[k] = n;
        if (!knownConceptColumns.has(k)) {
          unknownNumericCols[k] = n;
        }
      });
      return {
        raw: r,
        accessorResults,
        columnsWithValue,
        unknownNumericCols
      };
    });

    return res.status(200).json({
      ok: true,
      generated_at: new Date().toISOString(),
      query: { player_email: playerEmail || null, affiliate_email: affiliateEmail || null, player_id: playerId || null },
      schema: {
        ...schemaInfo,
        aliasesByConcept: FIELD_ALIASES
      },
      rowCount: rows.length,
      columnSums,
      columnNonZeroCounts,
      rows: enrichedRows
    });
  } catch (err) {
    console.error('[admin/inspect-ngr-row] failed:', err);
    return res.status(500).json({ error: err.message || 'inspect failed' });
  }
};
