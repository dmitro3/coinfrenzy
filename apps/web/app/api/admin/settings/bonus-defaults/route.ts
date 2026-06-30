import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { system as systemMod } from '@coinfrenzy/core'
import { hasAtLeast } from '@coinfrenzy/core/auth'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/09 — bonus defaults applied when a bonus template omits a value.
// Manager+ may edit; actual per-bonus values still need to pass the
// stricter tier_caps clamps elsewhere.

const putBody = z.object({
  defaultPlaythroughMultiplier: z.number().nonnegative().max(100),
  defaultPlaythroughWindowHours: z
    .number()
    .int()
    .positive()
    .max(24 * 365),
  defaultExpiryDays: z.number().int().positive().max(365),
  stackingEnabled: z.boolean(),
})

export async function PUT(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  if (!hasAtLeast(built.data.session.payload.role, 'manager')) {
    return jsonError(403, 'forbidden')
  }

  let parsed: z.infer<typeof putBody>
  try {
    parsed = putBody.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const result = await systemMod.setBonusDefaults(built.data.ctx, {
    defaultPlaythroughMultiplier: parsed.defaultPlaythroughMultiplier,
    defaultPlaythroughWindowHours: parsed.defaultPlaythroughWindowHours,
    defaultExpiryDays: parsed.defaultExpiryDays,
    stackingEnabled: parsed.stackingEnabled,
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
