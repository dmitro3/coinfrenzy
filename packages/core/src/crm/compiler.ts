// docs/11 §3.6 — segment compiler. Filter tree -> parameterized SQL.
//
// The compiler walks the filter tree and emits one SELECT against the
// `players p` table with the JOINs each leaf required. Values are bound
// positionally via `params` so the compiled SQL is safe to run with
// postgres-js's `unsafe(query, params)` (see segments.ts → runRawSelect).
//
// M3 — extended to support the new generic `attribute` leaf driven by
// the registry in `attributes.ts`. Legacy leaf types (demographic,
// behavior, bonus, compliance, engagement, affiliate, in_segment) keep
// working so previously saved segments don't break.

import {
  type AttributeDef,
  type AttributeSource,
  type JoinAlias as RegistryJoinAlias,
  type OperatorKey,
  type ValueType,
  getAttribute,
} from './attributes'
import {
  COMPILER_VERSION,
  isGroup,
  validateFilterTree,
  type AffiliateCondition,
  type AttributeCondition,
  type BehaviorCondition,
  type BonusCondition,
  type ComplianceCondition,
  type DemographicCondition,
  type EngagementCondition,
  type FilterCondition,
  type FilterGroup,
  type FilterTree,
  type InSegmentCondition,
} from './filter-tree'

export interface CompiledSegment {
  sql: string
  params: Array<string | number | boolean | null>
  /** All join aliases the WHERE clause references. Used to assemble FROM. */
  joins: Set<JoinAlias>
  compilationVersion: number
}

type JoinAlias =
  | 'players'
  | RegistryJoinAlias
  | 'tier_history'
  | 'compliance_flags'
  | 'bonuses_awarded'

export interface CompileOptions {
  /** When true, the SQL is wrapped to return COUNT(*); otherwise SELECT id. */
  mode: 'count' | 'fetch'
  /** Optional pagination for fetch mode. */
  limit?: number
  offset?: number
  /** Cap eligibility — never return players the campaign sender wouldn't send to. */
  excludeBlockedAndDeleted?: boolean
}

export function compile(tree: FilterTree | unknown, options: CompileOptions): CompiledSegment {
  const root = validateFilterTree(tree)

  const params: CompiledSegment['params'] = []
  const joins = new Set<JoinAlias>(['players'])

  const where = compileNode(root, params, joins)

  const baselineFilters: string[] = []
  if (options.excludeBlockedAndDeleted ?? true) {
    baselineFilters.push(`p.deleted_at IS NULL`)
    baselineFilters.push(`p.is_internal_account = false`)
    baselineFilters.push(`p.status = 'active'`)
  }

  const fullWhere = [...baselineFilters, where].filter((s) => s.length > 0).join(' AND ')

  const fromSql = buildFromClause(joins)

  const projection = options.mode === 'count' ? 'COUNT(DISTINCT p.id) AS total' : 'p.id'
  const orderClause = options.mode === 'fetch' ? ' ORDER BY p.id' : ''
  let sql = `SELECT ${projection} FROM ${fromSql} WHERE ${fullWhere}${orderClause}`

  if (options.mode === 'fetch') {
    if (options.limit !== undefined) {
      params.push(options.limit)
      sql += ` LIMIT $${params.length}`
    }
    if (options.offset !== undefined) {
      params.push(options.offset)
      sql += ` OFFSET $${params.length}`
    }
  }

  return { sql, params, joins, compilationVersion: COMPILER_VERSION }
}

function buildFromClause(joins: Set<JoinAlias>): string {
  const parts = ['players p']
  if (joins.has('tier_progress')) {
    parts.push('LEFT JOIN tier_progress tp ON tp.player_id = p.id')
  }
  if (joins.has('tiers')) {
    parts.push('LEFT JOIN tiers t ON t.id = tp.current_tier_id')
  }
  if (joins.has('lifetime_stats')) {
    parts.push('LEFT JOIN player_lifetime_stats pls ON pls.player_id = p.id')
  }
  if (joins.has('stats_30d')) {
    parts.push('LEFT JOIN player_30d_stats p30 ON p30.player_id = p.id')
  }
  if (joins.has('wallet_sc')) {
    parts.push("LEFT JOIN wallets ws ON ws.player_id = p.id AND ws.currency = 'SC'")
  }
  if (joins.has('wallet_gc')) {
    parts.push("LEFT JOIN wallets wg ON wg.player_id = p.id AND wg.currency = 'GC'")
  }
  return parts.join(' ')
}

function compileNode(
  node: FilterCondition,
  params: CompiledSegment['params'],
  joins: Set<JoinAlias>,
): string {
  if (isGroup(node)) return compileGroup(node, params, joins)
  return compileLeaf(node, params, joins)
}

function compileGroup(
  group: FilterGroup,
  params: CompiledSegment['params'],
  joins: Set<JoinAlias>,
): string {
  if (group.conditions.length === 0) return 'TRUE'

  if (group.operator === 'NOT') {
    const inner = compileNode(group.conditions[0]!, params, joins)
    return `NOT (${inner})`
  }

  const joiner = group.operator === 'AND' ? ' AND ' : ' OR '
  const parts = group.conditions.map((c) => `(${compileNode(c, params, joins)})`)
  return parts.join(joiner)
}

function compileLeaf(
  cond: Exclude<FilterCondition, FilterGroup>,
  params: CompiledSegment['params'],
  joins: Set<JoinAlias>,
): string {
  switch (cond.type) {
    case 'attribute':
      return compileAttributeLeaf(cond, params, joins)
    case 'demographic':
      return compileDemographic(cond, params, joins)
    case 'behavior':
      return compileBehavior(cond, params, joins)
    case 'bonus':
      return compileBonus(cond, params, joins)
    case 'compliance':
      return compileCompliance(cond, params, joins)
    case 'engagement':
      return compileEngagement(cond, params, joins)
    case 'affiliate':
      return compileAffiliate(cond, params, joins)
    case 'in_segment':
      return compileInSegment(cond, params)
  }
}

// ---------------------------------------------------------------------------
// Attribute (M3) leaf compiler
// ---------------------------------------------------------------------------

function compileAttributeLeaf(
  cond: AttributeCondition,
  params: CompiledSegment['params'],
  joins: Set<JoinAlias>,
): string {
  const def = getAttribute(cond.attributeKey)
  if (!def) {
    // Unknown attribute — fail open ("does not match anything").
    return 'FALSE'
  }
  // Track joins required by the attribute's source.
  attachSourceJoins(def.source, joins)

  const op = cond.operator as OperatorKey
  const value = cond.value

  // Handle predicate-style sources (booleans + parameterized pickers) first.
  if (def.source.kind === 'predicate') {
    return compileBooleanPredicate(def.source.truthy, op)
  }
  if (def.source.kind === 'predicate_param') {
    return compileParamPredicate(def, def.source, op, value, params)
  }

  // For column / expression / subquery sources, build the value expression.
  const expr = buildValueExpression(def.source)
  return compileScalarOperator(expr, op, def.valueType, value, params)
}

function attachSourceJoins(source: AttributeSource, joins: Set<JoinAlias>): void {
  if (source.kind === 'expression' || source.kind === 'predicate') {
    for (const j of source.joins ?? []) joins.add(j as JoinAlias)
  }
}

function buildValueExpression(source: AttributeSource): string {
  switch (source.kind) {
    case 'column':
      return `p.${source.column}`
    case 'expression':
      return source.sql
    case 'subquery':
      return source.sql
    case 'predicate':
    case 'predicate_param':
      // Should be handled before reaching this fn.
      return 'NULL'
  }
}

function compileBooleanPredicate(truthy: string, op: OperatorKey): string {
  switch (op) {
    case 'is_true':
      return `(${truthy})`
    case 'is_false':
      return `NOT (${truthy})`
    default:
      return `(${truthy})`
  }
}

function compileParamPredicate(
  _def: AttributeDef,
  source: { kind: 'predicate_param'; truthy: (paramRef: string) => string; paramKind: string },
  op: OperatorKey,
  value: unknown,
  params: CompiledSegment['params'],
): string {
  // Picker value is the entity id (uuid for game/provider, slug for category).
  if (value === null || value === undefined || value === '') return 'FALSE'
  const v = Array.isArray(value) ? value[0] : value
  if (v === null || v === undefined) return 'FALSE'
  params.push(coerceParam(v))
  const ref = `$${params.length}`
  const truthy = source.truthy(ref)
  return op === 'is_false' ? `NOT (${truthy})` : `(${truthy})`
}

function compileScalarOperator(
  expr: string,
  op: OperatorKey,
  valueType: ValueType,
  value: unknown,
  params: CompiledSegment['params'],
): string {
  switch (op) {
    case '=':
    case '!=':
    case '>':
    case '<':
    case '>=':
    case '<=': {
      if (value === null || value === undefined) return 'TRUE'
      params.push(coerceParam(value))
      const cast = sqlCast(valueType)
      return `${expr} ${op} $${params.length}${cast}`
    }
    case 'between': {
      const arr = Array.isArray(value) ? value : []
      const [lo, hi] = arr
      if (lo === undefined || hi === undefined) return 'TRUE'
      params.push(coerceParam(lo))
      const a = params.length
      params.push(coerceParam(hi))
      const b = params.length
      const cast = sqlCast(valueType)
      return `${expr} BETWEEN $${a}${cast} AND $${b}${cast}`
    }
    case 'in_list':
    case 'not_in_list': {
      const list = Array.isArray(value) ? value : []
      if (list.length === 0) return op === 'in_list' ? 'FALSE' : 'TRUE'
      const placeholders = list.map((v) => {
        params.push(coerceParam(v))
        return `$${params.length}`
      })
      return `${expr} ${op === 'in_list' ? 'IN' : 'NOT IN'} (${placeholders.join(',')})`
    }
    case 'contains':
    case 'not_contains':
    case 'starts_with':
    case 'ends_with': {
      if (value === null || value === undefined) return 'TRUE'
      const raw = String(value)
      const escaped = raw.replace(/[%_]/g, (m) => `\\${m}`)
      let pattern: string
      if (op === 'starts_with') pattern = `${escaped}%`
      else if (op === 'ends_with') pattern = `%${escaped}`
      else pattern = `%${escaped}%`
      params.push(pattern)
      const negate = op === 'not_contains' ? 'NOT ' : ''
      return `${expr} ${negate}ILIKE $${params.length} ESCAPE '\\'`
    }
    case 'is_set':
      return `${expr} IS NOT NULL`
    case 'is_not_set':
      return `${expr} IS NULL`
    case 'is_true':
      return `(${expr}) = true`
    case 'is_false':
      return `(${expr}) = false`
    case 'before': {
      if (value === null || value === undefined) return 'TRUE'
      params.push(String(value))
      return `${expr} < $${params.length}::timestamptz`
    }
    case 'after': {
      if (value === null || value === undefined) return 'TRUE'
      params.push(String(value))
      return `${expr} > $${params.length}::timestamptz`
    }
    case 'on': {
      if (value === null || value === undefined) return 'TRUE'
      params.push(String(value))
      return `(${expr})::date = $${params.length}::date`
    }
    case 'in_last_n_days': {
      const n = Number(value)
      if (!Number.isFinite(n) || n <= 0) return 'TRUE'
      params.push(n)
      return `${expr} >= NOW() - $${params.length} * INTERVAL '1 day'`
    }
    case 'more_than_n_days_ago': {
      const n = Number(value)
      if (!Number.isFinite(n) || n <= 0) return 'TRUE'
      params.push(n)
      return `${expr} < NOW() - $${params.length} * INTERVAL '1 day'`
    }
    default:
      return 'TRUE'
  }
}

function sqlCast(valueType: ValueType): string {
  switch (valueType) {
    case 'number':
      return '::numeric'
    case 'date':
      return '::timestamptz'
    case 'boolean':
      return '::boolean'
    default:
      return ''
  }
}

// ---------------------------------------------------------------------------
// Legacy leaf compilers (kept verbatim from v1 so existing segments work)
// ---------------------------------------------------------------------------

function compileDemographic(
  cond: DemographicCondition,
  params: CompiledSegment['params'],
  joins: Set<JoinAlias>,
): string {
  switch (cond.field) {
    case 'state':
      return compareScalar('p.state', cond.operator, cond.value, params)
    case 'country':
      return compareScalar('p.country', cond.operator, cond.value, params)
    case 'tier_level':
      joins.add('tier_progress')
      return compareScalar('tp.current_tier_level', cond.operator, cond.value, params)
    case 'tier_name':
      joins.add('tier_progress')
      joins.add('tiers')
      return compareScalar('t.slug', cond.operator, cond.value, params)
    case 'age': {
      const expr = `date_part('year', age(p.date_of_birth))`
      return compareScalar(expr, cond.operator, cond.value, params)
    }
    case 'kyc_level':
      return compareScalar('p.kyc_level', cond.operator, cond.value, params)
    case 'signup_date':
      return compareTimestamp('p.created_at', cond.operator, cond.value, cond.unit, params)
    case 'signup_source':
      return compareScalar('p.signup_source', cond.operator, cond.value, params)
    case 'signup_country':
      return compareScalar('p.signup_country', cond.operator, cond.value, params)
    case 'status':
      return compareScalar('p.status', cond.operator, cond.value, params)
  }
}

function compileBehavior(
  cond: BehaviorCondition,
  params: CompiledSegment['params'],
  joins: Set<JoinAlias>,
): string {
  switch (cond.field) {
    case 'total_deposited_usd':
      joins.add('lifetime_stats')
      return compareScalar('pls.total_deposited_usd', cond.operator, cond.value, params)
    case 'total_redeemed_usd':
      joins.add('lifetime_stats')
      return compareScalar('pls.total_redeemed_usd', cond.operator, cond.value, params)
    case 'net_position_usd':
      joins.add('lifetime_stats')
      return compareScalar('pls.net_position_usd', cond.operator, cond.value, params)
    case 'total_wagered_sc':
      joins.add('lifetime_stats')
      return compareScalar('pls.total_wagered_sc', cond.operator, cond.value, params)
    case 'total_wagered_gc':
      joins.add('lifetime_stats')
      return compareScalar('pls.total_wagered_gc', cond.operator, cond.value, params)
    case 'total_won_sc':
      joins.add('lifetime_stats')
      return compareScalar('pls.total_won_sc', cond.operator, cond.value, params)
    case 'ggr_sc':
      joins.add('lifetime_stats')
      return compareScalar('pls.ggr_sc', cond.operator, cond.value, params)
    case 'ngr_sc':
      joins.add('lifetime_stats')
      return compareScalar('pls.ngr_sc', cond.operator, cond.value, params)
    case 'purchase_count':
      joins.add('lifetime_stats')
      return compareScalar('pls.purchase_count', cond.operator, cond.value, params)
    case 'redemption_count':
      joins.add('lifetime_stats')
      return compareScalar('pls.redemption_count', cond.operator, cond.value, params)
    case 'session_count':
      joins.add('lifetime_stats')
      return compareScalar('pls.session_count', cond.operator, cond.value, params)
    case 'round_count':
      joins.add('lifetime_stats')
      return compareScalar('pls.round_count', cond.operator, cond.value, params)
    case 'days_active':
      joins.add('lifetime_stats')
      return compareScalar('pls.days_active', cond.operator, cond.value, params)
    case 'last_purchase_at':
      joins.add('lifetime_stats')
      return compareTimestamp('pls.last_purchase_at', cond.operator, cond.value, cond.unit, params)
    case 'last_session_at':
      joins.add('lifetime_stats')
      return compareTimestamp('pls.last_session_at', cond.operator, cond.value, cond.unit, params)
    case 'last_login_at':
      joins.add('stats_30d')
      return compareTimestamp('p30.last_login_at', cond.operator, cond.value, cond.unit, params)
    case 'first_purchase_at':
      joins.add('lifetime_stats')
      return compareTimestamp('pls.first_purchase_at', cond.operator, cond.value, cond.unit, params)
    case 'deposited_usd_30d':
      joins.add('stats_30d')
      return compareScalar('p30.deposited_usd_30d', cond.operator, cond.value, params)
    case 'wagered_sc_30d':
      joins.add('stats_30d')
      return compareScalar('p30.wagered_sc_30d', cond.operator, cond.value, params)
    case 'session_count_30d':
      joins.add('stats_30d')
      return compareScalar('p30.session_count_30d', cond.operator, cond.value, params)
    case 'days_active_30d':
      joins.add('stats_30d')
      return compareScalar('p30.days_active_30d', cond.operator, cond.value, params)
    case 'game_played': {
      const gameIds = Array.isArray(cond.value) ? (cond.value as string[]) : [cond.value as string]
      const placeholders = gameIds.map((g) => {
        params.push(g)
        return `$${params.length}`
      })
      const op = cond.operator === 'in' || cond.operator === '=' ? 'EXISTS' : 'NOT EXISTS'
      return `${op} (SELECT 1 FROM player_game_stats pgs WHERE pgs.player_id = p.id AND pgs.game_id IN (${placeholders.join(',')}))`
    }
    case 'last_7d_wagered': {
      const expr = `(SELECT COALESCE(SUM(pgs.last_7d_wagered_sc), 0) FROM player_game_stats pgs WHERE pgs.player_id = p.id${
        cond.gameIds && cond.gameIds.length > 0
          ? ` AND pgs.game_id IN (${cond.gameIds
              .map((g) => {
                params.push(g)
                return `$${params.length}`
              })
              .join(',')})`
          : ''
      })`
      return compareScalar(expr, cond.operator, cond.value, params)
    }
    case 'last_30d_wagered': {
      const expr = `(SELECT COALESCE(SUM(pgs.last_30d_wagered_sc), 0) FROM player_game_stats pgs WHERE pgs.player_id = p.id${
        cond.gameIds && cond.gameIds.length > 0
          ? ` AND pgs.game_id IN (${cond.gameIds
              .map((g) => {
                params.push(g)
                return `$${params.length}`
              })
              .join(',')})`
          : ''
      })`
      return compareScalar(expr, cond.operator, cond.value, params)
    }
  }
}

function compileBonus(
  cond: BonusCondition,
  params: CompiledSegment['params'],
  joins: Set<JoinAlias>,
): string {
  joins.add('bonuses_awarded')
  switch (cond.field) {
    case 'has_active_bonus': {
      const truthy = cond.value === true || cond.value === 'true' || cond.value === 1
      const negated = !truthy ? 'NOT ' : ''
      return `${negated}EXISTS (SELECT 1 FROM bonuses_awarded ba WHERE ba.player_id = p.id AND ba.status = 'active')`
    }
    case 'bonus_type': {
      const values = Array.isArray(cond.value) ? cond.value : [cond.value]
      const placeholders = values.map((v) => {
        params.push(v as string)
        return `$${params.length}`
      })
      return `EXISTS (SELECT 1 FROM bonuses_awarded ba JOIN bonuses b ON b.id = ba.bonus_id WHERE ba.player_id = p.id AND b.bonus_type IN (${placeholders.join(',')}))`
    }
    case 'playthrough_complete': {
      const truthy = cond.value === true || cond.value === 'true' || cond.value === 1
      const negated = !truthy ? 'NOT ' : ''
      return `${negated}EXISTS (SELECT 1 FROM bonuses_awarded ba WHERE ba.player_id = p.id AND ba.playthrough_complete = true)`
    }
    case 'bonus_count_lifetime': {
      const expr = `(SELECT COUNT(*) FROM bonuses_awarded ba WHERE ba.player_id = p.id)`
      return compareScalar(expr, cond.operator, cond.value, params)
    }
    case 'bonus_count_30d': {
      const expr = `(SELECT COUNT(*) FROM bonuses_awarded ba WHERE ba.player_id = p.id AND ba.created_at >= NOW() - INTERVAL '30 days')`
      return compareScalar(expr, cond.operator, cond.value, params)
    }
  }
}

function compileCompliance(
  cond: ComplianceCondition,
  params: CompiledSegment['params'],
  joins: Set<JoinAlias>,
): string {
  joins.add('compliance_flags')
  const truthy = cond.value === true || cond.value === 'true' || cond.value === 1
  const matches = cond.operator === '=' ? truthy : !truthy
  switch (cond.field) {
    case 'has_active_flag':
      return matches
        ? `EXISTS (SELECT 1 FROM compliance_flags cf WHERE cf.player_id = p.id AND cf.cleared_at IS NULL)`
        : `NOT EXISTS (SELECT 1 FROM compliance_flags cf WHERE cf.player_id = p.id AND cf.cleared_at IS NULL)`
    case 'self_excluded':
      return matches
        ? `(p.rg_self_excluded_until IS NOT NULL AND p.rg_self_excluded_until > NOW())`
        : `(p.rg_self_excluded_until IS NULL OR p.rg_self_excluded_until <= NOW())`
    case 'rg_limited':
      return matches
        ? `(p.rg_deposit_limit_daily IS NOT NULL OR p.rg_deposit_limit_weekly IS NOT NULL OR p.rg_deposit_limit_monthly IS NOT NULL OR p.rg_session_limit_min IS NOT NULL)`
        : `(p.rg_deposit_limit_daily IS NULL AND p.rg_deposit_limit_weekly IS NULL AND p.rg_deposit_limit_monthly IS NULL AND p.rg_session_limit_min IS NULL)`
  }
  void params
  return 'TRUE'
}

function compileEngagement(
  cond: EngagementCondition,
  params: CompiledSegment['params'],
  joins: Set<JoinAlias>,
): string {
  switch (cond.field) {
    case 'email_consent':
      return compareScalar('p.email_consent', cond.operator, cond.value, params)
    case 'sms_consent':
      return compareScalar('p.sms_consent', cond.operator, cond.value, params)
    case 'last_email_opened': {
      const expr = `(SELECT MAX(opened_at) FROM crm_message_log m WHERE m.player_id = p.id AND m.channel = 'email' AND m.opened_at IS NOT NULL)`
      return compareTimestamp(expr, cond.operator, cond.value, cond.unit, params)
    }
    case 'last_email_clicked': {
      const expr = `(SELECT MAX(clicked_at) FROM crm_message_log m WHERE m.player_id = p.id AND m.channel = 'email' AND m.clicked_at IS NOT NULL)`
      return compareTimestamp(expr, cond.operator, cond.value, cond.unit, params)
    }
    case 'total_emails_received_30d': {
      const expr = `(SELECT COUNT(*) FROM crm_message_log m WHERE m.player_id = p.id AND m.channel = 'email' AND m.created_at >= NOW() - INTERVAL '30 days')`
      return compareScalar(expr, cond.operator, cond.value, params)
    }
    case 'received_campaign': {
      if (!cond.campaignId) return 'TRUE'
      params.push(cond.campaignId)
      const idx = params.length
      const truthy = cond.value === true || cond.value === 'true' || cond.value === 1
      const op = cond.operator === '=' ? (truthy ? 'EXISTS' : 'NOT EXISTS') : 'EXISTS'
      return `${op} (SELECT 1 FROM crm_message_log m WHERE m.player_id = p.id AND m.campaign_id = $${idx})`
    }
    case 'clicked_campaign': {
      if (!cond.campaignId) return 'TRUE'
      params.push(cond.campaignId)
      const idx = params.length
      return `EXISTS (SELECT 1 FROM crm_message_log m WHERE m.player_id = p.id AND m.campaign_id = $${idx} AND m.clicked_at IS NOT NULL)`
    }
  }
  void joins
  return 'TRUE'
}

function compileAffiliate(
  cond: AffiliateCondition,
  params: CompiledSegment['params'],
  joins: Set<JoinAlias>,
): string {
  switch (cond.field) {
    case 'attributed_affiliate':
      return compareScalar('p.attributed_affiliate_id', cond.operator, cond.value, params)
    case 'attributed_promo_code':
      return compareScalar('p.attributed_promo_code', cond.operator, cond.value, params)
    case 'has_affiliate': {
      const truthy = cond.value === true || cond.value === 'true' || cond.value === 1
      const matches = cond.operator === '=' ? truthy : !truthy
      return matches
        ? `(p.attributed_affiliate_id IS NOT NULL)`
        : `(p.attributed_affiliate_id IS NULL)`
    }
  }
  void joins
}

function compileInSegment(cond: InSegmentCondition, params: CompiledSegment['params']): string {
  params.push(cond.segmentId)
  const idx = params.length
  return `EXISTS (SELECT 1 FROM crm_segments s WHERE s.id = $${idx} AND p.id = ANY (
    SELECT id FROM (SELECT NULL::uuid AS id WHERE FALSE) _placeholder
  ))`
}

// ----- Legacy comparison helpers -------------------------------------------

function compareScalar(
  column: string,
  operator: string,
  value: unknown,
  params: CompiledSegment['params'],
): string {
  switch (operator) {
    case '=':
    case '!=':
    case '>':
    case '>=':
    case '<':
    case '<=': {
      params.push(coerceParam(value))
      return `${column} ${operator} $${params.length}`
    }
    case 'in':
    case 'not_in': {
      const list = Array.isArray(value) ? value : [value]
      if (list.length === 0) return operator === 'in' ? 'FALSE' : 'TRUE'
      const ph = list.map((v) => {
        params.push(coerceParam(v))
        return `$${params.length}`
      })
      return `${column} ${operator === 'in' ? 'IN' : 'NOT IN'} (${ph.join(',')})`
    }
    case 'between': {
      const [lo, hi] = Array.isArray(value) ? value : [value, value]
      params.push(coerceParam(lo))
      const a = params.length
      params.push(coerceParam(hi))
      const b = params.length
      return `${column} BETWEEN $${a} AND $${b}`
    }
    case 'is_null':
      return `${column} IS NULL`
    case 'is_not_null':
      return `${column} IS NOT NULL`
    case 'before':
    case 'after':
    case 'within_last':
      return compareTimestamp(column, operator, value, 'days', params)
    default:
      return 'TRUE'
  }
}

function compareTimestamp(
  column: string,
  operator: string,
  value: unknown,
  unit: 'days' | 'hours' | 'weeks' | undefined,
  params: CompiledSegment['params'],
): string {
  const u = unit ?? 'days'
  switch (operator) {
    case 'before': {
      params.push(String(value))
      return `${column} < $${params.length}::timestamptz`
    }
    case 'after': {
      params.push(String(value))
      return `${column} > $${params.length}::timestamptz`
    }
    case 'between': {
      const [lo, hi] = Array.isArray(value) ? value : [value, value]
      params.push(String(lo))
      const a = params.length
      params.push(String(hi))
      const b = params.length
      return `${column} BETWEEN $${a}::timestamptz AND $${b}::timestamptz`
    }
    case 'within_last': {
      params.push(Number(value))
      return `${column} >= NOW() - $${params.length} * INTERVAL '1 ${u}'`
    }
    case 'is_null':
      return `${column} IS NULL`
    case 'is_not_null':
      return `${column} IS NOT NULL`
    case '=':
    case '!=':
    case '>':
    case '>=':
    case '<':
    case '<=':
      return compareScalar(column, operator, value, params)
    default:
      return 'TRUE'
  }
}

function coerceParam(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
  return JSON.stringify(v)
}
