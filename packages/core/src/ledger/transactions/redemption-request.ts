import { computeRedemptionDrainPlan, type WalletBuckets } from '../drain-order'
import type { EntrySpec, TransactionSpec } from '../types'

// docs/04 §3.6 — redemption request. SC drains from player_wallet to
// pending_redemption (locked from spending until paid/rejected). Drain
// rule is FIFO across earned + purchased only — NOT bonus/promo (those
// can't be redeemed at all).

export interface RedemptionRequestSpecInput {
  /** redemptions.id — idempotency anchor. */
  redemptionId: string
  playerId: string
  amount: bigint
  buckets: WalletBuckets
  metadata?: Record<string, unknown>
}

export interface BuiltRedemptionRequest {
  spec: TransactionSpec
  drain: ReturnType<typeof computeRedemptionDrainPlan>
}

export function buildRedemptionRequest(input: RedemptionRequestSpecInput): BuiltRedemptionRequest {
  const drain = computeRedemptionDrainPlan(input.buckets, input.amount)

  const entries: EntrySpec[] = []
  for (const step of drain.steps) {
    entries.push({
      leg: 'debit',
      accountKind: 'player_wallet',
      amount: step.amount,
      currency: 'SC',
      playerId: input.playerId,
      subBucket: step.subBucket,
    })
  }
  entries.push({
    leg: 'credit',
    accountKind: 'pending_redemption',
    amount: drain.totalDrained,
    currency: 'SC',
    playerId: input.playerId,
  })

  const spec: TransactionSpec = {
    source: 'redemption_request',
    sourceId: input.redemptionId,
    playerId: input.playerId,
    entries,
    metadata: {
      redemption_id: input.redemptionId,
      // Preserve the original split so redemption_rejected can restore it.
      drain: drain.steps.map((s) => ({ bucket: s.subBucket, amount: s.amount.toString() })),
      ...(input.metadata ?? {}),
    },
  }
  return { spec, drain }
}
