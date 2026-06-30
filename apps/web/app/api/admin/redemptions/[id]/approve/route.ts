import { randomUUID } from 'node:crypto'

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import {
  consoleLogger,
  createAfterCommitQueue,
  redemption as redemptionMod,
  type Actor,
  type Context,
} from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'

import { getAdminSession, getRequestMeta } from '@/lib/admin-session'
import { sendInngestEvent } from '@/lib/inngest-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/07 §7.1 — admin approves a pending redemption. The Inngest event
// triggers the worker's submit-to-finix function.

const body = z.object({
  reason: z.string().max(2000).optional().nullable(),
})

export async function POST(req: NextRequest, ctx2: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await ctx2.params
  let parsed: z.infer<typeof body>
  try {
    parsed = body.parse(await req.json().catch(() => ({})))
  } catch (e) {
    return NextResponse.json(
      { error: 'invalid_input', details: e instanceof z.ZodError ? e.flatten() : undefined },
      { status: 400 },
    )
  }

  const meta = await getRequestMeta()
  const actor: Actor = {
    kind: 'admin',
    adminId: session.admin.id,
    role: session.payload.role,
    ip: meta.ip,
  }
  const queue = createAfterCommitQueue(consoleLogger)
  const coreCtx: Context = {
    db: getDb(),
    logger: consoleLogger,
    actor,
    reqId: randomUUID(),
    afterCommit: queue.push,
  }

  const result = await redemptionMod.approveRedemption(coreCtx, {
    redemptionId: id,
    reason: parsed.reason ?? null,
  })
  await queue.flush()

  if (!result.ok) {
    const status = result.error.code === 'NOT_FOUND' ? 404 : 400
    return NextResponse.json(result.error, { status })
  }

  await sendInngestEvent({
    name: 'redemption/submit-to-finix',
    data: { redemptionId: id },
  })

  return NextResponse.json({ redemption: serialize(result.value) })
}

function serialize(r: ReturnType<typeof redemptionMod.rowToRecord>) {
  return {
    id: r.id,
    status: r.status,
    approvedBy: r.approvedBy,
    approvedAt: r.approvedAt?.toISOString() ?? null,
  }
}
