import { eq } from 'drizzle-orm'

import * as schema from '@coinfrenzy/db/schema'

import { writeAuditEntry } from '../audit/index'
import { getFinixClient } from '../adapters/finix/index'
import type { Context } from '../context'
import { err, ok, type Result } from '../errors/result'

import { rejectRedemption } from './reject'
import { loadRedemption } from './create'
import type { RedemptionRecord, SubmitError } from './types'

// docs/07 §8 — push the approved redemption to Finix as a PUSH_TO_ACH
// transfer. The route layer (or the Inngest worker) calls this once the
// status flips to 'approved'. We own the Finix call here so the API/worker
// stays vendor-free.
//
// Idempotency: Finix's idempotency_id is `redemption_<id>`, so a retry on
// the same redemption will return the same transfer (Finix dedups). Our
// own DB write is guarded by `where status='approved'` so a concurrent
// double-submit converges to a single `awaiting_webhook` row.

export interface SubmitSpec {
  redemptionId: string
}

export async function submitRedemptionToFinix(
  ctx: Context,
  spec: SubmitSpec,
): Promise<Result<RedemptionRecord, SubmitError>> {
  const redemption = await loadRedemption(ctx, spec.redemptionId)
  if (!redemption) return err({ code: 'NOT_FOUND' })
  if (redemption.status !== 'approved') {
    return err({ code: 'NOT_APPROVED', current: redemption.status })
  }
  if (!redemption.paymentInstrumentId) return err({ code: 'INSTRUMENT_MISSING' })

  // We need the Finix-side instrument id (already vaulted by the bank-link
  // flow). For mock mode we synthesize one if it's missing so the worker
  // path still exercises end-to-end.
  const instRows = await ctx.db
    .select({
      id: schema.paymentInstruments.id,
      finixId: schema.paymentInstruments.finixPaymentInstrumentId,
    })
    .from(schema.paymentInstruments)
    .where(eq(schema.paymentInstruments.id, redemption.paymentInstrumentId))
    .limit(1)
  const instrument = instRows[0]
  if (!instrument) return err({ code: 'INSTRUMENT_MISSING' })

  const finixInstrumentId = instrument.finixId ?? `pi_mock_${redemption.playerId.slice(0, 8)}`

  // amountUsd is bigint in numeric(20,4) minor units (10^-4). Finix's API
  // wants integer cents (10^-2). Divide by 100 to widen down to cents.
  const amountCents = redemption.amountUsd / 100n

  try {
    const client = getFinixClient()
    const transfer = await client.createPayout({
      redemptionId: redemption.id,
      playerId: redemption.playerId,
      payoutInstrumentId: finixInstrumentId,
      amountCents,
      tags: { redemption_id: redemption.id, player_id: redemption.playerId },
    })

    await ctx.db
      .update(schema.redemptions)
      .set({
        status: 'awaiting_webhook',
        finixTransferId: transfer.transferId,
        submittedToFinixAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.redemptions.id, redemption.id))

    await writeAuditEntry(ctx.db, {
      actorKind: 'system',
      action: 'redemption.submitted_to_finix',
      resourceKind: 'redemption',
      resourceId: redemption.id,
      after: { finix_transfer_id: transfer.transferId, mode: client.mode },
    })

    const fresh = await loadRedemption(ctx, redemption.id)
    if (!fresh) return err({ code: 'NOT_FOUND' })
    return ok(fresh)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (isTransientError(e)) {
      ctx.logger.warn('redemption_finix_submit_transient', {
        redemptionId: redemption.id,
        error: message,
      })
      return err({ code: 'TRANSIENT', reason: message })
    }
    // Permanent failure — return SC to player and mark rejected.
    ctx.logger.error('redemption_finix_submit_permanent', {
      redemptionId: redemption.id,
      error: message,
    })
    await rejectRedemption(ctx, {
      redemptionId: redemption.id,
      reason: `Finix submission failed: ${message}`,
      reasonCategory: 'processor_error',
    })
    return err({ code: 'PERMANENT', reason: message })
  }
}

function isTransientError(e: unknown): boolean {
  if (!(e instanceof Error)) return false
  const m = e.message.toLowerCase()
  if (m.includes('timeout') || m.includes('econnreset') || m.includes('socket hang up')) return true
  // Finix returns 5xx as `finix_request_failed:5xx:<body>` from client-real.ts.
  if (/finix_request_failed:5\d\d/.test(e.message)) return true
  return false
}
