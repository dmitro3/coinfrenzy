/**
 * api/_lib/ngrSchema.js
 *
 * Single source of truth for reading the `ngr_data` table when we DON'T
 * control the schema. CoinFrenzy (or whoever is writing into Supabase
 * directly) has changed column names more than once. The previous strategy
 * of asking for an explicit column list (`select 'purchase_amount, ...'`)
 * crashes the entire query the moment one of those columns is missing —
 * which is exactly why the dashboard, affiliate cards, and Integrity tab
 * all silently went to $0 today.
 *
 * Strategy:
 *   1. detectNgrColumns() does ONE `select * limit 1` to find out what
 *      columns actually exist in the live database. Result is cached at
 *      module level for ~60s so we don't hammer Supabase on every call.
 *   2. Aggregators read each financial concept (deposit, withdrawal, NGR,
 *      GGR, commission) through accessor helpers that try every known
 *      column-name variant. New names CF picks tomorrow can be added in
 *      one place here and every page picks them up.
 *   3. Pages that build a SELECT string ask for `*` instead of a fixed
 *      list. Supabase's row size is small enough that the network cost
 *      is irrelevant compared to the cost of being wrong.
 *
 * SAFETY NOTE: do NOT add a name to one of the alias arrays below unless
 * you're 100% sure that column means the same thing semantically. A wrong
 * alias would silently double-count or miscategorize money. When in doubt
 * leave it out and have your dev pick from the existing names.
 */

'use strict';

// Known aliases for each financial concept. Listed in priority order —
// the FIRST present non-null/undefined value wins. Add new names to the
// END of each list so existing precedence is preserved.
//
// OWNERSHIP NOTE (2026-04):
//   We compute NGR + commission ourselves (Option D, applied to lifetime
//   cash flow). CoinFrenzy's NGR / commission columns are NO LONGER
//   sent — and even if a stale row arrives we ignore them. The only
//   numbers we trust from the feed are the raw cash flows:
//
//     deposit / withdrawal  → cash in / cash out (drives our NGR)
//     bet     / win         → total wagered / total won (informational)
//
//   `ngr` and `commission` aliases below are kept solely so a one-off
//   audit query (or the inspect-ngr-row debug tool) can surface a stray
//   value. They are NOT read into any aggregator that drives money.
const FIELD_ALIASES = {
  deposit: [
    'purchase_amount',
    'deposit_amount',
    'deposits',
    'total_deposits',
    'purchase',
    'deposit'
  ],
  withdrawal: [
    'redemption_amount',
    'redeem_amount',
    'withdrawal_amount',
    'withdrawals',
    'total_withdrawals',
    'redemption',
    'withdrawal'
  ],
  // Total wagered (sum of every bet placed). Drives the "Wagered" /
  // "Total Play" tiles on admin + partner dashboards. Pure volume signal —
  // does NOT participate in NGR / commission math.
  bet: [
    'bet_amount',
    'bet_total',
    'total_bet',
    'wagered_amount',
    'wagered',
    'wager_amount',
    'wagers',
    'turnover',
    'handle',
    'bets'
  ],
  // Total won (sum of every winning payout). Drives the "Won" tiles.
  // Pure volume signal — does NOT participate in NGR / commission math.
  win: [
    'win_amount',
    'win_total',
    'total_win',
    'winnings_amount',
    'winnings',
    'won_amount',
    'wins'
  ],
  // GGR = bet − win. Read straight from CF when present, but we can also
  // derive it from bet/win if needed. Also informational.
  ggr: [
    'ggr_amount',
    'ggr',
    'gross_gaming_revenue',
    'total_ggr'
  ],
  // DEPRECATED — CF stopped sending these as of 2026-04. Kept for the
  // diagnostic dump only; never read by money-driving aggregators.
  ngr: [
    'ngr_amount',
    'ngr',
    'net_gaming_revenue',
    'total_ngr'
  ],
  commission: [
    'commission_amount',
    'commission',
    'comm_amount',
    'comm'
  ]
};

// Columns that admin queries always want when present. We intersect this
// list with whatever the live schema actually has.
const PREFERRED_COLUMNS = [
  'id',
  'affiliate_email',
  'affiliate_username',
  'player_id',
  'player_email',
  'report_period',
  'report_month',
  'created_at',
  // every alias for every concept
  ...FIELD_ALIASES.deposit,
  ...FIELD_ALIASES.withdrawal,
  ...FIELD_ALIASES.bet,
  ...FIELD_ALIASES.win,
  ...FIELD_ALIASES.ggr,
  ...FIELD_ALIASES.ngr,
  ...FIELD_ALIASES.commission
];

let _cachedColumns = null;
let _cachedAt = 0;
const CACHE_TTL_MS = 60 * 1000;

/**
 * Probe the ngr_data table to find out which columns actually exist.
 * Cached for 60s so we don't probe on every request.
 *
 * Returns: Set<string> of available column names. Empty set on failure.
 */
async function detectNgrColumns(supabase, { force = false } = {}) {
  const now = Date.now();
  if (!force && _cachedColumns && (now - _cachedAt) < CACHE_TTL_MS) {
    return _cachedColumns;
  }
  try {
    // limit(1) is enough to see the column shape. If the table is empty
    // we get back data: [] but no error, and we can't introspect — so we
    // fall back to PREFERRED_COLUMNS minus the ones we know often break.
    const { data, error } = await supabase
      .from('ngr_data')
      .select('*')
      .limit(1);
    if (error) {
      console.warn('[ngrSchema] detect probe errored:', error.message);
      // On error return the preferred set so callers still get SOMETHING;
      // individual queries will fail loudly if a column is missing but at
      // least we don't 500 on every request.
      _cachedColumns = new Set(PREFERRED_COLUMNS);
      _cachedAt = now;
      return _cachedColumns;
    }
    if (data && data.length > 0) {
      _cachedColumns = new Set(Object.keys(data[0]));
    } else {
      // Empty table — assume everything is present so writes can happen,
      // but mark cache as short so we re-probe quickly.
      _cachedColumns = new Set(PREFERRED_COLUMNS);
    }
    _cachedAt = now;
    return _cachedColumns;
  } catch (e) {
    console.warn('[ngrSchema] detect threw:', e.message);
    _cachedColumns = new Set(PREFERRED_COLUMNS);
    _cachedAt = now;
    return _cachedColumns;
  }
}

/**
 * Build a SELECT string containing only columns that exist. Use this
 * when you specifically want to constrain the payload size; otherwise
 * just `select *`.
 *
 *   const cols = await detectNgrColumns(supabase);
 *   const sel  = buildNgrSelect(['affiliate_email','ngr_amount'], cols);
 */
function buildNgrSelect(desired, available) {
  if (!available || available.size === 0) return desired.join(', ');
  return desired.filter(c => available.has(c)).join(', ');
}

/**
 * Read a financial value from a row using the alias chain. Returns 0 if
 * none of the aliased columns are present or non-numeric.
 */
function readField(row, concept) {
  if (!row) return 0;
  const aliases = FIELD_ALIASES[concept];
  if (!aliases) return 0;
  for (const k of aliases) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') {
      const n = parseFloat(row[k]);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

const getDeposit       = (row) => readField(row, 'deposit');
const getWithdrawal    = (row) => readField(row, 'withdrawal');
const getBet           = (row) => readField(row, 'bet');
const getWin           = (row) => readField(row, 'win');
const getGgr           = (row) => readField(row, 'ggr');
// DEPRECATED — see comment on FIELD_ALIASES.ngr / .commission. These
// stay so the row-inspector can spot a stray legacy value but they are
// NOT consumed by any aggregator that drives money.
const getNgr           = (row) => readField(row, 'ngr');
const getCommission    = (row) => readField(row, 'commission');

/**
 * Diagnostic: which of the standard concepts have AT LEAST ONE matching
 * column in the live schema. Used by the Integrity tab to surface
 * "withdrawal column missing — every NGR row will look like pure profit".
 */
function describeSchema(availableSet) {
  const out = {
    available: Array.from(availableSet || []).sort(),
    concepts: {}
  };
  for (const concept of Object.keys(FIELD_ALIASES)) {
    const present = FIELD_ALIASES[concept].filter(c => availableSet && availableSet.has(c));
    out.concepts[concept] = {
      present,
      hasAny: present.length > 0
    };
  }
  return out;
}

module.exports = {
  FIELD_ALIASES,
  PREFERRED_COLUMNS,
  detectNgrColumns,
  buildNgrSelect,
  readField,
  getDeposit,
  getWithdrawal,
  getBet,
  getWin,
  getGgr,
  getNgr,
  getCommission,
  describeSchema
};
