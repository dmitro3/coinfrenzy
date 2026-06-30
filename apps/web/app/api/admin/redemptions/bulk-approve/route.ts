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

// docs/08 §7.1 — bulk approve. Each redemption is its own txn so failures
// don't roll back the others. We call the same approveRedemption used by
// the single-row UI so the role-bounded threshold + audit are identical.

const body = z.object({
  redemptionIds: z.array(z.string().uuid()).min(1).max(100),
  reason: z.string().max(2000).optional().nullable(),
})

interface ItemResult {
  id: string
  ok: boolean
  status?: string
  error?: string
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

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

  const results: ItemResult[] = []
  for (const id of parsed.redemptionIds) {
    const queue = createAfterCommitQueue(consoleLogger)
    const coreCtx: Context = {
      db: getDb(),
      logger: consoleLogger,
      actor,
      reqId: randomUUID(),
      afterCommit: queue.push,
    }
    const r = await redemptionMod.approveRedemption(coreCtx, {
      redemptionId: id,
      reason: parsed.reason ?? 'Bulk approve',
    })
    await queue.flush()
    if (!r.ok) {
      results.push({ id, ok: false, error: r.error.code })
      continue
    }
    results.push({ id, ok: true, status: r.value.status })
    await sendInngestEvent({
      name: 'redemption/submit-to-finix',
      data: { redemptionId: id },
    })
  }

  return NextResponse.json({ results })
}
