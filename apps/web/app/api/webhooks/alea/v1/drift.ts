import { sql } from 'drizzle-orm'
import { ledger } from '@coinfrenzy/core'
import { buildWebhookContext } from '@/lib/webhook-context'

export async function getPlayerDrift(playerId: string, currency: string): Promise<number> {
  const redis = ledger.getRedis()
  const key = `alea:drift:${playerId}:${currency}`
  const val = await redis.get(key)
  return val ? Number(val) : 0
}

export async function updatePlayerDrift(
  playerId: string,
  currency: string,
  delta: number,
): Promise<void> {
  const redis = ledger.getRedis()
  const key = `alea:drift:${playerId}:${currency}`
  const current = await getPlayerDrift(playerId, currency)
  await redis.setex(key, 86400 * 30, String(current + delta))
}

export async function getHPBalance(playerId: string, currency: string): Promise<number> {
  const { ctx } = buildWebhookContext('alea')
  // We select current_balance as text so we get the full 10-decimal string from Postgres
  // without any potential JavaScript float truncation or formatting side-effects
  const rows = await ctx.db.execute(sql`
    SELECT current_balance::text as balance FROM wallets WHERE player_id = ${playerId} AND currency = ${currency}
  `)
  if (rows.length === 0) return 0
  const row = rows[0] as { balance: string }
  return Number(row.balance)
}

export async function applyDriftToWallet(
  playerId: string,
  currency: string,
  delta: number,
): Promise<void> {
  const { ctx } = buildWebhookContext('alea')
  await ctx.db.execute(sql`
    UPDATE wallets
    SET current_balance = current_balance + ${delta}::numeric(30, 10),
        balance_purchased = balance_purchased + ${delta}::numeric(30, 10)
    WHERE player_id = ${playerId} AND currency = ${currency}
  `)
}
