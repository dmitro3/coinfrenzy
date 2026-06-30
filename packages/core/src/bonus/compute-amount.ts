import { eq } from 'drizzle-orm'

import * as schema from '@coinfrenzy/db/schema'

import type { Context } from '../context'

import type { AwardContext, AwardFormula } from './types'

// docs/06 §5 — award amount computation. Static `award_gc` / `award_sc`
// override formula; otherwise the JSONB `award_formula` drives.

export interface BonusForCompute {
  awardGc: bigint
  awardSc: bigint
  awardFormula: unknown
}

export interface ComputeResult {
  gc: bigint
  sc: bigint
}

export async function computeAwardAmounts(
  ctx: Context,
  bonus: BonusForCompute,
  playerId: string,
  context?: AwardContext,
): Promise<ComputeResult> {
  // Static amounts win — explicit > formula. A template with both 0 amounts
  // and no formula returns zero (the engine rejects with AMOUNT_ZERO).
  if (bonus.awardGc > 0n || bonus.awardSc > 0n) {
    return { gc: bonus.awardGc, sc: bonus.awardSc }
  }
  const formula = bonus.awardFormula as AwardFormula | null | undefined
  if (!formula || typeof formula !== 'object') {
    return { gc: 0n, sc: 0n }
  }

  switch (formula.type) {
    case 'pct_of_purchase': {
      const purchase = context?.purchaseAmount ?? 0n
      if (purchase <= 0n) return { gc: 0n, sc: 0n }
      const out = scaleByPct(purchase, formula.pct)
      return formula.currency === 'GC' ? { gc: out, sc: 0n } : { gc: 0n, sc: out }
    }
    case 'tier_match': {
      const level = await lookupTierLevel(ctx, playerId)
      const row = formula.tier_table[String(level)] ?? formula.tier_table['1']
      if (!row) return { gc: 0n, sc: 0n }
      return { gc: toBigint(row.gc), sc: toBigint(row.sc) }
    }
    case 'tier_pct_of_purchase': {
      const purchase = context?.purchaseAmount ?? 0n
      if (purchase <= 0n) return { gc: 0n, sc: 0n }
      const level = await lookupTierLevel(ctx, playerId)
      const pct = formula.pct_by_tier[String(level)] ?? formula.default_pct ?? 0
      const out = scaleByPct(purchase, pct)
      return formula.currency === 'GC' ? { gc: out, sc: 0n } : { gc: 0n, sc: out }
    }
    case 'fixed_with_streak_multiplier': {
      const base = toBigint(formula.base_sc)
      const streak = Math.max(1, context?.streak ?? 1)
      const multiplier = BigInt(Math.min(streak, formula.max_streak))
      return { gc: 0n, sc: base * multiplier }
    }
    default:
      // Unknown formula type — return zero so the engine rejects with a
      // typed error rather than awarding random amounts.
      return { gc: 0n, sc: 0n }
  }
}

async function lookupTierLevel(ctx: Context, playerId: string): Promise<number> {
  const rows = await ctx.db
    .select({ level: schema.tierProgress.currentTierLevel })
    .from(schema.tierProgress)
    .where(eq(schema.tierProgress.playerId, playerId))
    .limit(1)
  return rows[0]?.level ?? 1
}

/**
 * Multiply a money-minor-unit amount by a decimal percent (0.20 = 20%).
 * We scale through bigint to keep things deterministic — `Number(amount)`
 * would lose precision above 2^53.
 */
function scaleByPct(amount: bigint, pct: number): bigint {
  if (!Number.isFinite(pct) || pct <= 0) return 0n
  // 4 decimals of precision on pct.
  const scaled = BigInt(Math.floor(pct * 10_000))
  return (amount * scaled) / 10_000n
}

function toBigint(value: string | number | undefined): bigint {
  if (value === undefined || value === null) return 0n
  if (typeof value === 'bigint') return value
  if (typeof value === 'number') return BigInt(Math.floor(value))
  return BigInt(value)
}
