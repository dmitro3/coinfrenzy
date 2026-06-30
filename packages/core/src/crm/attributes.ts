// docs/11 §3 — CRM attribute registry.
//
// The single source of truth for every player attribute the segment
// builder, variable engine, and compiler can address. Each attribute
// declares:
//
//   - identity: stable `key` + human label + category
//   - shape: `valueType` (number/string/date/boolean/enum/game/provider/category/tier)
//   - operators: which operators are legal for this attribute
//   - source: how to express the attribute in SQL (column, expression,
//             correlated subquery, predicate, or parameterized predicate)
//
// The compiler reads this registry to translate a filter tree into a
// parameterized WHERE clause + the JOINs it needs. The UI reads it (via
// /api/admin/crm/attributes) to drive the operator menu, value input,
// and category grouping in the segment builder.
//
// SAFETY: every SQL fragment in this file is a static string; values
// are passed through the `params` array (positional `$N` placeholders).
// Adding a new attribute MUST NOT take user input and stitch it into
// the fragment — extend `OperatorKey` + the compiler if you need a new
// shape.

export type ValueType =
  | 'number'
  | 'string'
  | 'date'
  | 'boolean'
  | 'enum'
  | 'game'
  | 'provider'
  | 'category'
  | 'tier'

export type OperatorKey =
  | '='
  | '!='
  | '>'
  | '<'
  | '>='
  | '<='
  | 'between'
  | 'in_list'
  | 'not_in_list'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'is_set'
  | 'is_not_set'
  | 'is_true'
  | 'is_false'
  | 'before'
  | 'after'
  | 'on'
  | 'in_last_n_days'
  | 'more_than_n_days_ago'

export type AttributeCategory =
  | 'identity'
  | 'geo'
  | 'compliance'
  | 'lifecycle'
  | 'financial_lifetime'
  | 'financial_window'
  | 'balances'
  | 'bonus'
  | 'tier'
  | 'game_activity'
  | 'classification'
  | 'crm_history'

export type JoinAlias =
  | 'players'
  | 'tier_progress'
  | 'tiers'
  | 'lifetime_stats'
  | 'stats_30d'
  | 'wallet_sc'
  | 'wallet_gc'

export interface AttributeDef {
  key: string
  label: string
  category: AttributeCategory
  valueType: ValueType
  operators: OperatorKey[]
  /** Brief help text shown beneath the field in the builder. */
  description?: string
  /** True for correlated subqueries — UI hints "may be slower". */
  expensive?: boolean
  /** Enum options when valueType === 'enum'. */
  enumOptions?: string[]
  source: AttributeSource
}

export type AttributeSource =
  /** Column on `players p` — emit `p.<col>`. Joins not needed. */
  | { kind: 'column'; column: string }
  /** SQL expression resolving to a value for the row. Add joins if needed. */
  | { kind: 'expression'; sql: string; joins: JoinAlias[] }
  /** Correlated subquery resolving to a scalar — wrap parens at compile. */
  | { kind: 'subquery'; sql: string; expensive?: boolean }
  /**
   * Boolean classification — only `is_true`/`is_false` apply. The compiler
   * emits `(<truthy>)` or `NOT (<truthy>)`.
   */
  | { kind: 'predicate'; truthy: string; joins?: JoinAlias[] }
  /**
   * Parameterized predicate — value carries an entity id (game/provider/
   * category) that gets bound positionally. `truthy(paramRef)` returns
   * an SQL string referring to e.g. `$3`.
   */
  | {
      kind: 'predicate_param'
      truthy: (paramRef: string) => string
      paramKind: 'game' | 'provider' | 'category'
    }

// ---------------------------------------------------------------------------
// Operator metadata
// ---------------------------------------------------------------------------

export const OPERATOR_LABELS: Record<OperatorKey, string> = {
  '=': 'is',
  '!=': 'is not',
  '>': 'greater than',
  '<': 'less than',
  '>=': 'greater than or equal',
  '<=': 'less than or equal',
  between: 'between',
  in_list: 'is any of',
  not_in_list: 'is none of',
  contains: 'contains',
  not_contains: 'does not contain',
  starts_with: 'starts with',
  ends_with: 'ends with',
  is_set: 'is set',
  is_not_set: 'is not set',
  is_true: 'is true',
  is_false: 'is false',
  before: 'before',
  after: 'after',
  on: 'on',
  in_last_n_days: 'in the last N days',
  more_than_n_days_ago: 'more than N days ago',
}

const NUMBER_OPS: OperatorKey[] = [
  '=',
  '!=',
  '>',
  '<',
  '>=',
  '<=',
  'between',
  'is_set',
  'is_not_set',
]
const STRING_OPS: OperatorKey[] = [
  '=',
  '!=',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'in_list',
  'not_in_list',
  'is_set',
  'is_not_set',
]
const DATE_OPS: OperatorKey[] = [
  'before',
  'after',
  'on',
  'between',
  'in_last_n_days',
  'more_than_n_days_ago',
  'is_set',
  'is_not_set',
]
const BOOLEAN_OPS: OperatorKey[] = ['is_true', 'is_false']
const ENUM_OPS: OperatorKey[] = ['=', '!=', 'in_list', 'not_in_list', 'is_set', 'is_not_set']
const PICKER_OPS: OperatorKey[] = ['is_true', 'is_false']

// ---------------------------------------------------------------------------
// SQL fragment helpers (used inside attribute defs only)
// ---------------------------------------------------------------------------

/** Approved redemption statuses considered "successful" for revenue stats. */
const REDEMPTION_OK = `('paid', 'approved')`

/** Successful purchase status. */
const PURCHASE_OK = `'succeeded'`

// ---------------------------------------------------------------------------
// Registry — every attribute is declared here.
// ---------------------------------------------------------------------------

const REG: AttributeDef[] = [
  // Identity --------------------------------------------------------------
  {
    key: 'email',
    label: 'Email',
    category: 'identity',
    valueType: 'string',
    operators: STRING_OPS,
    source: { kind: 'column', column: 'email' },
  },
  {
    key: 'username',
    label: 'Username',
    category: 'identity',
    valueType: 'string',
    operators: STRING_OPS,
    source: { kind: 'column', column: 'username' },
  },
  {
    key: 'phone',
    label: 'Phone',
    category: 'identity',
    valueType: 'string',
    operators: STRING_OPS,
    source: { kind: 'column', column: 'phone' },
  },
  {
    key: 'first_name',
    label: 'First name',
    category: 'identity',
    valueType: 'string',
    operators: STRING_OPS,
    source: { kind: 'column', column: 'first_name' },
  },
  {
    key: 'last_name',
    label: 'Last name',
    category: 'identity',
    valueType: 'string',
    operators: STRING_OPS,
    source: { kind: 'column', column: 'last_name' },
  },
  {
    key: 'full_name',
    label: 'Full name',
    category: 'identity',
    valueType: 'string',
    operators: STRING_OPS,
    description: 'first + last, falling back to display name then email',
    source: {
      kind: 'expression',
      sql: `coalesce(p.first_name || ' ' || p.last_name, p.display_name, p.email)`,
      joins: [],
    },
  },

  // Geo -------------------------------------------------------------------
  {
    key: 'signup_state',
    label: 'Signup state',
    category: 'geo',
    valueType: 'string',
    operators: ENUM_OPS,
    source: { kind: 'column', column: 'signup_state' },
  },
  {
    key: 'current_state',
    label: 'Current state',
    category: 'geo',
    valueType: 'string',
    operators: ENUM_OPS,
    description: 'state of record on the player profile (no live geo-IP)',
    source: { kind: 'column', column: 'state' },
  },
  {
    key: 'country',
    label: 'Country',
    category: 'geo',
    valueType: 'string',
    operators: ENUM_OPS,
    source: { kind: 'column', column: 'country' },
  },
  {
    key: 'signup_country',
    label: 'Signup country',
    category: 'geo',
    valueType: 'string',
    operators: ENUM_OPS,
    source: { kind: 'column', column: 'signup_country' },
  },

  // Compliance ------------------------------------------------------------
  {
    key: 'kyc_level',
    label: 'KYC level',
    category: 'compliance',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: { kind: 'column', column: 'kyc_level' },
  },
  {
    key: 'kyc_verified_at',
    label: 'KYC verified at',
    category: 'compliance',
    valueType: 'date',
    operators: DATE_OPS,
    source: { kind: 'column', column: 'kyc_verified_at' },
  },
  {
    key: 'self_exclusion_status',
    label: 'Self-excluded',
    category: 'compliance',
    valueType: 'boolean',
    operators: BOOLEAN_OPS,
    source: {
      kind: 'predicate',
      truthy: `(p.rg_self_excluded_until IS NOT NULL AND p.rg_self_excluded_until > NOW())`,
    },
  },
  {
    key: 'self_exclusion_until',
    label: 'Self-exclusion ends',
    category: 'compliance',
    valueType: 'date',
    operators: DATE_OPS,
    source: { kind: 'column', column: 'rg_self_excluded_until' },
  },
  {
    key: 'rg_deposit_limit_daily',
    label: 'Daily purchase limit (USD)',
    category: 'compliance',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: { kind: 'column', column: 'rg_deposit_limit_daily' },
  },
  {
    key: 'rg_deposit_limit_weekly',
    label: 'Weekly purchase limit (USD)',
    category: 'compliance',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: { kind: 'column', column: 'rg_deposit_limit_weekly' },
  },
  {
    key: 'rg_deposit_limit_monthly',
    label: 'Monthly purchase limit (USD)',
    category: 'compliance',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: { kind: 'column', column: 'rg_deposit_limit_monthly' },
  },
  {
    key: 'aml_flag_count',
    label: 'AML flag count (active)',
    category: 'compliance',
    valueType: 'number',
    operators: NUMBER_OPS,
    expensive: true,
    source: {
      kind: 'subquery',
      sql: `(SELECT COUNT(*) FROM compliance_flags cf WHERE cf.player_id = p.id AND cf.flag_type = 'aml' AND cf.cleared_at IS NULL)`,
    },
  },
  {
    key: 'terms_accepted_at',
    label: 'Marketing consent at',
    category: 'compliance',
    valueType: 'date',
    operators: DATE_OPS,
    description: 'aliased to marketing_consent_at — no separate terms timestamp today',
    source: { kind: 'column', column: 'marketing_consent_at' },
  },
  {
    key: 'marketing_consent',
    label: 'Email marketing consent',
    category: 'compliance',
    valueType: 'boolean',
    operators: BOOLEAN_OPS,
    source: { kind: 'predicate', truthy: `p.email_consent = true` },
  },

  // Lifecycle dates -------------------------------------------------------
  {
    key: 'registered_at',
    label: 'Registered at',
    category: 'lifecycle',
    valueType: 'date',
    operators: DATE_OPS,
    source: { kind: 'column', column: 'created_at' },
  },
  {
    key: 'first_purchase_at',
    label: 'First purchase at',
    category: 'lifecycle',
    valueType: 'date',
    operators: DATE_OPS,
    source: { kind: 'expression', sql: `pls.first_purchase_at`, joins: ['lifetime_stats'] },
  },
  {
    key: 'last_purchase_at',
    label: 'Last purchase at',
    category: 'lifecycle',
    valueType: 'date',
    operators: DATE_OPS,
    source: { kind: 'expression', sql: `pls.last_purchase_at`, joins: ['lifetime_stats'] },
  },
  {
    key: 'last_redemption_at',
    label: 'Last redemption at',
    category: 'lifecycle',
    valueType: 'date',
    operators: DATE_OPS,
    expensive: true,
    source: {
      kind: 'subquery',
      sql: `(SELECT MAX(created_at) FROM redemptions r WHERE r.player_id = p.id AND r.status IN ${REDEMPTION_OK})`,
    },
  },
  {
    key: 'last_login_at',
    label: 'Last login at',
    category: 'lifecycle',
    valueType: 'date',
    operators: DATE_OPS,
    source: { kind: 'column', column: 'last_login_at' },
  },
  {
    key: 'last_bet_at',
    label: 'Last bet at',
    category: 'lifecycle',
    valueType: 'date',
    operators: DATE_OPS,
    expensive: true,
    source: {
      kind: 'subquery',
      sql: `(SELECT MAX(bet_at) FROM game_rounds gr WHERE gr.player_id = p.id)`,
    },
  },
  {
    key: 'last_win_at',
    label: 'Last win at',
    category: 'lifecycle',
    valueType: 'date',
    operators: DATE_OPS,
    expensive: true,
    source: {
      kind: 'subquery',
      sql: `(SELECT MAX(won_at) FROM game_rounds gr WHERE gr.player_id = p.id AND gr.win_amount > 0)`,
    },
  },
  {
    key: 'last_bonus_at',
    label: 'Last bonus at',
    category: 'lifecycle',
    valueType: 'date',
    operators: DATE_OPS,
    source: {
      kind: 'subquery',
      sql: `(SELECT MAX(created_at) FROM bonuses_awarded ba WHERE ba.player_id = p.id)`,
    },
  },
  {
    key: 'last_session_started_at',
    label: 'Last session started',
    category: 'lifecycle',
    valueType: 'date',
    operators: DATE_OPS,
    source: { kind: 'expression', sql: `pls.last_session_at`, joins: ['lifetime_stats'] },
  },

  // Financial — lifetime --------------------------------------------------
  {
    key: 'lifetime_spend_usd',
    label: 'Lifetime spend (USD)',
    category: 'financial_lifetime',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: { kind: 'expression', sql: `pls.total_deposited_usd`, joins: ['lifetime_stats'] },
  },
  {
    key: 'lifetime_redeemed_usd',
    label: 'Lifetime redeemed (USD)',
    category: 'financial_lifetime',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: { kind: 'expression', sql: `pls.total_redeemed_usd`, joins: ['lifetime_stats'] },
  },
  {
    key: 'lifetime_net_position_usd',
    label: 'Lifetime net position (USD)',
    category: 'financial_lifetime',
    valueType: 'number',
    operators: NUMBER_OPS,
    description: 'spend − redeemed',
    source: { kind: 'expression', sql: `pls.net_position_usd`, joins: ['lifetime_stats'] },
  },
  {
    key: 'lifetime_purchase_count',
    label: 'Lifetime purchase count',
    category: 'financial_lifetime',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: { kind: 'expression', sql: `pls.purchase_count`, joins: ['lifetime_stats'] },
  },
  {
    key: 'lifetime_redemption_count',
    label: 'Lifetime redemption count',
    category: 'financial_lifetime',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: { kind: 'expression', sql: `pls.redemption_count`, joins: ['lifetime_stats'] },
  },
  {
    key: 'lifetime_bet_count',
    label: 'Lifetime bet count',
    category: 'financial_lifetime',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: { kind: 'expression', sql: `pls.round_count`, joins: ['lifetime_stats'] },
  },
  {
    key: 'lifetime_win_count',
    label: 'Lifetime win count',
    category: 'financial_lifetime',
    valueType: 'number',
    operators: NUMBER_OPS,
    expensive: true,
    source: {
      kind: 'subquery',
      sql: `(SELECT COUNT(*) FROM game_rounds gr WHERE gr.player_id = p.id AND gr.win_amount > 0)`,
    },
  },
  {
    key: 'lifetime_largest_purchase_usd',
    label: 'Largest single purchase (USD)',
    category: 'financial_lifetime',
    valueType: 'number',
    operators: NUMBER_OPS,
    expensive: true,
    source: {
      kind: 'subquery',
      sql: `(SELECT MAX(amount_usd) FROM purchases pu WHERE pu.player_id = p.id AND pu.status = ${PURCHASE_OK})`,
    },
  },
  {
    key: 'lifetime_largest_win_sc',
    label: 'Largest single win (SC)',
    category: 'financial_lifetime',
    valueType: 'number',
    operators: NUMBER_OPS,
    expensive: true,
    source: {
      kind: 'subquery',
      sql: `(SELECT MAX(win_amount) FROM game_rounds gr WHERE gr.player_id = p.id AND gr.currency = 'SC')`,
    },
  },
  {
    key: 'lifetime_largest_redemption_usd',
    label: 'Largest single redemption (USD)',
    category: 'financial_lifetime',
    valueType: 'number',
    operators: NUMBER_OPS,
    expensive: true,
    source: {
      kind: 'subquery',
      sql: `(SELECT MAX(amount_usd) FROM redemptions r WHERE r.player_id = p.id AND r.status IN ${REDEMPTION_OK})`,
    },
  },
  {
    key: 'lifetime_sc_wagered',
    label: 'Lifetime SC wagered',
    category: 'financial_lifetime',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: { kind: 'expression', sql: `pls.total_wagered_sc`, joins: ['lifetime_stats'] },
  },
  {
    key: 'lifetime_sc_won',
    label: 'Lifetime SC won',
    category: 'financial_lifetime',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: { kind: 'expression', sql: `pls.total_won_sc`, joins: ['lifetime_stats'] },
  },
  {
    key: 'lifetime_gc_wagered',
    label: 'Lifetime GC wagered',
    category: 'financial_lifetime',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: { kind: 'expression', sql: `pls.total_wagered_gc`, joins: ['lifetime_stats'] },
  },
  {
    key: 'lifetime_gc_won',
    label: 'Lifetime GC won',
    category: 'financial_lifetime',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: { kind: 'expression', sql: `pls.total_won_gc`, joins: ['lifetime_stats'] },
  },

  // Financial — windowed --------------------------------------------------
  {
    key: '7d_spend_usd',
    label: '7d spend (USD)',
    category: 'financial_window',
    valueType: 'number',
    operators: NUMBER_OPS,
    expensive: true,
    source: {
      kind: 'subquery',
      sql: `(SELECT COALESCE(SUM(amount_usd), 0) FROM purchases pu WHERE pu.player_id = p.id AND pu.status = ${PURCHASE_OK} AND pu.created_at > NOW() - INTERVAL '7 days')`,
    },
  },
  {
    key: '7d_redeemed_usd',
    label: '7d redeemed (USD)',
    category: 'financial_window',
    valueType: 'number',
    operators: NUMBER_OPS,
    expensive: true,
    source: {
      kind: 'subquery',
      sql: `(SELECT COALESCE(SUM(amount_usd), 0) FROM redemptions r WHERE r.player_id = p.id AND r.status IN ${REDEMPTION_OK} AND r.created_at > NOW() - INTERVAL '7 days')`,
    },
  },
  {
    key: '7d_bet_count',
    label: '7d bet count',
    category: 'financial_window',
    valueType: 'number',
    operators: NUMBER_OPS,
    expensive: true,
    source: {
      kind: 'subquery',
      sql: `(SELECT COUNT(*) FROM game_rounds gr WHERE gr.player_id = p.id AND gr.created_at > NOW() - INTERVAL '7 days')`,
    },
  },
  {
    key: '7d_login_count',
    label: '7d login count',
    category: 'financial_window',
    valueType: 'number',
    operators: NUMBER_OPS,
    expensive: true,
    source: {
      kind: 'subquery',
      sql: `(SELECT COUNT(*) FROM player_events pe WHERE pe.player_id = p.id AND pe.event_name = 'player.login' AND pe.created_at > NOW() - INTERVAL '7 days')`,
    },
  },
  {
    key: '30d_spend_usd',
    label: '30d spend (USD)',
    category: 'financial_window',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: { kind: 'expression', sql: `p30.deposited_usd_30d`, joins: ['stats_30d'] },
  },
  {
    key: '30d_redeemed_usd',
    label: '30d redeemed (USD)',
    category: 'financial_window',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: { kind: 'expression', sql: `p30.redeemed_usd_30d`, joins: ['stats_30d'] },
  },
  {
    key: '30d_bet_count',
    label: '30d bet count',
    category: 'financial_window',
    valueType: 'number',
    operators: NUMBER_OPS,
    expensive: true,
    source: {
      kind: 'subquery',
      sql: `(SELECT COUNT(*) FROM game_rounds gr WHERE gr.player_id = p.id AND gr.created_at > NOW() - INTERVAL '30 days')`,
    },
  },
  {
    key: '30d_login_count',
    label: '30d login count',
    category: 'financial_window',
    valueType: 'number',
    operators: NUMBER_OPS,
    expensive: true,
    source: {
      kind: 'subquery',
      sql: `(SELECT COUNT(*) FROM player_events pe WHERE pe.player_id = p.id AND pe.event_name = 'player.login' AND pe.created_at > NOW() - INTERVAL '30 days')`,
    },
  },
  {
    key: '90d_spend_usd',
    label: '90d spend (USD)',
    category: 'financial_window',
    valueType: 'number',
    operators: NUMBER_OPS,
    expensive: true,
    source: {
      kind: 'subquery',
      sql: `(SELECT COALESCE(SUM(amount_usd), 0) FROM purchases pu WHERE pu.player_id = p.id AND pu.status = ${PURCHASE_OK} AND pu.created_at > NOW() - INTERVAL '90 days')`,
    },
  },
  {
    key: '90d_redeemed_usd',
    label: '90d redeemed (USD)',
    category: 'financial_window',
    valueType: 'number',
    operators: NUMBER_OPS,
    expensive: true,
    source: {
      kind: 'subquery',
      sql: `(SELECT COALESCE(SUM(amount_usd), 0) FROM redemptions r WHERE r.player_id = p.id AND r.status IN ${REDEMPTION_OK} AND r.created_at > NOW() - INTERVAL '90 days')`,
    },
  },
  {
    key: '90d_bet_count',
    label: '90d bet count',
    category: 'financial_window',
    valueType: 'number',
    operators: NUMBER_OPS,
    expensive: true,
    source: {
      kind: 'subquery',
      sql: `(SELECT COUNT(*) FROM game_rounds gr WHERE gr.player_id = p.id AND gr.created_at > NOW() - INTERVAL '90 days')`,
    },
  },

  // Balances --------------------------------------------------------------
  {
    key: 'current_gc_balance',
    label: 'Current GC balance',
    category: 'balances',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: { kind: 'expression', sql: `coalesce(wg.current_balance, 0)`, joins: ['wallet_gc'] },
  },
  {
    key: 'current_sc_balance',
    label: 'Current SC balance',
    category: 'balances',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: { kind: 'expression', sql: `coalesce(ws.current_balance, 0)`, joins: ['wallet_sc'] },
  },
  {
    key: 'current_sc_purchased',
    label: 'Current SC (purchased)',
    category: 'balances',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: { kind: 'expression', sql: `coalesce(ws.balance_purchased, 0)`, joins: ['wallet_sc'] },
  },
  {
    key: 'current_sc_earned',
    label: 'Current SC (earned)',
    category: 'balances',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: { kind: 'expression', sql: `coalesce(ws.balance_earned, 0)`, joins: ['wallet_sc'] },
  },
  {
    key: 'current_sc_bonus',
    label: 'Current SC (bonus)',
    category: 'balances',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: { kind: 'expression', sql: `coalesce(ws.balance_bonus, 0)`, joins: ['wallet_sc'] },
  },
  {
    key: 'current_sc_promo',
    label: 'Current SC (promo)',
    category: 'balances',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: { kind: 'expression', sql: `coalesce(ws.balance_promo, 0)`, joins: ['wallet_sc'] },
  },
  {
    key: 'current_usd_equivalent',
    label: 'Current USD equivalent',
    category: 'balances',
    valueType: 'number',
    operators: NUMBER_OPS,
    description: '1 SC = $1 redemption value',
    source: { kind: 'expression', sql: `coalesce(ws.current_balance, 0)`, joins: ['wallet_sc'] },
  },

  // Bonus -----------------------------------------------------------------
  {
    key: 'active_bonus_count',
    label: 'Active bonus count',
    category: 'bonus',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: {
      kind: 'subquery',
      sql: `(SELECT COUNT(*) FROM bonuses_awarded ba WHERE ba.player_id = p.id AND ba.status = 'active')`,
    },
  },
  {
    key: 'total_bonuses_received',
    label: 'Total bonuses received',
    category: 'bonus',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: {
      kind: 'subquery',
      sql: `(SELECT COUNT(*) FROM bonuses_awarded ba WHERE ba.player_id = p.id)`,
    },
  },
  {
    key: 'bonus_playthrough_rate',
    label: 'Bonus playthrough rate (%)',
    category: 'bonus',
    valueType: 'number',
    operators: NUMBER_OPS,
    description: '% of awarded bonuses with playthrough completed',
    expensive: true,
    source: {
      kind: 'subquery',
      sql: `(SELECT CASE WHEN COUNT(*) = 0 THEN 0 ELSE SUM(CASE WHEN ba.playthrough_complete THEN 1 ELSE 0 END) * 100.0 / COUNT(*) END FROM bonuses_awarded ba WHERE ba.player_id = p.id)`,
    },
  },
  {
    key: 'last_bonus_type',
    label: 'Last bonus type',
    category: 'bonus',
    valueType: 'enum',
    operators: ENUM_OPS,
    enumOptions: [
      'welcome',
      'tier_up',
      'weekly_tier',
      'monthly_tier',
      'package',
      'daily',
      'jackpot',
      'referral',
      'affiliate',
      'promotion',
      'amoe',
      'admin_added_sc',
      'crm_promocode',
      'purchase_promocode',
    ],
    source: {
      kind: 'subquery',
      sql: `(SELECT b.bonus_type::text FROM bonuses_awarded ba JOIN bonuses b ON b.id = ba.bonus_id WHERE ba.player_id = p.id ORDER BY ba.created_at DESC LIMIT 1)`,
    },
  },
  {
    key: 'claimed_welcome_bonus',
    label: 'Claimed welcome bonus',
    category: 'bonus',
    valueType: 'boolean',
    operators: BOOLEAN_OPS,
    source: {
      kind: 'predicate',
      truthy: `EXISTS (SELECT 1 FROM bonuses_awarded ba JOIN bonuses b ON b.id = ba.bonus_id WHERE ba.player_id = p.id AND b.bonus_type = 'welcome')`,
    },
  },
  {
    key: 'total_bonus_value_received_sc',
    label: 'Total bonus SC received',
    category: 'bonus',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: {
      kind: 'subquery',
      sql: `(SELECT COALESCE(SUM(sc_amount), 0) FROM bonuses_awarded ba WHERE ba.player_id = p.id)`,
    },
  },

  // Tier ------------------------------------------------------------------
  {
    key: 'current_tier',
    label: 'Current tier',
    category: 'tier',
    valueType: 'tier',
    operators: ENUM_OPS,
    source: {
      kind: 'expression',
      sql: `coalesce(t.slug, 'bronze')`,
      joins: ['tier_progress', 'tiers'],
    },
  },
  {
    key: 'tier_level',
    label: 'Tier level',
    category: 'tier',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: {
      kind: 'expression',
      sql: `coalesce(tp.current_tier_level, 1)`,
      joins: ['tier_progress'],
    },
  },
  {
    key: 'days_at_current_tier',
    label: 'Days at current tier',
    category: 'tier',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: {
      kind: 'expression',
      sql: `EXTRACT(DAY FROM (NOW() - tp.tier_reached_at))`,
      joins: ['tier_progress'],
    },
  },
  {
    key: 'days_to_next_tier',
    label: 'XP to next tier',
    category: 'tier',
    valueType: 'number',
    operators: NUMBER_OPS,
    description:
      'XP remaining (we measure progress in XP, not days; the registry exposes XP delta as a proxy)',
    source: {
      kind: 'expression',
      sql: `GREATEST(0, COALESCE(tp.xp_for_next_tier, 0) - COALESCE(tp.current_xp, 0))`,
      joins: ['tier_progress'],
    },
  },

  // Game activity ---------------------------------------------------------
  {
    key: 'favorite_game_id',
    label: 'Favorite game',
    category: 'game_activity',
    valueType: 'game',
    operators: ENUM_OPS,
    expensive: true,
    source: {
      kind: 'subquery',
      sql: `(SELECT pgs.game_id::text FROM player_game_stats pgs WHERE pgs.player_id = p.id ORDER BY pgs.total_bet_sc DESC LIMIT 1)`,
    },
  },
  {
    key: 'favorite_game_name',
    label: 'Favorite game (name)',
    category: 'game_activity',
    valueType: 'string',
    operators: STRING_OPS,
    expensive: true,
    source: {
      kind: 'subquery',
      sql: `(SELECT g.display_name FROM player_game_stats pgs JOIN games g ON g.id = pgs.game_id WHERE pgs.player_id = p.id ORDER BY pgs.total_bet_sc DESC LIMIT 1)`,
    },
  },
  {
    key: 'favorite_provider',
    label: 'Favorite provider',
    category: 'game_activity',
    valueType: 'provider',
    operators: ENUM_OPS,
    expensive: true,
    source: {
      kind: 'subquery',
      sql: `(SELECT g.provider_id::text FROM player_game_stats pgs JOIN games g ON g.id = pgs.game_id WHERE pgs.player_id = p.id GROUP BY g.provider_id ORDER BY SUM(pgs.total_bet_sc) DESC LIMIT 1)`,
    },
  },
  {
    key: 'favorite_category',
    label: 'Favorite category',
    category: 'game_activity',
    valueType: 'category',
    operators: ENUM_OPS,
    expensive: true,
    enumOptions: ['slots', 'table', 'live', 'instant', 'crash'],
    source: {
      kind: 'subquery',
      sql: `(SELECT g.category FROM player_game_stats pgs JOIN games g ON g.id = pgs.game_id WHERE pgs.player_id = p.id GROUP BY g.category ORDER BY SUM(pgs.total_bet_sc) DESC LIMIT 1)`,
    },
  },
  {
    key: 'total_unique_games_played',
    label: 'Unique games played',
    category: 'game_activity',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: {
      kind: 'subquery',
      sql: `(SELECT COUNT(DISTINCT pgs.game_id) FROM player_game_stats pgs WHERE pgs.player_id = p.id)`,
    },
  },
  {
    key: 'total_unique_providers',
    label: 'Unique providers played',
    category: 'game_activity',
    valueType: 'number',
    operators: NUMBER_OPS,
    expensive: true,
    source: {
      kind: 'subquery',
      sql: `(SELECT COUNT(DISTINCT g.provider_id) FROM player_game_stats pgs JOIN games g ON g.id = pgs.game_id WHERE pgs.player_id = p.id)`,
    },
  },
  {
    key: 'played_game',
    label: 'Played specific game',
    category: 'game_activity',
    valueType: 'game',
    operators: PICKER_OPS,
    description: 'pick a game; matches if the player has any session on it',
    source: {
      kind: 'predicate_param',
      paramKind: 'game',
      truthy: (param) =>
        `EXISTS (SELECT 1 FROM player_game_stats pgs WHERE pgs.player_id = p.id AND pgs.game_id = ${param}::uuid)`,
    },
  },
  {
    key: 'wagered_on_provider',
    label: 'Wagered on provider',
    category: 'game_activity',
    valueType: 'provider',
    operators: PICKER_OPS,
    source: {
      kind: 'predicate_param',
      paramKind: 'provider',
      truthy: (param) =>
        `EXISTS (SELECT 1 FROM player_game_stats pgs JOIN games g ON g.id = pgs.game_id WHERE pgs.player_id = p.id AND g.provider_id = ${param}::uuid AND pgs.total_bet_sc > 0)`,
    },
  },
  {
    key: 'played_category',
    label: 'Played category',
    category: 'game_activity',
    valueType: 'category',
    operators: PICKER_OPS,
    enumOptions: ['slots', 'table', 'live', 'instant', 'crash'],
    source: {
      kind: 'predicate_param',
      paramKind: 'category',
      truthy: (param) =>
        `EXISTS (SELECT 1 FROM player_game_stats pgs JOIN games g ON g.id = pgs.game_id WHERE pgs.player_id = p.id AND g.category = ${param})`,
    },
  },
  {
    key: 'win_rate_last_30d',
    label: 'Win rate, 30d (%)',
    category: 'game_activity',
    valueType: 'number',
    operators: NUMBER_OPS,
    expensive: true,
    source: {
      kind: 'subquery',
      sql: `(SELECT CASE WHEN COALESCE(SUM(bet_amount), 0) > 0 THEN COALESCE(SUM(win_amount), 0) * 100.0 / COALESCE(SUM(bet_amount), 1) ELSE 0 END FROM game_rounds gr WHERE gr.player_id = p.id AND gr.created_at > NOW() - INTERVAL '30 days')`,
    },
  },
  {
    key: 'win_rate_lifetime',
    label: 'Win rate, lifetime (%)',
    category: 'game_activity',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: {
      kind: 'expression',
      sql: `CASE WHEN pls.total_wagered_sc > 0 THEN pls.total_won_sc * 100.0 / pls.total_wagered_sc ELSE 0 END`,
      joins: ['lifetime_stats'],
    },
  },
  {
    key: 'biggest_single_win_sc',
    label: 'Biggest single win (SC)',
    category: 'game_activity',
    valueType: 'number',
    operators: NUMBER_OPS,
    expensive: true,
    source: {
      kind: 'subquery',
      sql: `(SELECT MAX(win_amount) FROM game_rounds gr WHERE gr.player_id = p.id AND gr.currency = 'SC')`,
    },
  },
  {
    key: 'longest_session_minutes',
    label: 'Longest session (min)',
    category: 'game_activity',
    valueType: 'number',
    operators: NUMBER_OPS,
    expensive: true,
    source: {
      kind: 'subquery',
      sql: `(SELECT MAX(EXTRACT(EPOCH FROM (gs.ended_at - gs.started_at)))/60 FROM game_sessions gs WHERE gs.player_id = p.id AND gs.ended_at IS NOT NULL)`,
    },
  },
  {
    key: 'average_session_minutes',
    label: 'Avg session length (min)',
    category: 'game_activity',
    valueType: 'number',
    operators: NUMBER_OPS,
    expensive: true,
    source: {
      kind: 'subquery',
      sql: `(SELECT AVG(EXTRACT(EPOCH FROM (gs.ended_at - gs.started_at)))/60 FROM game_sessions gs WHERE gs.player_id = p.id AND gs.ended_at IS NOT NULL)`,
    },
  },
  {
    key: 'sessions_count_last_30d',
    label: 'Sessions, last 30d',
    category: 'game_activity',
    valueType: 'number',
    operators: NUMBER_OPS,
    expensive: true,
    source: {
      kind: 'subquery',
      sql: `(SELECT COUNT(*) FROM game_sessions gs WHERE gs.player_id = p.id AND gs.started_at > NOW() - INTERVAL '30 days')`,
    },
  },
  {
    key: 'avg_bet_size_sc',
    label: 'Average bet (SC)',
    category: 'game_activity',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: {
      kind: 'expression',
      sql: `CASE WHEN pls.round_count > 0 THEN pls.total_wagered_sc / NULLIF(pls.round_count, 0) ELSE 0 END`,
      joins: ['lifetime_stats'],
    },
  },
  {
    key: 'avg_bet_size_gc',
    label: 'Average bet (GC)',
    category: 'game_activity',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: {
      kind: 'expression',
      sql: `CASE WHEN pls.round_count > 0 THEN pls.total_wagered_gc / NULLIF(pls.round_count, 0) ELSE 0 END`,
      joins: ['lifetime_stats'],
    },
  },

  // Behavioral classifications --------------------------------------------
  {
    key: 'is_whale',
    label: 'Is whale',
    category: 'classification',
    valueType: 'boolean',
    operators: BOOLEAN_OPS,
    description: 'lifetime spend > $10,000',
    source: {
      kind: 'predicate',
      truthy: `pls.total_deposited_usd > 10000`,
      joins: ['lifetime_stats'],
    },
  },
  {
    key: 'is_recreational',
    label: 'Is recreational',
    category: 'classification',
    valueType: 'boolean',
    operators: BOOLEAN_OPS,
    description: 'lifetime spend $100–$1,000',
    source: {
      kind: 'predicate',
      truthy: `pls.total_deposited_usd >= 100 AND pls.total_deposited_usd <= 1000`,
      joins: ['lifetime_stats'],
    },
  },
  {
    key: 'is_bonus_hunter',
    label: 'Is bonus hunter',
    category: 'classification',
    valueType: 'boolean',
    operators: BOOLEAN_OPS,
    description: 'redemptions / bonuses ratio > 0.5',
    expensive: true,
    source: {
      kind: 'predicate',
      truthy: `(SELECT COUNT(*) FROM bonuses_awarded ba2 WHERE ba2.player_id = p.id) > 0
        AND ((SELECT COUNT(*)::numeric FROM redemptions r2 WHERE r2.player_id = p.id AND r2.status IN ${REDEMPTION_OK})
             / NULLIF((SELECT COUNT(*)::numeric FROM bonuses_awarded ba3 WHERE ba3.player_id = p.id), 0)) > 0.5`,
    },
  },
  {
    key: 'is_slot_only',
    label: 'Is slot-only',
    category: 'classification',
    valueType: 'boolean',
    operators: BOOLEAN_OPS,
    description: '90%+ of wagering on slot games',
    expensive: true,
    source: {
      kind: 'predicate',
      truthy: `(SELECT COALESCE(SUM(pgs.total_bet_sc), 0) FROM player_game_stats pgs WHERE pgs.player_id = p.id) > 0
        AND (SELECT COALESCE(SUM(CASE WHEN g.category = 'slots' THEN pgs.total_bet_sc ELSE 0 END), 0) FROM player_game_stats pgs JOIN games g ON g.id = pgs.game_id WHERE pgs.player_id = p.id)
            >= (SELECT COALESCE(SUM(pgs.total_bet_sc), 0) * 0.9 FROM player_game_stats pgs WHERE pgs.player_id = p.id)`,
    },
  },
  {
    key: 'is_table_player',
    label: 'Is table player',
    category: 'classification',
    valueType: 'boolean',
    operators: BOOLEAN_OPS,
    description: '30%+ of wagering on table games',
    expensive: true,
    source: {
      kind: 'predicate',
      truthy: `(SELECT COALESCE(SUM(pgs.total_bet_sc), 0) FROM player_game_stats pgs WHERE pgs.player_id = p.id) > 0
        AND (SELECT COALESCE(SUM(CASE WHEN g.category = 'table' THEN pgs.total_bet_sc ELSE 0 END), 0) FROM player_game_stats pgs JOIN games g ON g.id = pgs.game_id WHERE pgs.player_id = p.id)
            >= (SELECT COALESCE(SUM(pgs.total_bet_sc), 0) * 0.3 FROM player_game_stats pgs WHERE pgs.player_id = p.id)`,
    },
  },
  {
    key: 'is_live_dealer_player',
    label: 'Is live dealer player',
    category: 'classification',
    valueType: 'boolean',
    operators: BOOLEAN_OPS,
    description: '20%+ of wagering on live dealer games',
    expensive: true,
    source: {
      kind: 'predicate',
      truthy: `(SELECT COALESCE(SUM(pgs.total_bet_sc), 0) FROM player_game_stats pgs WHERE pgs.player_id = p.id) > 0
        AND (SELECT COALESCE(SUM(CASE WHEN g.category = 'live' THEN pgs.total_bet_sc ELSE 0 END), 0) FROM player_game_stats pgs JOIN games g ON g.id = pgs.game_id WHERE pgs.player_id = p.id)
            >= (SELECT COALESCE(SUM(pgs.total_bet_sc), 0) * 0.2 FROM player_game_stats pgs WHERE pgs.player_id = p.id)`,
    },
  },
  {
    key: 'never_purchased',
    label: 'Never purchased',
    category: 'classification',
    valueType: 'boolean',
    operators: BOOLEAN_OPS,
    source: {
      kind: 'predicate',
      truthy: `coalesce(pls.purchase_count, 0) = 0`,
      joins: ['lifetime_stats'],
    },
  },
  {
    key: 'purchased_once_only',
    label: 'Purchased once only',
    category: 'classification',
    valueType: 'boolean',
    operators: BOOLEAN_OPS,
    source: {
      kind: 'predicate',
      truthy: `coalesce(pls.purchase_count, 0) = 1`,
      joins: ['lifetime_stats'],
    },
  },
  {
    key: 'dormant_30d',
    label: 'Dormant (30d+)',
    category: 'classification',
    valueType: 'boolean',
    operators: BOOLEAN_OPS,
    source: {
      kind: 'predicate',
      truthy: `(p.last_login_at IS NULL OR p.last_login_at < NOW() - INTERVAL '30 days')`,
    },
  },
  {
    key: 'dormant_60d',
    label: 'Dormant (60d+)',
    category: 'classification',
    valueType: 'boolean',
    operators: BOOLEAN_OPS,
    source: {
      kind: 'predicate',
      truthy: `(p.last_login_at IS NULL OR p.last_login_at < NOW() - INTERVAL '60 days')`,
    },
  },
  {
    key: 'dormant_90d',
    label: 'Dormant (90d+)',
    category: 'classification',
    valueType: 'boolean',
    operators: BOOLEAN_OPS,
    source: {
      kind: 'predicate',
      truthy: `(p.last_login_at IS NULL OR p.last_login_at < NOW() - INTERVAL '90 days')`,
    },
  },
  {
    key: 'weekend_warrior',
    label: 'Weekend warrior',
    category: 'classification',
    valueType: 'boolean',
    operators: BOOLEAN_OPS,
    description: '60%+ of bets land on Sat/Sun (last 30d)',
    expensive: true,
    source: {
      kind: 'predicate',
      truthy: `(SELECT COUNT(*) FROM game_rounds gr2 WHERE gr2.player_id = p.id AND gr2.created_at > NOW() - INTERVAL '30 days') > 0
        AND (SELECT SUM(CASE WHEN EXTRACT(DOW FROM gr3.created_at) IN (0, 6) THEN 1 ELSE 0 END) * 1.0 / COUNT(*) FROM game_rounds gr3 WHERE gr3.player_id = p.id AND gr3.created_at > NOW() - INTERVAL '30 days') >= 0.6`,
    },
  },
  {
    key: 'daily_active',
    label: 'Daily active',
    category: 'classification',
    valueType: 'boolean',
    operators: BOOLEAN_OPS,
    source: {
      kind: 'predicate',
      truthy: `p.last_login_at IS NOT NULL AND p.last_login_at >= NOW() - INTERVAL '1 day'`,
    },
  },
  {
    key: 'weekly_active',
    label: 'Weekly active',
    category: 'classification',
    valueType: 'boolean',
    operators: BOOLEAN_OPS,
    source: {
      kind: 'predicate',
      truthy: `p.last_login_at IS NOT NULL AND p.last_login_at >= NOW() - INTERVAL '7 days'`,
    },
  },
  {
    key: 'monthly_active',
    label: 'Monthly active',
    category: 'classification',
    valueType: 'boolean',
    operators: BOOLEAN_OPS,
    source: {
      kind: 'predicate',
      truthy: `p.last_login_at IS NOT NULL AND p.last_login_at >= NOW() - INTERVAL '30 days'`,
    },
  },
  {
    key: 'recovery_candidate',
    label: 'Recovery candidate',
    category: 'classification',
    valueType: 'boolean',
    operators: BOOLEAN_OPS,
    description: 'was active recently, now lapsed, ever spent money',
    source: {
      kind: 'predicate',
      truthy: `p.last_login_at IS NOT NULL
        AND p.last_login_at >= NOW() - INTERVAL '90 days'
        AND p.last_login_at <  NOW() - INTERVAL '30 days'
        AND coalesce(pls.total_deposited_usd, 0) > 0`,
      joins: ['lifetime_stats'],
    },
  },

  // CRM history -----------------------------------------------------------
  {
    key: 'emails_received_last_7d',
    label: 'Emails received, 7d',
    category: 'crm_history',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: {
      kind: 'subquery',
      sql: `(SELECT COUNT(*) FROM crm_message_log m WHERE m.player_id = p.id AND m.channel = 'email' AND m.created_at > NOW() - INTERVAL '7 days')`,
    },
  },
  {
    key: 'emails_opened_last_7d',
    label: 'Emails opened, 7d',
    category: 'crm_history',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: {
      kind: 'subquery',
      sql: `(SELECT COUNT(*) FROM crm_message_log m WHERE m.player_id = p.id AND m.channel = 'email' AND m.opened_at IS NOT NULL AND m.created_at > NOW() - INTERVAL '7 days')`,
    },
  },
  {
    key: 'emails_clicked_last_7d',
    label: 'Emails clicked, 7d',
    category: 'crm_history',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: {
      kind: 'subquery',
      sql: `(SELECT COUNT(*) FROM crm_message_log m WHERE m.player_id = p.id AND m.channel = 'email' AND m.clicked_at IS NOT NULL AND m.created_at > NOW() - INTERVAL '7 days')`,
    },
  },
  {
    key: 'sms_received_last_7d',
    label: 'SMS received, 7d',
    category: 'crm_history',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: {
      kind: 'subquery',
      sql: `(SELECT COUNT(*) FROM crm_message_log m WHERE m.player_id = p.id AND m.channel = 'sms' AND m.created_at > NOW() - INTERVAL '7 days')`,
    },
  },
  {
    key: 'in_app_notifications_received_last_7d',
    label: 'In-app notifications, 7d',
    category: 'crm_history',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: {
      kind: 'subquery',
      sql: `(SELECT COUNT(*) FROM notifications n WHERE n.player_id = p.id AND n.created_at > NOW() - INTERVAL '7 days')`,
    },
  },
  {
    key: 'bounce_count_total',
    label: 'Total bounces',
    category: 'crm_history',
    valueType: 'number',
    operators: NUMBER_OPS,
    source: {
      kind: 'subquery',
      sql: `(SELECT COUNT(*) FROM crm_message_log m WHERE m.player_id = p.id AND m.status = 'bounced')`,
    },
  },
  {
    key: 'unsubscribed_email',
    label: 'Unsubscribed (email)',
    category: 'crm_history',
    valueType: 'boolean',
    operators: BOOLEAN_OPS,
    source: { kind: 'predicate', truthy: `p.email_consent = false` },
  },
  {
    key: 'unsubscribed_sms',
    label: 'Unsubscribed (SMS)',
    category: 'crm_history',
    valueType: 'boolean',
    operators: BOOLEAN_OPS,
    source: { kind: 'predicate', truthy: `p.sms_consent = false` },
  },
  {
    key: 'on_suppression_list',
    label: 'On suppression list',
    category: 'crm_history',
    valueType: 'boolean',
    operators: BOOLEAN_OPS,
    source: {
      kind: 'predicate',
      truthy: `EXISTS (SELECT 1 FROM crm_suppression cs WHERE cs.email_or_phone = p.email OR (p.phone IS NOT NULL AND cs.email_or_phone = p.phone))`,
    },
  },
]

const REGISTRY_BY_KEY = new Map(REG.map((d) => [d.key, d]))

export const ATTRIBUTE_REGISTRY: readonly AttributeDef[] = REG

export function getAttribute(key: string): AttributeDef | null {
  return REGISTRY_BY_KEY.get(key) ?? null
}

export function getAttributesByCategory(): Record<AttributeCategory, AttributeDef[]> {
  const out = {} as Record<AttributeCategory, AttributeDef[]>
  for (const def of REG) {
    const list = out[def.category] ?? []
    list.push(def)
    out[def.category] = list
  }
  return out
}

export const CATEGORY_LABELS: Record<AttributeCategory, string> = {
  identity: 'Identity',
  geo: 'Geography',
  compliance: 'Compliance',
  lifecycle: 'Lifecycle dates',
  financial_lifetime: 'Financial — lifetime',
  financial_window: 'Financial — windowed',
  balances: 'Current balances',
  bonus: 'Bonus',
  tier: 'Tier',
  game_activity: 'Game activity',
  classification: 'Behavioral classification',
  crm_history: 'CRM history',
}

export const CATEGORY_ORDER: AttributeCategory[] = [
  'identity',
  'geo',
  'compliance',
  'lifecycle',
  'financial_lifetime',
  'financial_window',
  'balances',
  'bonus',
  'tier',
  'game_activity',
  'classification',
  'crm_history',
]
