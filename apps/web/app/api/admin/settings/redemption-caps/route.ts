import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { system as systemMod } from '@coinfrenzy/core'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/09 — operator-wide redemption ceilings. Master-only because they
// are the last clamp before money leaves the platform. Per-rule
// auto-approve decisions still happen in redemption_rules; these are
// the hard outer bounds.

const putBody = z
  .object({
    minRedemptionUsd: z.number().nonnegative(),
    maxRedemptionUsd: z.number().positive().max(50_000),
    dailyRedemptionCapUsd: z.number().nonnegative().max(100_000),
    autoApprovalThresholdUsd: z.number().nonnegative().max(1_000),
  })
  .refine((v) => v.maxRedemptionUsd >= v.minRedemptionUsd, {
    message: 'maxRedemptionUsd must be >= minRedemptionUsd',
    path: ['maxRedemptionUsd'],
  })

export async function PUT(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  if (built.data.session.payload.role !== 'master') {
    return jsonError(403, 'forbidden')
  }

  let parsed: z.infer<typeof putBody>
  try {
    parsed = putBody.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const result = await systemMod.setRedemptionCaps(built.data.ctx, {
    minRedemptionUsd: parsed.minRedemptionUsd,
    maxRedemptionUsd: parsed.maxRedemptionUsd,
    dailyRedemptionCapUsd: parsed.dailyRedemptionCapUsd,
    autoApprovalThresholdUsd: parsed.autoApprovalThresholdUsd,
  })
  await built.data.flushAfterCommit()

  if (!result.ok) {
    if (result.error.code === 'VALIDATION') {
      return jsonError(400, 'validation', { issues: result.error.issues })
    }
    return jsonError(400, 'invalid', { reason: result.error.reason })
  }

  return NextResponse.json({ ok: true, settings: result.value })
}
