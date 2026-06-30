import 'server-only'

import { and, count, desc, eq, gte, sql } from 'drizzle-orm'

import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

export interface PromoCodeListRow {
  id: string
  code: string
  description: string | null
  status: string
  bonusId: string
  bonusName: string
  bonusSc: bigint
  bonusGc: bigint
  bonusMultiplier: string
  context: string | null
  usesCount: number
  maxTotalUses: number | null
  maxPerPlayer: number | null
  validFrom: Date | null
  validUntil: Date | null
  playthroughMultiplier: string | null
  playthroughWindowHours: number | null
  blockedEmailDomains: string[] | null
  createdAt: Date
  updatedAt: Date
}

export interface PromoCodeFilters {
  status?: string
  context?: string
  search?: string
}

export async function fetchPromoCodes(filters: PromoCodeFilters): Promise<PromoCodeListRow[]> {
  const db = getDb()
  const wheres = []
  if (filters.status && filters.status !== 'all') {
    wheres.push(eq(schema.promoCodes.status, filters.status))
  }
  if (filters.context && filters.context !== 'all') {
    wheres.push(eq(schema.promoCodes.requiredContext, filters.context))
  }
  if (filters.search) {
    wheres.push(sql`${schema.promoCodes.code} ilike ${`%${filters.search}%`}`)
  }

  const rows = await db
    .select({
      id: schema.promoCodes.id,
      code: schema.promoCodes.code,
      description: schema.promoCodes.description,
      status: schema.promoCodes.status,
      bonusId: schema.promoCodes.bonusId,
      bonusName: schema.bonuses.displayName,
      bonusSc: schema.bonuses.awardSc,
      bonusGc: schema.bonuses.awardGc,
      bonusMultiplier: schema.bonuses.playthroughMultiplier,
      context: schema.promoCodes.requiredContext,
      usesCount: schema.promoCodes.usesCount,
      maxTotalUses: schema.promoCodes.maxTotalUses,
      maxPerPlayer: schema.promoCodes.maxPerPlayer,
      validFrom: schema.promoCodes.validFrom,
      validUntil: schema.promoCodes.validUntil,
      playthroughMultiplier: schema.promoCodes.playthroughMultiplier,
      playthroughWindowHours: schema.promoCodes.playthroughWindowHours,
      blockedEmailDomains: schema.promoCodes.blockedEmailDomains,
      createdAt: schema.promoCodes.createdAt,
      updatedAt: schema.promoCodes.updatedAt,
    })
    .from(schema.promoCodes)
    .innerJoin(schema.bonuses, eq(schema.promoCodes.bonusId, schema.bonuses.id))
    .where(wheres.length > 0 ? and(...wheres) : undefined)
    .orderBy(desc(schema.promoCodes.createdAt))
    .limit(200)

  return rows.map((r) => ({
    ...r,
    playthroughMultiplier: r.playthroughMultiplier ? r.playthroughMultiplier.toString() : null,
  }))
}

export interface BonusTemplateOption {
  id: string
  slug: string
  displayName: string
  bonusType: string
  awardSc: string
  awardGc: string
  playthroughMultiplier: string
}

const BONUS_TYPE_TO_CATEGORY: Record<
  string,
  'purchase' | 'player_gift' | 'promo_code_signup' | 'promo_code_free'
> = {
  package: 'purchase',
  purchase_promocode: 'purchase',
  welcome: 'promo_code_signup',
  crm_promocode: 'promo_code_free',
  promotion: 'player_gift',
  admin_added_sc: 'player_gift',
  affiliate: 'player_gift',
  referral: 'player_gift',
  amoe: 'player_gift',
  daily: 'player_gift',
  tier_up: 'player_gift',
  weekly_tier: 'player_gift',
  monthly_tier: 'player_gift',
  jackpot: 'player_gift',
}

export async function fetchActiveBonusTemplates(): Promise<
  Array<
    BonusTemplateOption & {
      category: 'purchase' | 'player_gift' | 'promo_code_signup' | 'promo_code_free'
    }
  >
> {
  const db = getDb()
  const rows = await db
    .select({
      id: schema.bonuses.id,
      slug: schema.bonuses.slug,
      displayName: schema.bonuses.displayName,
      bonusType: schema.bonuses.bonusType,
      awardSc: schema.bonuses.awardSc,
      awardGc: schema.bonuses.awardGc,
      playthroughMultiplier: schema.bonuses.playthroughMultiplier,
    })
    .from(schema.bonuses)
    .where(eq(schema.bonuses.status, 'active'))
    .orderBy(schema.bonuses.displayName)

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    displayName: r.displayName,
    bonusType: r.bonusType,
    awardSc: r.awardSc.toString(),
    awardGc: r.awardGc.toString(),
    playthroughMultiplier: r.playthroughMultiplier,
    category: BONUS_TYPE_TO_CATEGORY[r.bonusType] ?? 'player_gift',
  }))
}

export interface PromoCodeInsights {
  active: number
  scheduled: number
  expiring7d: number
  usesToday: number
  topCode: { code: string; uses: number } | null
}

export async function fetchPromoCodeInsights(): Promise<PromoCodeInsights> {
  const db = getDb()
  const now = new Date()
  const in7days = new Date(now.getTime() + 7 * 86_400_000)
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)

  const [activeAgg] = await db
    .select({ n: count() })
    .from(schema.promoCodes)
    .where(eq(schema.promoCodes.status, 'active'))

  const [scheduledAgg] = await db
    .select({ n: count() })
    .from(schema.promoCodes)
    .where(sql`${schema.promoCodes.status} = 'active' and ${schema.promoCodes.validFrom} > now()`)

  const [expiringAgg] = await db
    .select({ n: count() })
    .from(schema.promoCodes)
    .where(
      and(
        eq(schema.promoCodes.status, 'active'),
        sql`${schema.promoCodes.validUntil} is not null`,
        sql`${schema.promoCodes.validUntil} between now() and ${in7days.toISOString()}`,
      ),
    )

  const [usesTodayAgg] = await db
    .select({ n: count() })
    .from(schema.promoRedemptions)
    .where(gte(schema.promoRedemptions.redeemedAt, startOfToday))

  const topRows = await db
    .select({ code: schema.promoCodes.code, uses: schema.promoCodes.usesCount })
    .from(schema.promoCodes)
    .where(eq(schema.promoCodes.status, 'active'))
    .orderBy(desc(schema.promoCodes.usesCount))
    .limit(1)

  return {
    active: activeAgg.n,
    scheduled: scheduledAgg.n,
    expiring7d: expiringAgg.n,
    usesToday: usesTodayAgg.n,
    topCode: topRows[0] ? { code: topRows[0].code, uses: topRows[0].uses } : null,
  }
}

export interface PromoCodeMappingRow {
  id: string
  code: string
  status: string
  bonusName: string
  bonusType: string
  bonusSc: bigint
  bonusGc: bigint
  bonusMultiplier: string
  overrideMultiplier: string | null
  overrideWindowHours: number | null
  maxPerPlayer: number | null
  maxTotalUses: number | null
  usesCount: number
}

export async function fetchPromoBonusMappings(): Promise<PromoCodeMappingRow[]> {
  const db = getDb()
  const rows = await db
    .select({
      id: schema.promoCodes.id,
      code: schema.promoCodes.code,
      status: schema.promoCodes.status,
      bonusName: schema.bonuses.displayName,
      bonusType: schema.bonuses.bonusType,
      bonusSc: schema.bonuses.awardSc,
      bonusGc: schema.bonuses.awardGc,
      bonusMultiplier: schema.bonuses.playthroughMultiplier,
      overrideMultiplier: schema.promoCodes.playthroughMultiplier,
      overrideWindowHours: schema.promoCodes.playthroughWindowHours,
      maxPerPlayer: schema.promoCodes.maxPerPlayer,
      maxTotalUses: schema.promoCodes.maxTotalUses,
      usesCount: schema.promoCodes.usesCount,
    })
    .from(schema.promoCodes)
    .innerJoin(schema.bonuses, eq(schema.promoCodes.bonusId, schema.bonuses.id))
    .orderBy(desc(schema.promoCodes.usesCount))
    .limit(200)

  return rows.map((r) => ({
    ...r,
    overrideMultiplier: r.overrideMultiplier ? r.overrideMultiplier.toString() : null,
  }))
}

export interface PromoDomainBlockRow {
  /** Synthetic id used by React keys. */
  id: string
  domain: string
  code: string
  promoCodeId: string
  updatedAt: Date
}

export interface BlockedCodeRow {
  code: string
  reason: string
  addedAt: Date
  addedBy: string | null
}

export async function fetchPromoCodeDomainBlocks(): Promise<PromoDomainBlockRow[]> {
  const db = getDb()
  // Per-code domain blocklists are stored on `promo_codes.blocked_email_domains`
  // (a text[] column). We flatten them out into one row per (code, domain)
  // pair so they're easy to review and revoke individually.
  const rows = await db
    .select({
      id: schema.promoCodes.id,
      code: schema.promoCodes.code,
      blockedDomains: schema.promoCodes.blockedEmailDomains,
      updatedAt: schema.promoCodes.updatedAt,
    })
    .from(schema.promoCodes)
    .where(sql`${schema.promoCodes.blockedEmailDomains} is not null`)

  const out: PromoDomainBlockRow[] = []
  for (const r of rows) {
    if (!r.blockedDomains) continue
    for (const domain of r.blockedDomains) {
      out.push({
        id: `${r.id}-${domain}`,
        domain,
        code: r.code,
        promoCodeId: r.id,
        updatedAt: r.updatedAt,
      })
    }
  }
  return out
}

export async function fetchBlockedCodes(): Promise<BlockedCodeRow[]> {
  const db = getDb()
  const rows = await db
    .select({
      code: schema.blockedPromoCodes.code,
      reason: schema.blockedPromoCodes.reason,
      addedAt: schema.blockedPromoCodes.addedAt,
      addedBy: schema.blockedPromoCodes.addedBy,
    })
    .from(schema.blockedPromoCodes)
    .orderBy(desc(schema.blockedPromoCodes.addedAt))
    .limit(500)
  return rows
}
