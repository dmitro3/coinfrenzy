import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { cashier as cashierMod } from '@coinfrenzy/core'
import { canManageRedemptionRules } from '@coinfrenzy/core/auth'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

type RedemptionRule = cashierMod.RedemptionRule

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/07 §5.1 — list + create redemption auto-approval rules.
//
// Any authenticated admin can read; manager+ can create. We mirror the
// gate on the player-side KYC-level routes (docs/09 §3).

const createBody = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  priority: z.number().int().min(0).max(100_000).optional(),
  isActive: z.boolean().optional(),
  action: z.enum(['auto_approve', 'route_to_review']).optional(),
  maxAmountUsd: z
    .string()
    .regex(/^-?\d+(\.\d+)?$/)
    .optional()
    .nullable(),
  minAmountUsd: z
    .string()
    .regex(/^-?\d+(\.\d+)?$/)
    .optional()
    .nullable(),
  requiredKycLevels: z.array(z.number().int().min(0).max(5)).optional(),
  blockedStates: z.array(z.string().length(2)).optional(),
  requirePriorPaidRedemption: z.boolean().optional(),
  completionHours: z.number().int().min(0).max(720).optional(),
})

export async function GET(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { ctx } = built.data
  const includeArchived = req.nextUrl.searchParams.get('includeArchived') === '1'
  const rules = await cashierMod.listRedemptionRules(ctx, { includeArchived })
  return NextResponse.json({ rules: rules.map(serialize) })
}

export async function POST(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { ctx, session, flushAfterCommit } = built.data
  if (!canManageRedemptionRules(session.payload.role)) {
    return jsonError(403, 'forbidden', { required: 'manager' })
  }

  let parsed: z.infer<typeof createBody>
  try {
    parsed = createBody.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const result = await cashierMod.createRedemptionRule(ctx, {
    title: parsed.title,
    description: parsed.description ?? null,
    priority: parsed.priority,
    isActive: parsed.isActive,
    action: parsed.action,
    maxAmountUsd: parseUsd(parsed.maxAmountUsd),
    minAmountUsd: parseUsd(parsed.minAmountUsd),
    requiredKycLevels: parsed.requiredKycLevels,
    blockedStates: parsed.blockedStates?.map((s) => s.toUpperCase()),
    requirePriorPaidRedemption: parsed.requirePriorPaidRedemption,
    completionHours: parsed.completionHours,
  })
  await flushAfterCommit()
  if (!result.ok) {
    return jsonError(400, 'create_failed', result.error)
  }
  return NextResponse.json({ rule: serialize(result.value) })
}

function parseUsd(value: string | null | undefined): bigint | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  const negative = value.startsWith('-')
  const abs = negative ? value.slice(1) : value
  const [major = '0', frac = ''] = abs.split('.')
  const padded = frac.padEnd(4, '0').slice(0, 4)
  const total = BigInt(major) * 10_000n + BigInt(padded || '0')
  return negative ? -total : total
}

function serialize(rule: RedemptionRule) {
  return {
    id: rule.id,
    title: rule.title,
    description: rule.description,
    priority: rule.priority,
    isActive: rule.isActive,
    action: rule.action,
    maxAmountUsd: rule.maxAmountUsd?.toString() ?? null,
    minAmountUsd: rule.minAmountUsd?.toString() ?? null,
    requiredKycLevels: rule.requiredKycLevels,
    blockedStates: rule.blockedStates,
    requirePriorPaidRedemption: rule.requirePriorPaidRedemption,
    completionHours: rule.completionHours,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
    archivedAt: rule.archivedAt?.toISOString() ?? null,
  }
}
