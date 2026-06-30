import { sql, type SQL } from 'drizzle-orm'

import type { DbExecutor } from '@coinfrenzy/db/client'

import { err, ok, type Result } from '../errors/result'

// docs/12 §6.8 — the constrained "custom query" engine. Master-only.
//
// Every component (table, columns, aggregates, ordering) is allow-listed
// before the SQL is composed; user-supplied values flow through Drizzle's
// parameter binding so injection is impossible. The compiled query is
// subject to: (a) hard 30-second timeout, (b) 10,000-row cap, (c) read-only
// transaction, (d) audit_log row recording the spec + execution time.

export type CustomQueryError =
  | { code: 'table_not_allowed'; table: string }
  | { code: 'column_not_allowed'; table: string; column: string }
  | { code: 'operator_not_allowed'; operator: string }
  | { code: 'aggregate_not_allowed'; aggregate: string }
  | { code: 'invalid_input'; reason: string }
  | { code: 'execution_failed'; message: string }
  | { code: 'execution_timeout' }

export type AllowedTable =
  | 'players'
  | 'purchases'
  | 'redemptions'
  | 'bonuses_awarded'
  | 'ledger_entries'
  | 'player_events'
  | 'game_rounds'
  | 'daily_operational_snapshots'
  | 'daily_redemption_rate_snapshot'

export type Operator =
  | '='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'in'
  | 'not_in'
  | 'is_null'
  | 'is_not_null'

export interface QueryCondition {
  column: string
  operator: Operator
  /** Required for everything but is_null / is_not_null. */
  value?: string | number | boolean | Array<string | number>
}

export type Aggregate = 'count' | 'count_distinct' | 'sum' | 'avg' | 'min' | 'max'

export interface AggregateColumn {
  fn: Aggregate
  column: string
  alias?: string
}

export interface QuerySpec {
  baseTable: AllowedTable
  /** Columns to select. Always parameterised. */
  selectColumns?: string[]
  /** Aggregates (mutually exclusive with selectColumns when group_by is empty). */
  aggregates?: AggregateColumn[]
  /** Filters joined with AND. */
  where?: QueryCondition[]
  groupBy?: string[]
  orderBy?: { column: string; direction?: 'asc' | 'desc' }[]
  /** Capped at 10,000. */
  limit?: number
}

export interface CompiledQuery {
  sql: SQL
  /** Echo of the validated select / aggregates so the runner can build headers. */
  columns: string[]
  hardLimit: number
}

const ALLOWED_COLUMNS: Record<AllowedTable, ReadonlySet<string>> = {
  players: new Set([
    'id',
    'email',
    'username',
    'display_name',
    'state',
    'country',
    'status',
    'kyc_level',
    'first_seen_at',
    'last_seen_at',
    'last_login_at',
    'is_internal_account',
    'created_at',
    'attributed_affiliate_id',
  ]),
  purchases: new Set([
    'id',
    'player_id',
    'package_id',
    'amount_usd',
    'amount_cents',
    'status',
    'promo_code',
    'finix_card_brand',
    'finix_card_last4',
    'finix_3ds_result',
    'finix_avs_result',
    'state_at_purchase',
    'created_at',
    'completed_at',
  ]),
  redemptions: new Set([
    'id',
    'player_id',
    'amount_sc',
    'amount_usd',
    'method',
    'status',
    'rejection_category',
    'state_at_request',
    'submitted_to_finix_at',
    'paid_at',
    'requested_at',
    'created_at',
  ]),
  bonuses_awarded: new Set([
    'id',
    'player_id',
    'bonus_id',
    'gc_amount',
    'sc_amount',
    'playthrough_required',
    'playthrough_progress',
    'playthrough_complete',
    'expires_at',
    'status',
    'source_kind',
    'awarded_by_admin',
    'created_at',
    'completed_at',
  ]),
  ledger_entries: new Set([
    'source',
    'source_id',
    'leg',
    'account_kind',
    'amount',
    'currency',
    'sub_bucket',
    'player_id',
    'created_at',
  ]),
  player_events: new Set([
    'player_id',
    'event_name',
    'event_category',
    'amount',
    'currency',
    'game_id',
    'created_at',
  ]),
  game_rounds: new Set([
    'session_id',
    'player_id',
    'game_id',
    'bet_amount',
    'win_amount',
    'currency',
    'status',
    'bet_at',
    'won_at',
    'created_at',
  ]),
  daily_operational_snapshots: new Set([
    'date',
    'day_of_week',
    'dau',
    'unique_logins',
    'new_registered_players',
    'total_sc_staked',
    'total_sc_won',
    'total_ggr_sc',
    'total_ngr_sc',
    'total_deposits_usd',
    'depositors_count',
    'first_time_purchasers',
    'withdrawals_completed_usd',
    'bonus_total',
  ]),
  daily_redemption_rate_snapshot: new Set([
    'date',
    'revenue_usd',
    'redemptions_usd',
    'pending_usd',
    'cumulative_revenue_usd',
    'cumulative_redemptions_usd',
    'daily_redemption_rate',
    'lifetime_redemption_rate',
  ]),
}

const ALLOWED_OPERATORS: ReadonlySet<Operator> = new Set([
  '=',
  '!=',
  '>',
  '>=',
  '<',
  '<=',
  'in',
  'not_in',
  'is_null',
  'is_not_null',
])

const ALLOWED_AGGS: ReadonlySet<Aggregate> = new Set([
  'count',
  'count_distinct',
  'sum',
  'avg',
  'min',
  'max',
])

const HARD_ROW_CAP = 10_000
const TIMEOUT_MS = 30_000

function validIdentifier(s: string): boolean {
  return /^[a-z_][a-z0-9_]*$/i.test(s) && s.length <= 64
}

function isAllowedColumn(table: AllowedTable, column: string): boolean {
  if (column === '*') return true
  return ALLOWED_COLUMNS[table].has(column)
}

/**
 * Compile a structured spec to a Drizzle SQL fragment. Returns
 * `Result<CompiledQuery, CustomQueryError>` so the runner can surface a
 * specific error code in the API response without throwing.
 */
export function compileCustomQuery(spec: QuerySpec): Result<CompiledQuery, CustomQueryError> {
  const table = spec.baseTable
  if (!(table in ALLOWED_COLUMNS)) {
    return err({ code: 'table_not_allowed', table })
  }

  const columns: string[] = []
  const selectFragments: SQL[] = []

  if (spec.selectColumns && spec.selectColumns.length > 0) {
    for (const c of spec.selectColumns) {
      if (!validIdentifier(c) && c !== '*') {
        return err({ code: 'invalid_input', reason: `bad identifier: ${c}` })
      }
      if (!isAllowedColumn(table, c)) {
        return err({ code: 'column_not_allowed', table, column: c })
      }
      selectFragments.push(sql.raw(c))
      columns.push(c)
    }
  }

  if (spec.aggregates && spec.aggregates.length > 0) {
    for (const a of spec.aggregates) {
      if (!ALLOWED_AGGS.has(a.fn)) {
        return err({ code: 'aggregate_not_allowed', aggregate: a.fn })
      }
      if (!validIdentifier(a.column) && a.column !== '*') {
        return err({ code: 'invalid_input', reason: `bad identifier: ${a.column}` })
      }
      if (a.column !== '*' && !isAllowedColumn(table, a.column)) {
        return err({ code: 'column_not_allowed', table, column: a.column })
      }
      const alias =
        a.alias && validIdentifier(a.alias) ? a.alias : `${a.fn}_${a.column.replace('*', 'all')}`
      const expr =
        a.fn === 'count_distinct' ? `count(distinct ${a.column})` : `${a.fn}(${a.column})`
      selectFragments.push(sql.raw(`${expr} as ${alias}`))
      columns.push(alias)
    }
  }

  if (selectFragments.length === 0) {
    return err({ code: 'invalid_input', reason: 'no select columns or aggregates' })
  }

  const whereFragments: SQL[] = []
  for (const cond of spec.where ?? []) {
    if (!validIdentifier(cond.column)) {
      return err({ code: 'invalid_input', reason: `bad column: ${cond.column}` })
    }
    if (!isAllowedColumn(table, cond.column)) {
      return err({ code: 'column_not_allowed', table, column: cond.column })
    }
    if (!ALLOWED_OPERATORS.has(cond.operator)) {
      return err({ code: 'operator_not_allowed', operator: cond.operator })
    }
    const colRef = sql.raw(cond.column)
    if (cond.operator === 'is_null') {
      whereFragments.push(sql`${colRef} IS NULL`)
    } else if (cond.operator === 'is_not_null') {
      whereFragments.push(sql`${colRef} IS NOT NULL`)
    } else if (cond.operator === 'in' || cond.operator === 'not_in') {
      if (!Array.isArray(cond.value) || cond.value.length === 0) {
        return err({ code: 'invalid_input', reason: 'in/not_in needs non-empty array' })
      }
      // Drizzle's sql binds each placeholder; we rebuild the IN list manually.
      const placeholders = cond.value.map((v) => sql`${v}`)
      const sep = cond.operator === 'in' ? sql.raw('IN') : sql.raw('NOT IN')
      const csv = sql.join(placeholders, sql`, `)
      whereFragments.push(sql`${colRef} ${sep} (${csv})`)
    } else {
      const opRaw = sql.raw(cond.operator)
      whereFragments.push(sql`${colRef} ${opRaw} ${cond.value ?? null}`)
    }
  }

  const groupByFragments: SQL[] = []
  for (const c of spec.groupBy ?? []) {
    if (!validIdentifier(c)) {
      return err({ code: 'invalid_input', reason: `bad group_by: ${c}` })
    }
    if (!isAllowedColumn(table, c)) {
      return err({ code: 'column_not_allowed', table, column: c })
    }
    groupByFragments.push(sql.raw(c))
  }

  const orderByFragments: SQL[] = []
  for (const o of spec.orderBy ?? []) {
    if (!validIdentifier(o.column)) {
      return err({ code: 'invalid_input', reason: `bad order_by: ${o.column}` })
    }
    // Order-by may reference an aggregate alias OR an allowed column.
    if (!isAllowedColumn(table, o.column) && !columns.includes(o.column)) {
      return err({ code: 'column_not_allowed', table, column: o.column })
    }
    const dir = o.direction === 'desc' ? sql.raw('DESC') : sql.raw('ASC')
    orderByFragments.push(sql`${sql.raw(o.column)} ${dir}`)
  }

  const limit = Math.min(spec.limit ?? 1_000, HARD_ROW_CAP)

  // Compose the final fragment.
  const tableRef = sql.raw(table)
  const selectList = sql.join(selectFragments, sql`, `)
  let queryFragment: SQL = sql`SELECT ${selectList} FROM ${tableRef}`
  if (whereFragments.length > 0) {
    queryFragment = sql`${queryFragment} WHERE ${sql.join(whereFragments, sql` AND `)}`
  }
  if (groupByFragments.length > 0) {
    queryFragment = sql`${queryFragment} GROUP BY ${sql.join(groupByFragments, sql`, `)}`
  }
  if (orderByFragments.length > 0) {
    queryFragment = sql`${queryFragment} ORDER BY ${sql.join(orderByFragments, sql`, `)}`
  }
  queryFragment = sql`${queryFragment} LIMIT ${limit}`

  return ok({ sql: queryFragment, columns, hardLimit: HARD_ROW_CAP })
}

export interface RunCustomQueryResult {
  rows: Array<Record<string, unknown>>
  durationMs: number
  rowCount: number
  truncated: boolean
}

/**
 * Run a compiled query inside a read-only transaction with a hard timeout.
 * Returns rows + execution metadata. The caller is responsible for writing
 * the audit_log entry.
 */
export async function runCustomQuery(
  db: DbExecutor,
  compiled: CompiledQuery,
): Promise<Result<RunCustomQueryResult, CustomQueryError>> {
  const start = Date.now()
  try {
    // Read-only + statement_timeout — applies to this single statement only
    // because PostgreSQL `set local` is bound to the current transaction.
    const rows = (await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = ${TIMEOUT_MS}`)
      await tx.execute(sql`SET LOCAL transaction_read_only TO ON`)
      return tx.execute<Record<string, unknown>>(compiled.sql)
    })) as unknown as Array<Record<string, unknown>>
    const elapsed = Date.now() - start
    return ok({
      rows,
      durationMs: elapsed,
      rowCount: rows.length,
      truncated: rows.length >= compiled.hardLimit,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (/timeout|cancelled|cancelling/i.test(message)) {
      return err({ code: 'execution_timeout' })
    }
    return err({ code: 'execution_failed', message })
  }
}
