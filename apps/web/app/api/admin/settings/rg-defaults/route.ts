import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { system as systemMod } from '@coinfrenzy/core'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/09 — RG defaults are master-only because they shape platform-wide
// legal exposure. New accounts inherit these values; players can tighten
// (lower) them via self-service but cannot raise without the 24h delay.

const putBody = z.object({
  dailyPurchaseLimitUsd: z.number().nonnegative().max(100_000),
  weeklyPurchaseLimitUsd: z.number().nonnegative().max(500_000),
  monthlyPurchaseLimitUsd: z.number().nonnegative().max(1_500_000),
  sessionLengthMinutes: z
    .number()
    .int()
    .positive()
    .max(12 * 60),
  coolingOffHours: z
    .number()
    .int()
    .positive()
    .max(24 * 365),
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

  const result = await systemMod.setRgDefaults(built.data.ctx, {
    dailyPurchaseLimitUsd: parsed.dailyPurchaseLimitUsd,
    weeklyPurchaseLimitUsd: parsed.weeklyPurchaseLimitUsd,
    monthlyPurchaseLimitUsd: parsed.monthlyPurchaseLimitUsd,
    sessionLengthMinutes: parsed.sessionLengthMinutes,
    coolingOffHours: parsed.coolingOffHours,
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
