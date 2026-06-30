import { and, eq, inArray, sql } from 'drizzle-orm'

import { isCoinCurrency } from '@coinfrenzy/config'
import { schema } from '@coinfrenzy/db'

import type { Context } from '../../../context'
import { writeAuditEntry } from '../../../audit/index'
import { write as ledgerWrite } from '../../../ledger/index'
import type { EntrySpec } from '../../../ledger/index'
import { publishEvent } from '../../../realtime/index'

function normalizeSubBucket(value: string | null): EntrySpec['subBucket'] {
  if (value === 'purchased' || value === 'bonus' || value === 'promo' || value === 'earned') {
    return value
  }
  return null
}

interface AleaRoundRefundPayload {
  type: 'round.refund'
  callbackType?: string
  eventId?: string
  rollbackTxId?: string
  originalTxId?: string
  roundId?: string
  casinoSessionId?: string
  playerId?: string
  gameId?: string
  amount?: number
  currency?: string
}

interface RoundRefundResult {
  status: 'success' | 'already_processed' | 'not_found'
}

export async function handleAleaRoundRefund(
  ctx: Context,
  payload: AleaRoundRefundPayload,
): Promise<RoundRefundResult> {
  const { rollbackTxId } = payload
  let { roundId } = payload

  // Check if this specific rollback transaction was already processed
  if (rollbackTxId) {
    const existingRollback = await ctx.db
      .select()
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.action, 'webhook.alea.round_rollback'),
          sql`metadata->>'rollback_tx_id' = ${rollbackTxId}`,
        ),
      )
      .limit(1)

    if (existingRollback.length > 0) {
      ctx.logger.info('alea_round_refund_already_processed', { roundId, rollbackTxId })
      return { status: 'already_processed' }
    }
  }

  if (!roundId && payload.originalTxId) {
    const txAuditRows = await ctx.db
      .select({ metadata: schema.auditLog.metadata })
      .from(schema.auditLog)
      .where(
        and(
          inArray(schema.auditLog.action, ['webhook.alea.round_bet', 'webhook.alea.round_win']),
          sql`metadata->>'tx_id' = ${payload.originalTxId}`,
        ),
      )
      .limit(1)

    const metadata = txAuditRows[0]?.metadata
    const resolvedRoundId =
      metadata && typeof metadata === 'object'
        ? (metadata as Record<string, unknown>).round_id
        : null

    if (typeof resolvedRoundId === 'string' && resolvedRoundId.length > 0) {
      roundId = resolvedRoundId
      ctx.logger.info('alea_round_refund_resolved_round_id_from_audit', {
        rollbackTxId,
        originalTxId: payload.originalTxId,
        roundId,
      })
    } else {
      const ledgerRows = await ctx.db
        .select({ metadata: schema.ledgerEntries.metadata })
        .from(schema.ledgerEntries)
        .where(
          and(
            inArray(schema.ledgerEntries.source, ['bet', 'win']),
            sql`metadata->>'tx_id' = ${payload.originalTxId}`,
            sql`created_at >= now() - interval '3 days'`,
          ),
        )
        .limit(1)

      const ledgerMetadata = ledgerRows[0]?.metadata
      const ledgerRoundId =
        ledgerMetadata && typeof ledgerMetadata === 'object'
          ? (ledgerMetadata as Record<string, unknown>).round_id
          : null

      if (typeof ledgerRoundId === 'string' && ledgerRoundId.length > 0) {
        roundId = ledgerRoundId
        ctx.logger.info('alea_round_refund_resolved_round_id_from_ledger', {
          rollbackTxId,
          originalTxId: payload.originalTxId,
          roundId,
        })
      }
    }
  }

  if (!roundId) {
    ctx.logger.info('alea_round_refund_missing_round_id', {
      rollbackTxId,
      originalTxId: payload.originalTxId,
    })
    await writeAuditEntry(ctx.db, {
      actorKind: 'system',
      action: 'webhook.alea.round_rollback',
      metadata: {
        round_id: null,
        session_id: payload.casinoSessionId ?? null,
        player_id: payload.playerId ?? null,
        callback_type: payload.callbackType ?? payload.type,
        rollback_tx_id: payload.rollbackTxId ?? null,
        original_tx_id: payload.originalTxId ?? null,
        result: 'not_found',
      },
    })
    // Write a pending rollback marker using the tx_id so late BET/WIN can detect it
    if (payload.originalTxId) {
      await ctx.db.insert(schema.auditLog).values({
        actorKind: 'system',
        action: 'webhook.alea.pending_rollback',
        metadata: {
          original_tx_id: payload.originalTxId,
          rollback_tx_id: rollbackTxId,
        },
      })
    }
    return { status: 'not_found' }
  }

  const roundRows = await ctx.db
    .select({
      id: schema.gameRounds.id,
      playerId: schema.gameRounds.playerId,
      status: schema.gameRounds.status,
      currency: schema.gameRounds.currency,
    })
    .from(schema.gameRounds)
    .where(
      and(
        eq(schema.gameRounds.externalRoundId, roundId),
        sql`created_at >= now() - interval '3 days'`,
      ),
    )
    .limit(1)
  const round = roundRows[0]

  if (!round) {
    ctx.logger.info('alea_round_refund_unknown_round', { roundId })
    return { status: 'not_found' }
  }

  // Per Alea docs: rollbacks should be permitted even if round.status is COMPLETED
  // Only use the audit log idempotency check to prevent duplicate rollback processing

  if (!isCoinCurrency(round.currency)) {
    ctx.logger.error('alea_round_refund_bad_currency', { roundId, currency: round.currency })
    // This is a data integrity issue - treat as if original transaction wasn't found
    return { status: 'not_found' }
  }

  const existingEntries = await ctx.db
    .select({
      leg: schema.ledgerEntries.leg,
      accountKind: schema.ledgerEntries.accountKind,
      accountId: schema.ledgerEntries.accountId,
      amount: schema.ledgerEntries.amount,
      currency: schema.ledgerEntries.currency,
      subBucket: schema.ledgerEntries.subBucket,
      playerId: schema.ledgerEntries.playerId,
      metadata: schema.ledgerEntries.metadata,
    })
    .from(schema.ledgerEntries)
    .where(
      and(
        inArray(schema.ledgerEntries.source, ['bet', 'win']),
        eq(schema.ledgerEntries.sourceId, roundId),
        eq(schema.ledgerEntries.playerId, round.playerId),
        sql`created_at >= now() - interval '3 days'`,
      ),
    )

  if (existingEntries.length === 0) {
    ctx.logger.info('alea_round_refund_no_ledger_entries', { roundId, playerId: round.playerId })
    return { status: 'not_found' }
  }

  const reversedEntries: EntrySpec[] = existingEntries
    .filter((e) => isCoinCurrency(e.currency))
    .map((entry) => ({
      leg: entry.leg === 'debit' ? ('credit' as const) : ('debit' as const),
      accountKind: entry.accountKind,
      accountId: entry.accountId,
      amount: entry.amount,
      currency: entry.currency as 'GC' | 'SC',
      subBucket: normalizeSubBucket(entry.subBucket),
      playerId: entry.playerId,
      metadata: {
        ...(typeof entry.metadata === 'object' && entry.metadata !== null
          ? (entry.metadata as Record<string, unknown>)
          : {}),
        rollback_round_id: roundId,
      },
    }))

  if (reversedEntries.length === 0) {
    ctx.logger.info('alea_round_refund_no_coin_entries', { roundId, playerId: round.playerId })
    return { status: 'not_found' }
  }

  const result = await ledgerWrite(
    ctx,
    {
      source: 'admin_adjustment',
      sourceId: `alea_rollback:${roundId}`,
      playerId: round.playerId,
      entries: reversedEntries,
      metadata: {
        provider: 'alea',
        event_type: payload.callbackType ?? payload.type,
        round_id: roundId,
        casino_session_id: payload.casinoSessionId ?? null,
        external_game_id: payload.gameId ?? null,
      },
    },
    {
      dedupLookbackDays: 3,
    },
  )

  if (!result.ok) {
    ctx.logger.error('alea_round_refund_ledger_failed', {
      roundId,
      playerId: round.playerId,
      error: result.error,
    })
    throw new Error(`ledger_write_failed:${result.error.code}`)
  }

  // Move non-critical operations to background to meet 5-second response SLA
  ctx.afterCommit(async () => {
    try {
      await ctx.db
        .update(schema.gameRounds)
        .set({ status: 'refunded' })
        .where(eq(schema.gameRounds.id, round.id))

      await writeAuditEntry(ctx.db, {
        actorKind: 'system',
        action: 'webhook.alea.round_rollback',
        resourceKind: 'game_round',
        resourceId: round.id,
        metadata: {
          round_id: roundId,
          session_id: payload.casinoSessionId ?? null,
          player_id: round.playerId,
          callback_type: payload.callbackType ?? payload.type,
          rollback_tx_id: payload.rollbackTxId ?? null,
          original_tx_id: payload.originalTxId ?? null,
        },
      })

      await publishEvent(`private-player-${round.playerId}`, 'balance-update', {
        reason: 'rollback',
      })
    } catch (error) {
      ctx.logger.error('alea_round_refund_background_operations_failed', {
        roundId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })

  return { status: 'success' }
}
