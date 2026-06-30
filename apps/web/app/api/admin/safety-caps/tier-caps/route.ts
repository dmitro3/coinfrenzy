import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { system as systemMod } from '@coinfrenzy/core'
import { canEditSafetyCaps } from '@coinfrenzy/core/auth'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const putBody = z.object({
  weeklyScMaxMajor: z.number().nonnegative().max(1_000_000),
  monthlyScMaxMajor: z.number().nonnegative().max(1_000_000),
  loginMultMax: z.number().min(1).max(10),
  cashbackPctMax: z.number().nonnegative().max(1), // decimal fraction
})

export async function PUT(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  if (!canEditSafetyCaps(built.data.session.payload.role)) {
    return jsonError(403, 'forbidden')
  }

  let parsed: z.infer<typeof putBody>
  try {
    parsed = putBody.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const result = await systemMod.setTierCaps(built.data.ctx, {
    weeklyScMax: BigInt(Math.floor(parsed.weeklyScMaxMajor * 10_000)),
    monthlyScMax: BigInt(Math.floor(parsed.monthlyScMaxMajor * 10_000)),
    loginMultMax: parsed.loginMultMax,
    cashbackPctMax: parsed.cashbackPctMax,
  })
  await built.data.flushAfterCommit()

  if (!result.ok) {
    if (result.error.code === 'CEILING_EXCEEDED') {
      return jsonError(400, 'ceiling_exceeded', {
        field: result.error.field,
        max: result.error.max,
      })
    }
    return jsonError(400, 'invalid', { reason: result.error.reason })
  }

  return NextResponse.json({
    ok: true,
    caps: {
      weeklyScMaxMajor: Number(result.value.weeklyScMax / 10_000n),
      monthlyScMaxMajor: Number(result.value.monthlyScMax / 10_000n),
      loginMultMax: result.value.loginMultMax,
      cashbackPctMax: result.value.cashbackPctMax,
    },
  })
}
