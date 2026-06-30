import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { tiers as tiersMod } from '@coinfrenzy/core'
import { canEditTiers } from '@coinfrenzy/core/auth'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATUS_OPTIONS = ['active', 'inactive'] as const

const patchBody = z.object({
  slug: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  displayName: z.string().min(1).max(60).optional(),
  level: z.number().int().min(1).max(99).optional(),
  xpRequired: z.number().nonnegative().max(1_000_000_000_000).optional(),
  weeklyScBonus: z.number().nonnegative().max(1_000_000).optional(),
  monthlyScBonus: z.number().nonnegative().max(10_000_000).optional(),
  dailyLoginBonusMult: z.string().optional(),
  cashbackPct: z.string().nullable().optional(),
  iconUrl: z.string().url().max(2000).nullable().optional(),
  badgeColor: z.string().max(32).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  status: z.enum(STATUS_OPTIONS).optional(),
})

function toMoneyBigint(major: number): bigint {
  return BigInt(Math.round(major * 10_000))
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { id } = await ctx.params

  const result = await tiersMod.getTier(built.data.ctx, id)
  if (!result.ok) return jsonError(404, 'not_found')

  const r = result.value
  return NextResponse.json({
    tier: {
      ...r,
      xpRequired: r.xpRequired.toString(),
      weeklyScBonus: r.weeklyScBonus.toString(),
      monthlyScBonus: r.monthlyScBonus.toString(),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    },
  })
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  if (!canEditTiers(built.data.session.payload.role)) {
    return jsonError(403, 'forbidden')
  }
  const { id } = await ctx.params

  let parsed: z.infer<typeof patchBody>
  try {
    parsed = patchBody.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const result = await tiersMod.updateTier(built.data.ctx, {
    id,
    slug: parsed.slug,
    displayName: parsed.displayName,
    level: parsed.level,
    xpRequired: parsed.xpRequired === undefined ? undefined : toMoneyBigint(parsed.xpRequired),
    weeklyScBonus:
      parsed.weeklyScBonus === undefined ? undefined : toMoneyBigint(parsed.weeklyScBonus),
    monthlyScBonus:
      parsed.monthlyScBonus === undefined ? undefined : toMoneyBigint(parsed.monthlyScBonus),
    dailyLoginBonusMult: parsed.dailyLoginBonusMult,
    cashbackPct: parsed.cashbackPct,
    iconUrl: parsed.iconUrl,
    badgeColor: parsed.badgeColor,
    description: parsed.description,
    status: parsed.status,
  })
  await built.data.flushAfterCommit()

  if (!result.ok) {
    if (result.error.code === 'NOT_FOUND') return jsonError(404, 'not_found')
    if (result.error.code === 'SLUG_CONFLICT') return jsonError(409, 'slug_conflict')
    if (result.error.code === 'LEVEL_CONFLICT') return jsonError(409, 'level_conflict')
    if (result.error.code === 'CAP_EXCEEDED') {
      return jsonError(400, 'cap_exceeded', { field: result.error.field, max: result.error.max })
    }
    if (result.error.code === 'INVALID') {
      return jsonError(400, 'invalid', { reason: result.error.reason })
    }
    return jsonError(400, 'failed')
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  if (!canEditTiers(built.data.session.payload.role)) {
    return jsonError(403, 'forbidden')
  }
  const { id } = await ctx.params

  const result = await tiersMod.deleteTier(built.data.ctx, id)
  await built.data.flushAfterCommit()

  if (!result.ok) {
    if (result.error.code === 'NOT_FOUND') return jsonError(404, 'not_found')
    if (result.error.code === 'IN_USE') {
      return jsonError(409, 'tier_in_use', { playerCount: result.error.playerCount })
    }
    return jsonError(400, 'failed')
  }
  return NextResponse.json({ ok: true })
}
