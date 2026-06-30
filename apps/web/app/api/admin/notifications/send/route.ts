import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { notificationCenter } from '@coinfrenzy/core'
import { canSendNotification } from '@coinfrenzy/core/auth'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const sendBody = z
  .object({
    toPlayerId: z.string().uuid().optional(),
    audience: z.enum(['all_active', 'never']).optional(),
    title: z.string().min(1).max(120),
    body: z.string().max(600).optional(),
    ctaUrl: z.string().max(500).optional(),
    category: z.string().max(40).optional(),
    priority: z.enum(['low', 'normal', 'high']).optional(),
    expiresAt: z.string().datetime().optional(),
  })
  .refine((v) => v.toPlayerId !== undefined || v.audience !== undefined, {
    message: 'recipient_required',
  })

export async function POST(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  if (!canSendNotification(built.data.session.payload.role)) {
    return jsonError(403, 'forbidden')
  }

  let parsed: z.infer<typeof sendBody>
  try {
    parsed = sendBody.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const result = await notificationCenter.sendOneOffNotification(built.data.ctx, {
    toPlayerId: parsed.toPlayerId,
    audience: parsed.audience,
    title: parsed.title,
    body: parsed.body ?? null,
    ctaUrl: parsed.ctaUrl ?? null,
    category: parsed.category ?? null,
    priority: parsed.priority,
    expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
  })
  await built.data.flushAfterCommit()

  if (!result.ok) {
    if (result.error.code === 'PLAYER_NOT_FOUND') return jsonError(404, 'player_not_found')
    if (result.error.code === 'NO_RECIPIENTS') return jsonError(409, 'no_recipients')
    return jsonError(400, 'invalid', { reason: result.error.reason })
  }
  return NextResponse.json(result.value)
}
