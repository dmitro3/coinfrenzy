import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { packages as packagesMod } from '@coinfrenzy/core'
import { canEditPackages } from '@coinfrenzy/core/auth'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATUS_OPTIONS = ['active', 'inactive', 'archived'] as const

const patchBody = z.object({
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  displayName: z.string().min(1).max(120).optional(),
  priceUsd: z.number().positive().max(1_000_000).optional(),
  baseGc: z.number().int().nonnegative().max(10_000_000_000).optional(),
  baseSc: z.number().nonnegative().max(10_000_000).optional(),
  bonusGc: z.number().int().nonnegative().max(10_000_000_000).optional(),
  bonusSc: z.number().nonnegative().max(10_000_000).optional(),
  playthroughMultiplier: z.string().optional(),
  bonusScPlaythroughMultiplier: z.string().optional(),
  bonusGcPlaythroughMultiplier: z.string().optional(),
  promotionalLabel: z.string().max(40).nullable().optional(),
  badgeColor: z.string().max(32).nullable().optional(),
  displayImageUrl: z.string().url().max(2000).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  featuredSlot: z.union([z.literal(1), z.literal(2), z.null()]).optional(),
  bannerHeadline: z.string().max(120).nullable().optional(),
  bannerSubhead: z.string().max(200).nullable().optional(),
  bannerImageUrl: z.string().url().max(2000).nullable().optional(),
  status: z.enum(STATUS_OPTIONS).optional(),
  validFrom: z.string().datetime().nullable().optional(),
  validUntil: z.string().datetime().nullable().optional(),
  firstPurchaseOnly: z.boolean().optional(),
  maxPerPlayer: z.number().int().positive().nullable().optional(),
  bonusId: z.string().uuid().nullable().optional(),
})

function toMoneyBigint(major: number): bigint {
  const cents = Math.round(major * 10_000)
  return BigInt(cents)
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { id } = await ctx.params
  const result = await packagesMod.getPackage(built.data.ctx, id)
  if (!result.ok) return jsonError(404, 'not_found')

  const r = result.value
  return NextResponse.json({
    package: {
      ...r,
      priceUsd: r.priceUsd.toString(),
      baseGc: r.baseGc.toString(),
      baseSc: r.baseSc.toString(),
      bonusGc: r.bonusGc.toString(),
      bonusSc: r.bonusSc.toString(),
      validFrom: r.validFrom?.toISOString() ?? null,
      validUntil: r.validUntil?.toISOString() ?? null,
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
  if (!canEditPackages(built.data.session.payload.role)) {
    return jsonError(403, 'forbidden')
  }
  const { id } = await ctx.params

  let parsed: z.infer<typeof patchBody>
  try {
    parsed = patchBody.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  // Convert dollar/coin numerics → bigint money.
  const result = await packagesMod.updatePackage(built.data.ctx, {
    id,
    slug: parsed.slug,
    displayName: parsed.displayName,
    priceUsd: parsed.priceUsd === undefined ? undefined : toMoneyBigint(parsed.priceUsd),
    baseGc: parsed.baseGc === undefined ? undefined : toMoneyBigint(parsed.baseGc),
    baseSc: parsed.baseSc === undefined ? undefined : toMoneyBigint(parsed.baseSc),
    bonusGc: parsed.bonusGc === undefined ? undefined : toMoneyBigint(parsed.bonusGc),
    bonusSc: parsed.bonusSc === undefined ? undefined : toMoneyBigint(parsed.bonusSc),
    playthroughMultiplier: parsed.playthroughMultiplier,
    bonusScPlaythroughMultiplier: parsed.bonusScPlaythroughMultiplier,
    bonusGcPlaythroughMultiplier: parsed.bonusGcPlaythroughMultiplier,
    promotionalLabel: parsed.promotionalLabel,
    badgeColor: parsed.badgeColor,
    displayImageUrl: parsed.displayImageUrl,
    description: parsed.description,
    sortOrder: parsed.sortOrder,
    featuredSlot: parsed.featuredSlot,
    bannerHeadline: parsed.bannerHeadline,
    bannerSubhead: parsed.bannerSubhead,
    bannerImageUrl: parsed.bannerImageUrl,
    status: parsed.status,
    validFrom:
      parsed.validFrom === undefined
        ? undefined
        : parsed.validFrom === null
          ? null
          : new Date(parsed.validFrom),
    validUntil:
      parsed.validUntil === undefined
        ? undefined
        : parsed.validUntil === null
          ? null
          : new Date(parsed.validUntil),
    firstPurchaseOnly: parsed.firstPurchaseOnly,
    maxPerPlayer: parsed.maxPerPlayer,
    bonusId: parsed.bonusId,
  })
  await built.data.flushAfterCommit()

  if (!result.ok) {
    if (result.error.code === 'NOT_FOUND') return jsonError(404, 'not_found')
    if (result.error.code === 'SLUG_CONFLICT') return jsonError(409, 'slug_conflict')
    if (result.error.code === 'SLOT_CONFLICT') return jsonError(409, 'featured_slot_taken')
    return jsonError(400, result.error.code)
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  if (!canEditPackages(built.data.session.payload.role)) {
    return jsonError(403, 'forbidden')
  }
  const { id } = await ctx.params

  const result = await packagesMod.archivePackage(built.data.ctx, id)
  await built.data.flushAfterCommit()

  if (!result.ok) {
    if (result.error.code === 'NOT_FOUND') return jsonError(404, 'not_found')
    return jsonError(400, result.error.code)
  }
  return NextResponse.json({ ok: true })
}
