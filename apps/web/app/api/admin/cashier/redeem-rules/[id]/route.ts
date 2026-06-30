import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { cashier as cashierMod } from '@coinfrenzy/core'
import { canManageRedemptionRules } from '@coinfrenzy/core/auth'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/07 §5.1 — per-rule operations. PATCH = edit; DELETE = archive.

type RedemptionRule = cashierMod.RedemptionRule

const patchBody = z.object({
  title: z.string().min(1).max(200).optional(),
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

export async function GET(_req: NextRequest, ctx2: { params: Promise<{ id: string }> }) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { id } = await ctx2.params
  const rule = await cashierMod.loadRedemptionRule(built.data.ctx, id)
  if (!rule) return jsonError(404, 'not_found')
  return NextResponse.json({ rule: serialize(rule) })
}

export async function PATCH(req: NextRequest, ctx2: { params: Promise<{ id: string }> }) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { ctx, session, flushAfterCommit } = built.data
  if (!canManageRedemptionRules(session.payload.role)) {
    return jsonError(403, 'forbidden', { required: 'manager' })
  }

  const { id } = await ctx2.params
  let parsed: z.infer<typeof patchBody>
  try {
    parsed = patchBody.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const existing = await cashierMod.loadRedemptionRule(ctx, id)
  if (!existing) return jsonError(404, 'not_found')

  const result = await cashierMod.updateRedemptionRule(ctx, id, {
    title: parsed.title ?? existing.title,
    description: parsed.description === undefined ? existing.description : parsed.description,
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
    const status = result.error.code === 'NOT_FOUND' ? 404 : 400
    return jsonError(status, 'update_failed', result.error)
  }
  return NextResponse.json({ rule: serialize(result.value) })
}

export async function DELETE(_req: NextRequest, ctx2: { params: Promise<{ id: string }> }) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { ctx, session, flushAfterCommit } = built.data
  if (!canManageRedemptionRules(session.payload.role)) {
    return jsonError(403, 'forbidden', { required: 'manager' })
  }
  const { id } = await ctx2.params
  const result = await cashierMod.archiveRedemptionRule(ctx, id)
  await flushAfterCommit()
  if (!result.ok) {
    const status = result.error.code === 'NOT_FOUND' ? 404 : 400
    return jsonError(status, 'archive_failed', result.error)
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
