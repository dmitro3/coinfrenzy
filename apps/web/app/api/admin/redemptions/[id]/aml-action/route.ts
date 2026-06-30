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
import { hasAtLeast, type AdminRoleSlug } from '@coinfrenzy/core/auth'
import { getDb } from '@coinfrenzy/db/client'

import { getAdminSession, getRequestMeta } from '@/lib/admin-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/07 §7.3 — Manager+ AML hold actions: clear / confirm_hold / escalate.

const body = z.object({
  action: z.enum(['clear', 'confirm_hold', 'escalate']),
  notes: z.string().max(2000).optional().nullable(),
})

export async function POST(req: NextRequest, ctx2: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!hasAtLeast(session.payload.role as AdminRoleSlug, 'manager')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx2.params
  let parsed: z.infer<typeof body>
  try {
    parsed = body.parse(await req.json())
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

  const result = await redemptionMod.actOnAmlHold(coreCtx, {
    redemptionId: id,
    action: parsed.action,
    notes: parsed.notes ?? null,
  })
  await queue.flush()

  if (!result.ok) {
    const status = result.error.code === 'NOT_FOUND' ? 404 : 400
    return NextResponse.json(result.error, { status })
  }
  return NextResponse.json({
    redemption: { id: result.value.id, status: result.value.status },
  })
}
