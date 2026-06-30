import 'server-only'

import { randomUUID } from 'node:crypto'

import { NextResponse } from 'next/server'

import {
  consoleLogger,
  createAfterCommitQueue,
  type Actor,
  type Context,
  type InngestSender,
} from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'

import { getAdminSession, getRequestMeta } from './admin-session'
import { sendInngestEvent } from './inngest-client'

const inngestSender: InngestSender = {
  send: async (event) => sendInngestEvent(event),
}

export interface AdminRouteContext {
  ctx: Context
  flushAfterCommit: () => Promise<void>
  session: NonNullable<Awaited<ReturnType<typeof getAdminSession>>>
  /** Client IP — already attached to ctx.actor (admin variant) but exposed for audit writes. */
  ip: string
  /** Raw user-agent string — useful for audit_log entries. */
  userAgent: string
}

/**
 * Standard admin-API context builder. Requires a valid admin session.
 * Returns a NextResponse for unauthorized requests.
 */
export async function buildAdminContext(): Promise<
  { kind: 'ok'; data: AdminRouteContext } | { kind: 'unauthorized'; response: NextResponse }
> {
  const session = await getAdminSession()
  if (!session) {
    return {
      kind: 'unauthorized',
      response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
    }
  }
  const meta = await getRequestMeta()
  const actor: Actor = {
    kind: 'admin',
    adminId: session.admin.id,
    role: session.payload.role,
    ip: meta.ip,
  }
  const reqId = randomUUID()
  const queue = createAfterCommitQueue(consoleLogger)
  const ctx: Context = {
    db: getDb(),
    logger: consoleLogger.child({ reqId, actor_kind: actor.kind }),
    actor,
    reqId,
    afterCommit: queue.push,
    inngest: inngestSender,
  }
  return {
    kind: 'ok',
    data: { ctx, flushAfterCommit: queue.flush, session, ip: meta.ip, userAgent: meta.userAgent },
  }
}

export function jsonError(status: number, message: string, details?: unknown): NextResponse {
  return NextResponse.json({ error: message, details }, { status })
}
