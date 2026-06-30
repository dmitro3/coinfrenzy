import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { crm as coreCrm } from '@coinfrenzy/core'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/08 §6 + docs/11 §4 — admin one-off message send.
//
// Calls coreCrm.sendDirectMessage which dispatches via SendGrid/Twilio,
// writes a crm_message_log row, and audits. The route is the thin
// transport — parsing + auth + flushing afterCommit. All logic lives in
// packages/core/src/crm/send-direct.ts.

const body = z.object({
  channel: z.enum(['email', 'sms', 'in_app']).default('email'),
  templateSlug: z.string().trim().min(1).max(128),
  subject: z.string().max(255).optional(),
  body: z.string().max(10_000).optional(),
  testSendToSelf: z.boolean().optional(),
})

export async function POST(req: NextRequest, ctx2: { params: Promise<{ id: string }> }) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { ctx, flushAfterCommit, session } = built.data

  const { id } = await ctx2.params

  let parsed: z.infer<typeof body>
  try {
    parsed = body.parse(await req.json().catch(() => ({})))
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  if (parsed.channel === 'in_app') {
    // In-app notifications go through the notifications table, not the
    // CRM dispatch pipeline. Surface a clear error until that path is
    // wired (out of scope for the cutover handoff).
    return jsonError(501, 'in_app_dispatch_not_yet_implemented')
  }

  const result = await coreCrm.sendDirectMessage(ctx, {
    playerId: id,
    channel: parsed.channel,
    templateSlug: parsed.templateSlug,
    subjectOverride: parsed.subject ?? null,
    bodyOverride: parsed.body ?? null,
    testSendToSelf: parsed.testSendToSelf ?? false,
    selfEmail: session.admin.email ?? null,
  })

  await flushAfterCommit()

  if (!result.ok) {
    const code = result.error.code
    const httpStatus =
      code === 'PLAYER_NOT_FOUND' || code === 'TEMPLATE_NOT_FOUND'
        ? 404
        : code === 'CHANNEL_SUPPRESSED'
          ? 409
          : 400
    return jsonError(httpStatus, code.toLowerCase())
  }

  return NextResponse.json({
    ok: true,
    status: result.value.status,
    messageLogId: result.value.messageLogId,
    providerMessageId: result.value.providerMessageId,
    error: result.value.error,
    recipient: result.value.recipient,
    channel: result.value.channel,
  })
}
