import { and, eq } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'
import type { CoinCurrency, Currency } from '@coinfrenzy/config'

import type { Context } from '../context'
import { err, ok, type Result } from '../errors/result'

import type { LedgerError } from './errors'
import { getRedis } from './redis'
import type { SubBucket } from './types'

// docs/04 §6 — the fast path. Reads hit Redis first; misses fall through
// to Postgres and back-populate Redis with a 10-minute TTL. Cache
// invalidation is fired by ledger.write() via afterCommit on success.

const CACHE_TTL_SECONDS = 600 // 10 minutes per docs/04 §6.1

export interface WalletSnapshot {
  playerId: string
  currency: CoinCurrency
  currentBalance: bigint
  balancePurchased: bigint
  balanceEarned: bigint
  balancePromo: bigint
  balanceBonus: bigint
  playthroughRequired: bigint
  playthroughProgress: bigint
  updatedAt: string
}

export interface SubBucketBreakdown {
  currency: CoinCurrency
  purchased: bigint
  earned: bigint
  promo: bigint
  bonus: bigint
  total: bigint
}

function cacheKey(playerId: string, currency: Currency): string {
  return `wallet:${playerId}:${currency}`
}

function snapshotToCacheString(snapshot: WalletSnapshot): string {
  // We deliberately serialize bigints as strings so JSON.parse won't lose
  // precision. Convert back in parseSnapshot.
  return JSON.stringify({
    ...snapshot,
    currentBalance: snapshot.currentBalance.toString(),
    balancePurchased: snapshot.balancePurchased.toString(),
    balanceEarned: snapshot.balanceEarned.toString(),
    balancePromo: snapshot.balancePromo.toString(),
    balanceBonus: snapshot.balanceBonus.toString(),
    playthroughRequired: snapshot.playthroughRequired.toString(),
    playthroughProgress: snapshot.playthroughProgress.toString(),
  })
}

function parseSnapshot(raw: string): WalletSnapshot {
  const obj = JSON.parse(raw) as Record<string, unknown>
  return {
    playerId: String(obj.playerId),
    currency: obj.currency as CoinCurrency,
    currentBalance: BigInt(String(obj.currentBalance)),
    balancePurchased: BigInt(String(obj.balancePurchased)),
    balanceEarned: BigInt(String(obj.balanceEarned)),
    balancePromo: BigInt(String(obj.balancePromo)),
    balanceBonus: BigInt(String(obj.balanceBonus)),
    playthroughRequired: BigInt(String(obj.playthroughRequired)),
    playthroughProgress: BigInt(String(obj.playthroughProgress)),
    updatedAt: String(obj.updatedAt),
  }
}

/**
 * docs/04 §6.1 — wallet balance read. 1 Redis hit (10ms target) or one
 * indexed Postgres lookup (~20ms target). Result.err only when the wallet
 * doesn't exist at all (which is a programming bug at this layer; player
 * onboarding creates both wallets).
 */
export async function getBalance(
  ctx: Context,
  playerId: string,
  currency: CoinCurrency,
): Promise<Result<WalletSnapshot, LedgerError>> {
  const redis = getRedis()
  const key = cacheKey(playerId, currency)

  const cached = await redis.get(key)
  if (cached) {
    try {
      return ok(parseSnapshot(cached))
    } catch (e) {
      // Corrupt cache entry — fall through to Postgres and let the next
      // write repopulate cleanly.
      ctx.logger.warn('wallet cache parse failed; falling through to DB', {
        playerId,
        currency,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  const rows = await ctx.db
    .select()
    .from(schema.wallets)
    .where(and(eq(schema.wallets.playerId, playerId), eq(schema.wallets.currency, currency)))
    .limit(1)

  if (rows.length === 0) {
    return err({ code: 'wallet_not_found', playerId, currency })
  }
  const row = rows[0]!
  const snapshot: WalletSnapshot = {
    playerId: row.playerId,
    currency,
    currentBalance: row.currentBalance,
    balancePurchased: row.balancePurchased,
    balanceEarned: row.balanceEarned,
    balancePromo: row.balancePromo,
    balanceBonus: row.balanceBonus,
    playthroughRequired: row.playthroughRequired,
    playthroughProgress: row.playthroughProgress,
    updatedAt: row.updatedAt.toISOString(),
  }
  await redis.setex(key, CACHE_TTL_SECONDS, snapshotToCacheString(snapshot))
  return ok(snapshot)
}

/** docs/04 §6 — the four-sub-bucket split for the player UI/admin tools. */
export async function getSubBucketBreakdown(
  ctx: Context,
  playerId: string,
  currency: CoinCurrency,
): Promise<Result<SubBucketBreakdown, LedgerError>> {
  const balance = await getBalance(ctx, playerId, currency)
  if (!balance.ok) return balance
  const w = balance.value
  return ok({
    currency,
    purchased: w.balancePurchased,
    earned: w.balanceEarned,
    promo: w.balancePromo,
    bonus: w.balanceBonus,
    total: w.currentBalance,
  })
}

/**
 * docs/04 §3.6 — redeemable balance is `earned + purchased`, NOT bonus or
 * promo. This is what the redemption flow checks before allowing a request.
 */
export async function getRedeemableBalance(
  ctx: Context,
  playerId: string,
): Promise<
  Result<{ amount: bigint; breakdown: { earned: bigint; purchased: bigint } }, LedgerError>
> {
  const breakdown = await getSubBucketBreakdown(ctx, playerId, 'SC')
  if (!breakdown.ok) return breakdown
  return ok({
    amount: breakdown.value.earned + breakdown.value.purchased,
    breakdown: {
      earned: breakdown.value.earned,
      purchased: breakdown.value.purchased,
    },
  })
}

/** Used by ledger.write() afterCommit. Errors are swallowed by the queue. */
export async function invalidateBalanceCache(
  playerId: string,
  ...currencies: CoinCurrency[]
): Promise<void> {
  const redis = getRedis()
  const keys =
    currencies.length === 0
      ? [cacheKey(playerId, 'GC'), cacheKey(playerId, 'SC')]
      : currencies.map((c) => cacheKey(playerId, c))
  await redis.del(...keys)
}

/** Tests: introspect which sub_bucket columns are present on `wallets`. */
export function subBucketsList(): SubBucket[] {
  return ['purchased', 'earned', 'promo', 'bonus']
}
