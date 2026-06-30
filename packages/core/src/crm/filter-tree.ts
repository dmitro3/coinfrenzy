// docs/11 §3.2 + §3.3 — the canonical filter tree shape used by segments,
// flow conditions, banner audiences, and the campaign throttle exclusion
// query. All public condition types appear here.
//
// The shape is JSON-serialisable so it round-trips through `crm_segments
// .filter_tree` (jsonb). Validation lives in `validateFilterTree` below.
//
// M3 added a generic `attribute` leaf type backed by the registry in
// `attributes.ts`. The 7 legacy leaf types (demographic/behavior/bonus/...)
// remain valid so previously saved segments keep working unchanged. New
// segments emitted by the M3 SegmentBuilder use the `attribute` shape
// exclusively.

import { z } from 'zod'

// Bumped when the compiler's SQL output changes meaningfully. Seg rows
// store this so we can re-render or warn on stale compiled SQL.
export const COMPILER_VERSION = 2

export type ComparisonOp = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'not_in' | 'between'
export type DateOp = 'before' | 'after' | 'between' | 'within_last' | 'is_null' | 'is_not_null'

const valueSchema: z.ZodType<unknown> = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string(), z.number(), z.boolean()])),
])

// Demographic — players + tier_progress + tiers.
const demographicSchema = z.object({
  type: z.literal('demographic'),
  field: z.enum([
    'state',
    'country',
    'tier_level',
    'tier_name',
    'age',
    'kyc_level',
    'signup_date',
    'signup_source',
    'signup_country',
    'status',
  ]),
  operator: z.enum([
    '=',
    '!=',
    '>',
    '>=',
    '<',
    '<=',
    'in',
    'not_in',
    'between',
    'before',
    'after',
    'within_last',
  ]),
  value: valueSchema,
  unit: z.enum(['days', 'hours', 'weeks']).optional(),
})

const behaviorSchema = z.object({
  type: z.literal('behavior'),
  field: z.enum([
    'total_deposited_usd',
    'total_redeemed_usd',
    'net_position_usd',
    'total_wagered_sc',
    'total_wagered_gc',
    'total_won_sc',
    'ggr_sc',
    'ngr_sc',
    'purchase_count',
    'redemption_count',
    'session_count',
    'round_count',
    'days_active',
    'last_purchase_at',
    'last_session_at',
    'last_login_at',
    'first_purchase_at',
    'deposited_usd_30d',
    'wagered_sc_30d',
    'session_count_30d',
    'days_active_30d',
    'game_played',
    'last_30d_wagered',
    'last_7d_wagered',
  ]),
  operator: z.enum([
    '=',
    '!=',
    '>',
    '>=',
    '<',
    '<=',
    'in',
    'not_in',
    'between',
    'before',
    'after',
    'within_last',
    'is_null',
    'is_not_null',
  ]),
  value: valueSchema,
  unit: z.enum(['days', 'hours', 'weeks']).optional(),
  /** For game-scoped behavior fields. */
  gameId: z.string().uuid().optional(),
  /** For windowed wager fields, restrict to a game id list. */
  gameIds: z.array(z.string().uuid()).optional(),
  currency: z.enum(['GC', 'SC', 'USD']).optional(),
})

const bonusSchema = z.object({
  type: z.literal('bonus'),
  field: z.enum([
    'has_active_bonus',
    'bonus_type',
    'playthrough_complete',
    'bonus_count_lifetime',
    'bonus_count_30d',
  ]),
  operator: z.enum(['=', '!=', '>=', '<=', '>', '<', 'in', 'not_in']),
  value: valueSchema,
})

const complianceSchema = z.object({
  type: z.literal('compliance'),
  field: z.enum(['has_active_flag', 'self_excluded', 'rg_limited']),
  operator: z.enum(['=', '!=']),
  value: valueSchema,
})

const engagementSchema = z.object({
  type: z.literal('engagement'),
  field: z.enum([
    'email_consent',
    'sms_consent',
    'last_email_opened',
    'last_email_clicked',
    'total_emails_received_30d',
    'received_campaign',
    'clicked_campaign',
  ]),
  operator: z.enum([
    '=',
    '!=',
    '>',
    '>=',
    '<',
    '<=',
    'before',
    'after',
    'within_last',
    'is_null',
    'is_not_null',
  ]),
  value: valueSchema,
  unit: z.enum(['days', 'hours', 'weeks']).optional(),
  campaignId: z.string().uuid().optional(),
})

const affiliateSchema = z.object({
  type: z.literal('affiliate'),
  field: z.enum(['attributed_affiliate', 'attributed_promo_code', 'has_affiliate']),
  operator: z.enum(['=', '!=', 'in', 'not_in', 'is_null', 'is_not_null']),
  value: valueSchema,
})

const inSegmentSchema = z.object({
  type: z.literal('in_segment'),
  segmentId: z.string().uuid(),
})

// M3 — generic attribute leaf driven by the registry in `attributes.ts`.
// `attributeKey` is validated at compile time (the compiler rejects
// unknown keys); we keep the schema permissive here so the JSONB
// payload can survive registry renames without invalidating segments.
const attributeSchema = z.object({
  type: z.literal('attribute'),
  attributeKey: z.string().min(1),
  operator: z.string().min(1),
  /**
   * The user-supplied comparison target. Shape depends on the operator:
   *   - scalar ops (=, !=, >, <, >=, <=, contains, ...) → string | number | boolean
   *   - between → [lo, hi]
   *   - in_list / not_in_list → array
   *   - is_set / is_not_set / is_true / is_false → ignored
   *   - in_last_n_days / more_than_n_days_ago → number (days)
   *   - picker ops on `played_game` etc. → uuid (paramKind validated at compile)
   */
  value: z.unknown().optional(),
})

const conditionLeafSchema = z.discriminatedUnion('type', [
  demographicSchema,
  behaviorSchema,
  bonusSchema,
  complianceSchema,
  engagementSchema,
  affiliateSchema,
  inSegmentSchema,
  attributeSchema,
])

// Recursive group definition. We declare the group types via Zod lazy
// indirection because conditions can be nested groups.
export type FilterCondition = z.infer<typeof conditionLeafSchema> | FilterGroup

export interface FilterGroup {
  operator: 'AND' | 'OR' | 'NOT'
  conditions: FilterCondition[]
}

export const filterGroupSchema: z.ZodType<FilterGroup> = z.lazy(() =>
  z.object({
    operator: z.enum(['AND', 'OR', 'NOT']),
    conditions: z.array(z.union([conditionLeafSchema, filterGroupSchema])),
  }),
)

export type FilterTree = FilterGroup

export function validateFilterTree(input: unknown): FilterTree {
  return filterGroupSchema.parse(input)
}

export function isGroup(node: FilterCondition): node is FilterGroup {
  return (
    typeof (node as FilterGroup).operator === 'string' &&
    Array.isArray((node as FilterGroup).conditions)
  )
}

export type DemographicCondition = z.infer<typeof demographicSchema>
export type BehaviorCondition = z.infer<typeof behaviorSchema>
export type BonusCondition = z.infer<typeof bonusSchema>
export type ComplianceCondition = z.infer<typeof complianceSchema>
export type EngagementCondition = z.infer<typeof engagementSchema>
export type AffiliateCondition = z.infer<typeof affiliateSchema>
export type InSegmentCondition = z.infer<typeof inSegmentSchema>
export type AttributeCondition = z.infer<typeof attributeSchema>
