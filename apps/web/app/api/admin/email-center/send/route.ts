import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { emailCenter } from '@coinfrenzy/core'
import { canOverrideSuppression, canSendOneOffEmail } from '@coinfrenzy/core/auth'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const sendBody = z
  .object({
    toEmail: z.string().email().optional(),
    toPlayerId: z.string().uuid().optional(),
    subject: z.string().min(1).max(200),
    bodyHtml: z.string().min(1).max(200_000),
    bodyText: z.string().max(200_000).optional(),
    fromEmail: z.string().email().optional(),
    replyTo: z.string().email().optional(),
    templateId: z.string().uuid().optional(),
    ignoreSuppression: z.boolean().optional(),
  })
  .refine((v) => v.toEmail !== undefined || v.toPlayerId !== undefined, {
    message: 'toEmail_or_toPlayerId_required',
  })

export async function POST(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const role = built.data.session.payload.role
  if (!canSendOneOffEmail(role)) return jsonError(403, 'forbidden')

  let parsed: z.infer<typeof sendBody>
  try {
    parsed = sendBody.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  if (parsed.ignoreSuppression && !canOverrideSuppression(role)) {
    return jsonError(403, 'cannot_override_suppression')
  }

  const result = await emailCenter.sendOneOffEmail(built.data.ctx, {
    toEmail: parsed.toEmail,
    toPlayerId: parsed.toPlayerId,
    subject: parsed.subject,
    bodyHtml: parsed.bodyHtml,
    bodyText: parsed.bodyText ?? null,
    fromEmail: parsed.fromEmail ?? null,
    replyTo: parsed.replyTo ?? null,
    templateId: parsed.templateId ?? null,
    ignoreSuppression: parsed.ignoreSuppression === true,
  })
  await built.data.flushAfterCommit()

  if (!result.ok) {
    if (result.error.code === 'SUPPRESSED') return jsonError(409, 'suppressed')
    if (result.error.code === 'PLAYER_NOT_FOUND') return jsonError(404, 'player_not_found')
    if (result.error.code === 'TEMPLATE_NOT_FOUND') return jsonError(404, 'template_not_found')
    if (result.error.code === 'DISPATCH_FAILED')
      return jsonError(502, 'dispatch_failed', { message: result.error.message })
    if (result.error.code === 'INVALID')
      return jsonError(400, 'invalid', { reason: result.error.reason })
    return jsonError(400, 'failed')
  }
  return NextResponse.json({
    messageId: result.value.messageId,
    recipient: result.value.recipient,
    providerMessageId: result.value.providerMessageId,
  })
}
