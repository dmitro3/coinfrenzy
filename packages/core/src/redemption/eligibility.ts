import { and, eq, gt, isNull, sql } from 'drizzle-orm'

import { isBlockedState } from '@coinfrenzy/config'
import * as schema from '@coinfrenzy/db/schema'

import type { Context } from '../context'
import { numericStringToBigint } from '../ledger/money'

import {
  AUTO_APPROVE_THRESHOLD_USD,
  EDD_CUMULATIVE_DEPOSIT_USD,
  EDD_REQUIRED_USD,
  MAX_DAILY_REDEMPTION_SC,
  MAX_REDEMPTION_SC,
  MAX_WEEKLY_REDEMPTION_SC,
  MIN_REDEMPTION_SC,
  SC_TO_USD_RATE,
} from './constants'
import type {
  EligibilityAllow,
  EligibilityDeny,
  EligibilityDenyCode,
  EligibilityResult,
  RedemptionMethod,
} from './types'

// docs/07 §4 — eligibility checker. Pure read path; never writes.
//
// The checker returns an Allow with `requiresKyc=true` when the only thing
// missing is a KYC bump. The route layer still records the redemption in
// `kyc_pending` so the player can come back to it after Footprint completes
// (docs/07 §6.5). All other denies are hard-stops.

export interface EligibilitySpec {
  playerId: string
  amountSc: bigint
  method: RedemptionMethod
  paymentInstrumentId?: string | null
  /** Optional Radar geocode for the request IP — caller plumbs in. */
  ipState?: string | null
  isProxy?: boolean
}

export async function checkRedemptionEligibility(
  ctx: Context,
  spec: EligibilitySpec,
): Promise<EligibilityResult> {
  const playerRows = await ctx.db
    .select({
      id: schema.players.id,
      status: schema.players.status,
      state: schema.players.state,
      kycLevel: schema.players.kycLevel,
      isInternalAccount: schema.players.isInternalAccount,
      deletedAt: schema.players.deletedAt,
      rgSelfExcludedUntil: schema.players.rgSelfExcludedUntil,
    })
    .from(schema.players)
    .where(eq(schema.players.id, spec.playerId))
    .limit(1)
  const player = playerRows[0]
  if (!player) return deny('PLAYER_NOT_FOUND')
  if (player.deletedAt) return deny('ACCOUNT_DELETED')
  if (player.status === 'closed') return deny('ACCOUNT_CLOSED')
  if (player.status === 'self_excluded') return deny('SELF_EXCLUDED')
  if (player.rgSelfExcludedUntil && player.rgSelfExcludedUntil > new Date()) {
    return deny('SELF_EXCLUDED')
  }
  if (player.status === 'suspended') return deny('ACCOUNT_SUSPENDED')
  if (player.isInternalAccount) return deny('INTERNAL_ACCOUNT_NOT_REDEEMABLE')

  // ──────────────────────────────────────────────────────────────────────
  // Jurisdiction: registered + IP-resolved state must both be unblocked.
  // ──────────────────────────────────────────────────────────────────────
  if (player.state && isBlockedState(player.state)) {
    return deny('REGISTERED_STATE_BLOCKED', { state: player.state })
  }
  if (spec.ipState && isBlockedState(spec.ipState)) {
    return deny('CURRENT_LOCATION_BLOCKED', { state: spec.ipState })
  }
  if (spec.isProxy === true) return deny('VPN_DETECTED')

  // ──────────────────────────────────────────────────────────────────────
  // Method support.
  // ──────────────────────────────────────────────────────────────────────
  if (spec.method !== 'finix_ach' && spec.method !== 'apt_debit') {
    return deny('METHOD_NOT_SUPPORTED', { method: spec.method })
  }

  // ──────────────────────────────────────────────────────────────────────
  // KYC level. Computed from the requested amount + cumulative deposits;
  // when the player is short, we report a "soft deny" so the route layer
  // can park the redemption in `kyc_pending`.
  // ──────────────────────────────────────────────────────────────────────
  const cumulativeDepositUsd = await sumCompletedPurchasesUsd(ctx, spec.playerId)
  const amountUsd = (spec.amountSc * SC_TO_USD_RATE) / 1n
  const requiredKycLevel = computeRequiredKycLevel({
    cumulativeDepositUsd,
    amountUsd,
  })
  const kycShort = player.kycLevel < requiredKycLevel
  if (kycShort && requiredKycLevel > 2) {
    // EDD (level 3) is hard-stopped here — players cannot self-serve EDD;
    // they must contact compliance per docs/07 §4.1. Soft path is only
    // for the level-2 Footprint completion case.
    return deny('KYC_LEVEL_INSUFFICIENT', {
      required: requiredKycLevel,
      current: player.kycLevel,
    })
  }

  // ──────────────────────────────────────────────────────────────────────
  // Active blocking compliance flags.
  // ──────────────────────────────────────────────────────────────────────
  const blocking = await ctx.db
    .select({ flagType: schema.complianceFlags.flagType })
    .from(schema.complianceFlags)
    .where(
      and(
        eq(schema.complianceFlags.playerId, spec.playerId),
        eq(schema.complianceFlags.severity, 'block'),
        isNull(schema.complianceFlags.clearedAt),
      ),
    )
  if (blocking.length > 0) {
    return deny('COMPLIANCE_FLAG_ACTIVE', {
      flagTypes: blocking.map((row) => row.flagType),
    })
  }

  // ──────────────────────────────────────────────────────────────────────
  // Balance composition (docs/06 §14): only purchased + earned redeem.
  // ──────────────────────────────────────────────────────────────────────
  const walletRows = await ctx.db
    .select({
      balancePurchased: schema.wallets.balancePurchased,
      balanceEarned: schema.wallets.balanceEarned,
    })
    .from(schema.wallets)
    .where(and(eq(schema.wallets.playerId, spec.playerId), eq(schema.wallets.currency, 'SC')))
    .limit(1)
  const wallet = walletRows[0]
  if (!wallet) {
    return deny('INSUFFICIENT_REDEEMABLE_BALANCE', { available: '0' })
  }
  const redeemable = wallet.balancePurchased + wallet.balanceEarned
  if (redeemable < spec.amountSc) {
    return deny('INSUFFICIENT_REDEEMABLE_BALANCE', { available: redeemable.toString() })
  }

  // ──────────────────────────────────────────────────────────────────────
  // Per-request range.
  // ──────────────────────────────────────────────────────────────────────
  if (spec.amountSc < MIN_REDEMPTION_SC) {
    return deny('AMOUNT_BELOW_MINIMUM', { min: MIN_REDEMPTION_SC.toString() })
  }
  if (spec.amountSc > MAX_REDEMPTION_SC) {
    return deny('AMOUNT_ABOVE_MAXIMUM', { max: MAX_REDEMPTION_SC.toString() })
  }

  // ──────────────────────────────────────────────────────────────────────
  // Rolling caps (docs/07 §4): exclude rejected/failed/cancelled.
  // ──────────────────────────────────────────────────────────────────────
  const last24h = await sumRedemptionsSinceSc(ctx, spec.playerId, 24)
  if (last24h + spec.amountSc > MAX_DAILY_REDEMPTION_SC) {
    return deny('DAILY_LIMIT_EXCEEDED', {
      cap: MAX_DAILY_REDEMPTION_SC.toString(),
      used: last24h.toString(),
    })
  }
  const last7d = await sumRedemptionsSinceSc(ctx, spec.playerId, 24 * 7)
  if (last7d + spec.amountSc > MAX_WEEKLY_REDEMPTION_SC) {
    return deny('WEEKLY_LIMIT_EXCEEDED', {
      cap: MAX_WEEKLY_REDEMPTION_SC.toString(),
      used: last7d.toString(),
    })
  }

  // ──────────────────────────────────────────────────────────────────────
  // Payment instrument (docs/07 §4) — only checked for finix_ach for v1.
  // APT debit cards land in §9 once the operator wires them up.
  // ──────────────────────────────────────────────────────────────────────
  if (spec.method === 'finix_ach') {
    if (!spec.paymentInstrumentId) {
      return deny('PAYMENT_INSTRUMENT_NOT_FOUND')
    }
    const inst = await ctx.db
      .select({
        id: schema.paymentInstruments.id,
        type: schema.paymentInstruments.type,
        status: schema.paymentInstruments.status,
        disabledAt: schema.paymentInstruments.disabledAt,
        plaidValidationStatus: schema.paymentInstruments.plaidValidationStatus,
        finixPaymentInstrumentId: schema.paymentInstruments.finixPaymentInstrumentId,
      })
      .from(schema.paymentInstruments)
      .where(
        and(
          eq(schema.paymentInstruments.id, spec.paymentInstrumentId),
          eq(schema.paymentInstruments.playerId, spec.playerId),
          eq(schema.paymentInstruments.type, 'bank_account'),
        ),
      )
      .limit(1)
    const row = inst[0]
    if (!row) return deny('PAYMENT_INSTRUMENT_NOT_FOUND')
    if (row.disabledAt || row.status !== 'active') return deny('PAYMENT_INSTRUMENT_DISABLED')
    if (row.plaidValidationStatus && row.plaidValidationStatus !== 'valid') {
      return deny('BANK_ACCOUNT_NOT_VALIDATED')
    }
  }

  const allow: EligibilityAllow = {
    allowed: true,
    requiresKyc: kycShort,
    requiredKycLevel,
    redeemable,
  }
  return allow
}

export interface KycLevelInput {
  cumulativeDepositUsd: bigint
  amountUsd: bigint
}

/** docs/07 §4.1 — required level given the request + history. */
export function computeRequiredKycLevel(input: KycLevelInput): number {
  if (input.cumulativeDepositUsd > EDD_CUMULATIVE_DEPOSIT_USD) return 3
  if (input.amountUsd > EDD_REQUIRED_USD) return 3
  return 2
}

export function isKycSoftDeny(result: EligibilityResult): boolean {
  return result.allowed === true && result.requiresKyc === true
}

/** Auto-approval gate (docs/07 §5.1). Used by `determineNextStatus`. */
export function isWithinAutoApproveThreshold(amountUsd: bigint): boolean {
  return amountUsd <= AUTO_APPROVE_THRESHOLD_USD
}

// --- internal helpers -------------------------------------------------------

function deny(code: EligibilityDenyCode, detail?: Record<string, unknown>): EligibilityDeny {
  return { allowed: false, code, ...(detail ? { detail } : {}) }
}

async function sumRedemptionsSinceSc(
  ctx: Context,
  playerId: string,
  hours: number,
): Promise<bigint> {
  const rows = await ctx.db
    .select({
      total: sql<string>`coalesce(sum(${schema.redemptions.amountSc}), 0)`.as('total'),
    })
    .from(schema.redemptions)
    .where(
      and(
        eq(schema.redemptions.playerId, playerId),
        sql`${schema.redemptions.status} not in ('rejected', 'failed', 'cancelled')`,
        gt(schema.redemptions.createdAt, sql`now() - (${hours}::int * interval '1 hour')`),
      ),
    )
  const raw = rows[0]?.total ?? '0'
  return parseNumericBigint(raw)
}

async function sumCompletedPurchasesUsd(ctx: Context, playerId: string): Promise<bigint> {
  const rows = await ctx.db
    .select({
      total: sql<string>`coalesce(sum(${schema.purchases.amountUsd}), 0)`.as('total'),
    })
    .from(schema.purchases)
    .where(and(eq(schema.purchases.playerId, playerId), eq(schema.purchases.status, 'completed')))
  return parseNumericBigint(rows[0]?.total ?? '0')
}

function parseNumericBigint(raw: string | number | bigint): bigint {
  if (typeof raw === 'bigint') return raw
  const str = typeof raw === 'number' ? raw.toString() : raw
  if (!str.includes('.')) return BigInt(str) * 10_000n
  return numericStringToBigint(str)
}
