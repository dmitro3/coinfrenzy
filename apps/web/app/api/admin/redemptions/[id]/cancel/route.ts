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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/07 §7.2 — cashier cancels a pending redemption.
//
// Functionally identical to the reject endpoint with two differences:
//   1. Audit verb is `redemption.cancelled` (cashier hit Cancel, not Reject)
//      so the audit log + the cancelled-redemptions list separate
//      "killed by us" from "policy violation".
//   2. The reason is optional — the operator may just cancel a duplicate
//      or test row without a long justification. The core still records
//      whatever string we send so downstream support can read it.
//
// The SC return path is the same: `rejectRedemption` with finalStatus
// 'cancelled' triggers `buildRedemptionRejected` on the ledger, which
// returns every drained SC back to the originating sub-bucket
// (purchased / earned / promo / bonus) on the player's wallet. See
// docs/04 §3.10 and packages/core/src/ledger/transactions/redemption-rejected.

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

  const reason = parsed.reason?.trim() || 'Cancelled by cashier'
  const result = await redemptionMod.rejectRedemption(coreCtx, {
    redemptionId: id,
    reason,
    reasonCategory: 'player_cancelled',
    finalStatus: 'cancelled',
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
