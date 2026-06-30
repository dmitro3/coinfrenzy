import { eq } from 'drizzle-orm'

import * as schema from '@coinfrenzy/db/schema'

import type { Context } from '../context'

// docs/06 §13 — login bookkeeping. We track last_login_at + streak on
// every fresh-day login so the daily bonus formula and CRM analytics
// have an accurate streak number, but we do NOT auto-award the daily
// bonus here. The player explicitly claims from the lightning-bolt
// Available Rewards popover instead (see
// `apps/web/app/api/player/bonus/claim-daily/route.ts`), which gives
// us the true 24h rolling cooldown that the live coinfrenzy.com
// product uses. The engine's COOLDOWN_ACTIVE error enforces the gate.

export interface RecordLoginInput {
  playerId: string
  now?: Date
}

export interface RecordLoginResult {
  /** True when we recorded a fresh login (and possibly awarded a bonus). */
  recorded: boolean
  /** Reserved for compatibility; always false now that the player
   *  explicitly claims the daily bonus from the popover. */
  dailyAwarded: boolean
  /** Streak length used for the formula. */
  streak: number
}

export async function recordPlayerLogin(
  ctx: Context,
  input: RecordLoginInput,
): Promise<RecordLoginResult> {
  const now = input.now ?? new Date()
  const today = ymd(now)

  const rows = await ctx.db
    .select({
      lastLoginAt: schema.players.lastLoginAt,
      metadata: schema.players.metadata,
    })
    .from(schema.players)
    .where(eq(schema.players.id, input.playerId))
    .limit(1)
  const row = rows[0]
  if (!row) return { recorded: false, dailyAwarded: false, streak: 0 }

  // Short-circuit when the player has already been seen today. This keeps
  // the hot path on every page render cheap.
  const lastDay = row.lastLoginAt ? ymd(row.lastLoginAt) : null
  if (lastDay === today) {
    return { recorded: false, dailyAwarded: false, streak: 1 }
  }

  // Update last_login_at + last_seen_at. Compute the streak: consecutive if
  // yesterday, otherwise reset.
  const meta = (row.metadata ?? {}) as Record<string, unknown>
  const yesterday = ymd(new Date(now.getTime() - 24 * 3_600_000))
  const priorStreak = typeof meta.daily_login_streak === 'number' ? meta.daily_login_streak : 0
  const streak = lastDay === yesterday ? priorStreak + 1 : 1

  await ctx.db
    .update(schema.players)
    .set({
      lastLoginAt: now,
      lastSeenAt: now,
      metadata: { ...meta, daily_login_streak: streak, daily_login_last_day: today },
      updatedAt: now,
    })
    .where(eq(schema.players.id, input.playerId))

  return { recorded: true, dailyAwarded: false, streak }
}

function ymd(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
