import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { tiers as tiersMod } from '@coinfrenzy/core'
import { canEditTiers } from '@coinfrenzy/core/auth'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATUS_OPTIONS = ['active', 'inactive'] as const

const createBody = z.object({
  slug: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9-]+$/),
  displayName: z.string().min(1).max(60),
  level: z.number().int().min(1).max(99),
  xpRequired: z.number().nonnegative().max(1_000_000_000_000).default(0),
  weeklyScBonus: z.number().nonnegative().max(1_000_000).default(0),
  monthlyScBonus: z.number().nonnegative().max(10_000_000).default(0),
  dailyLoginBonusMult: z.string().default('1.0'),
  cashbackPct: z.string().nullable().optional(),
  iconUrl: z.string().url().max(2000).nullable().optional(),
  badgeColor: z.string().max(32).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  status: z.enum(STATUS_OPTIONS).default('active'),
})

function toMoneyBigint(major: number): bigint {
  // money columns are bigint at numeric(20,4) scale ⇒ 10_000 minor per major.
  return BigInt(Math.round(major * 10_000))
}

export async function POST(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  if (!canEditTiers(built.data.session.payload.role)) {
    return jsonError(403, 'forbidden')
  }

  let parsed: z.infer<typeof createBody>
  try {
    parsed = createBody.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const result = await tiersMod.createTier(built.data.ctx, {
    slug: parsed.slug,
    displayName: parsed.displayName,
    level: parsed.level,
    xpRequired: toMoneyBigint(parsed.xpRequired),
    weeklyScBonus: toMoneyBigint(parsed.weeklyScBonus),
    monthlyScBonus: toMoneyBigint(parsed.monthlyScBonus),
    dailyLoginBonusMult: parsed.dailyLoginBonusMult,
    cashbackPct: parsed.cashbackPct ?? null,
    iconUrl: parsed.iconUrl ?? null,
    badgeColor: parsed.badgeColor ?? null,
    description: parsed.description ?? null,
    status: parsed.status,
  })
  await built.data.flushAfterCommit()

  if (!result.ok) {
    if (result.error.code === 'SLUG_CONFLICT') return jsonError(409, 'slug_conflict')
    if (result.error.code === 'LEVEL_CONFLICT') return jsonError(409, 'level_conflict')
    if (result.error.code === 'TIER_LIMIT') return jsonError(409, 'tier_limit_reached')
    if (result.error.code === 'CAP_EXCEEDED') {
      return jsonError(400, 'cap_exceeded', { field: result.error.field, max: result.error.max })
    }
    if (result.error.code === 'INVALID') {
      return jsonError(400, 'invalid', { reason: result.error.reason })
    }
    return jsonError(400, 'failed')
  }
  return NextResponse.json({ id: result.value.id })
}
