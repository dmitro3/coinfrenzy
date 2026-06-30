import { NextResponse, type NextRequest } from 'next/server'

import { audit as auditMod, emailCenter } from '@coinfrenzy/core'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/email-center/messages/[id]/body
 *
 * Returns a short-lived signed URL to the archived HTML body in R2.
 * The URL expires in 5 minutes; the admin must click "Show full body"
 * again afterwards. Every reveal is audited so we can prove who looked
 * at what during AML / litigation review.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { id } = await ctx.params

  const createdAtParam = req.nextUrl.searchParams.get('createdAt')
  const createdAt = createdAtParam ? new Date(createdAtParam) : undefined
  const url = await emailCenter.getMessageBodySignedUrl(
    built.data.ctx,
    id,
    createdAt && !isNaN(createdAt.getTime()) ? createdAt : undefined,
  )
  if (!url) return jsonError(404, 'body_not_archived')

  const actor = built.data.ctx.actor
  await auditMod.writeAuditEntry(built.data.ctx.db, {
    actorKind: 'admin',
    actorId: actor.kind === 'admin' ? actor.adminId : null,
    actorRole: actor.kind === 'admin' ? actor.role : null,
    action: 'email.body_revealed',
    resourceKind: 'crm_message',
    resourceId: id,
    ip: actor.kind === 'admin' ? actor.ip : null,
    requestId: built.data.ctx.reqId,
  })
  await built.data.flushAfterCommit()

  return NextResponse.json({ url, expiresIn: 300 })
}
