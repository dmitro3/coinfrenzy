import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { cashier as cashierMod } from '@coinfrenzy/core'
import { canManageRedemptionRules } from '@coinfrenzy/core/auth'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/07 §5.1 — quick toggle for the rule active flag. We split this out
// from the PATCH route so the admin list can drive the switch without
// re-sending the whole rule payload (and so we can audit the toggle as
// its own event distinct from a full edit).

const body = z.object({ isActive: z.boolean() })

export async function POST(req: NextRequest, ctx2: { params: Promise<{ id: string }> }) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { ctx, session, flushAfterCommit } = built.data
  if (!canManageRedemptionRules(session.payload.role)) {
    return jsonError(403, 'forbidden', { required: 'manager' })
  }

  const { id } = await ctx2.params
  let parsed: z.infer<typeof body>
  try {
    parsed = body.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const result = await cashierMod.setRedemptionRuleActive(ctx, id, parsed.isActive)
  await flushAfterCommit()
  if (!result.ok) {
    const status = result.error.code === 'NOT_FOUND' ? 404 : 400
    return jsonError(status, 'toggle_failed', result.error)
  }
  return NextResponse.json({
    rule: { id: result.value.id, isActive: result.value.isActive },
  })
}
