import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { packages as packagesMod } from '@coinfrenzy/core'
import { canEditPackages } from '@coinfrenzy/core/auth'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATUS_OPTIONS = ['active', 'inactive', 'archived'] as const

const createBody = z.object({
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
  displayName: z.string().min(1).max(120),
  // priceUsd is dollars major — converted to bigint money internally.
  priceUsd: z.number().positive().max(1_000_000),
  baseGc: z.number().int().nonnegative().max(10_000_000_000),
  baseSc: z.number().nonnegative().max(10_000_000).default(0),
  bonusGc: z.number().int().nonnegative().max(10_000_000_000).default(0),
  bonusSc: z.number().nonnegative().max(10_000_000).default(0),
  playthroughMultiplier: z.string().default('1.0'),
  bonusScPlaythroughMultiplier: z.string().default('3.0'),
  bonusGcPlaythroughMultiplier: z.string().default('1.0'),
  promotionalLabel: z.string().max(40).nullable().optional(),
  badgeColor: z.string().max(32).nullable().optional(),
  displayImageUrl: z.string().url().max(2000).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
  featuredSlot: z.union([z.literal(1), z.literal(2), z.null()]).optional(),
  bannerHeadline: z.string().max(120).nullable().optional(),
  bannerSubhead: z.string().max(200).nullable().optional(),
  bannerImageUrl: z.string().url().max(2000).nullable().optional(),
  status: z.enum(STATUS_OPTIONS).default('active'),
  validFrom: z.string().datetime().nullable().optional(),
  validUntil: z.string().datetime().nullable().optional(),
  firstPurchaseOnly: z.boolean().default(false),
  maxPerPlayer: z.number().int().positive().nullable().optional(),
  bonusId: z.string().uuid().nullable().optional(),
})

// Money columns are bigint at numeric(20,4) scale. Player-facing dollars
// → bigint:  $10 → 10 * 10_000 = 100_000n. Coin columns use the same
// scale: 25,000 GC → 25_000 * 10_000n = 250_000_000n.
function toMoneyBigint(major: number): bigint {
  // Avoid float drift: multiply with care, round to nearest cent first.
  const cents = Math.round(major * 10_000)
  return BigInt(cents)
}

export async function POST(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  if (!canEditPackages(built.data.session.payload.role)) {
    return jsonError(403, 'forbidden')
  }

  let parsed: z.infer<typeof createBody>
  try {
    parsed = createBody.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const result = await packagesMod.createPackage(built.data.ctx, {
    slug: parsed.slug,
    displayName: parsed.displayName,
    priceUsd: toMoneyBigint(parsed.priceUsd),
    baseGc: toMoneyBigint(parsed.baseGc),
    baseSc: toMoneyBigint(parsed.baseSc),
    bonusGc: toMoneyBigint(parsed.bonusGc),
    bonusSc: toMoneyBigint(parsed.bonusSc),
    playthroughMultiplier: parsed.playthroughMultiplier,
    bonusScPlaythroughMultiplier: parsed.bonusScPlaythroughMultiplier,
    bonusGcPlaythroughMultiplier: parsed.bonusGcPlaythroughMultiplier,
    promotionalLabel: parsed.promotionalLabel ?? null,
    badgeColor: parsed.badgeColor ?? null,
    displayImageUrl: parsed.displayImageUrl ?? null,
    description: parsed.description ?? null,
    sortOrder: parsed.sortOrder,
    featuredSlot: parsed.featuredSlot ?? null,
    bannerHeadline: parsed.bannerHeadline ?? null,
    bannerSubhead: parsed.bannerSubhead ?? null,
    bannerImageUrl: parsed.bannerImageUrl ?? null,
    status: parsed.status,
    validFrom: parsed.validFrom ? new Date(parsed.validFrom) : null,
    validUntil: parsed.validUntil ? new Date(parsed.validUntil) : null,
    firstPurchaseOnly: parsed.firstPurchaseOnly,
    maxPerPlayer: parsed.maxPerPlayer ?? null,
    bonusId: parsed.bonusId ?? null,
  })
  await built.data.flushAfterCommit()

  if (!result.ok) {
    if (result.error.code === 'SLUG_CONFLICT') return jsonError(409, 'slug_conflict')
    if (result.error.code === 'SLOT_CONFLICT') return jsonError(409, 'featured_slot_taken')
    return jsonError(400, result.error.code)
  }
  return NextResponse.json({ id: result.value.id })
}
