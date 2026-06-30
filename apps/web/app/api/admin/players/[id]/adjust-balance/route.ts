import { randomUUID } from 'node:crypto'

import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { audit, ledger } from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/04 §3.11 — admin_adjustment. Only master admins may grant or claw back
// coins outright; the ledger.write call is the only path that touches money.

const body = z.object({
  currency: z.enum(['GC', 'SC']),
  subBucket: z.enum(['purchased', 'bonus', 'promo', 'earned']),
  direction: z.enum(['credit', 'debit']),
  amountMinor: z
    .union([z.string(), z.number()])
    .transform((v) => BigInt(typeof v === 'number' ? Math.round(v) : v))
    .refine((v) => v > 0n, { message: 'amount must be > 0 minor units' }),
  reason: z.string().min(2).max(2000),
  reasonCategory: z.string().min(2).max(64),
})

export async function POST(req: NextRequest, ctx2: { params: Promise<{ id: string }> }) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { ctx, flushAfterCommit, session, ip, userAgent } = built.data

  if (session.payload.role !== 'master') {
    return jsonError(403, 'forbidden', { required: 'master' })
  }

  const { id } = await ctx2.params

  let parsed: z.infer<typeof body>
  try {
    parsed = body.parse(await req.json().catch(() => ({})))
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const db = getDb()
  const [player] = await db
    .select({ id: schema.players.id, status: schema.players.status })
    .from(schema.players)
    .where(eq(schema.players.id, id))
    .limit(1)
  if (!player) return jsonError(404, 'player_not_found')

  // 1. Insert admin_adjustments row (the audit + reason record).
  const adjustmentId = randomUUID()
  await db.insert(schema.adminAdjustments).values({
    id: adjustmentId,
    playerId: id,
    adminId: session.admin.id,
    amount: parsed.amountMinor,
    currency: parsed.currency,
    subBucket: parsed.subBucket,
    direction: parsed.direction,
    reason: parsed.reason,
    reasonCategory: parsed.reasonCategory,
    requiresApproval: false,
  })

  // 2. Build + write the ledger pair. The ledger module is the only thing
  //    allowed to mutate wallet balances (see .cursorrules).
  const spec = ledger.buildAdminAdjustment({
    adjustmentId,
    playerId: id,
    currency: parsed.currency,
    amount: parsed.amountMinor,
    subBucket: parsed.subBucket,
    direction: parsed.direction,
    metadata: {
      reason: parsed.reason,
      reason_category: parsed.reasonCategory,
      admin_id: session.admin.id,
    },
  })
  const written = await ledger.write(ctx, spec)
  if (!written.ok) {
    return jsonError(400, 'ledger_write_failed', written.error)
  }

  // The writer can return { status: 'duplicate' } if the same adjustment_id
  // was already processed — narrow before reading pairId.
  const pairId = written.value.status === 'written' ? written.value.pairId : null

  // 3. Persist the resulting pair_id back onto the adjustment for traceability.
  if (pairId) {
    await db
      .update(schema.adminAdjustments)
      .set({ ledgerPairId: pairId })
      .where(eq(schema.adminAdjustments.id, adjustmentId))
  }

  // 4. Audit (the ledger write itself is forensic; the audit_log entry tells
  //    "who clicked what button when").
  await audit.writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: session.admin.id,
    actorRole: session.payload.role,
    action: 'player.adjust_balance',
    resourceKind: 'player',
    resourceId: id,
    after: {
      adjustment_id: adjustmentId,
      pair_id: pairId,
      currency: parsed.currency,
      sub_bucket: parsed.subBucket,
      direction: parsed.direction,
      amount_minor: parsed.amountMinor.toString(),
    },
    reason: parsed.reason,
    ip,
    userAgent,
  })

  await flushAfterCommit()
  return NextResponse.json({ ok: true, adjustmentId, pairId })
}
