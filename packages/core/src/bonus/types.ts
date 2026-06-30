import type { CoinCurrency } from '@coinfrenzy/config'

// docs/06 §2 + §3 — the typed surface that every trigger location and the
// admin UI / promo-code path share.

export type BonusType =
  | 'welcome'
  | 'tier_up'
  | 'weekly_tier'
  | 'monthly_tier'
  | 'package'
  | 'daily'
  | 'jackpot'
  | 'referral'
  | 'affiliate'
  | 'promotion'
  | 'amoe'
  | 'admin_added_sc'
  | 'crm_promocode'
  | 'purchase_promocode'

/**
 * docs/06 §4 step 3 — every award is keyed on (source_kind, source_id) so
 * the same trigger event (a Finix transfer, a daily login, a promo code id)
 * cannot double-award even under webhook replay or worker retries.
 */
export type BonusAwardSourceKind =
  | 'signup'
  | 'purchase'
  | 'login'
  | 'tier_up'
  | 'weekly_cron'
  | 'monthly_cron'
  | 'round_win'
  | 'referral'
  | 'affiliate_payout'
  | 'promo_code'
  | 'easyscam'
  | 'admin_manual'
  | 'migration'
  | 'crm_flow'

/**
 * Context attached at award time. The engine reads these for formula-based
 * award amount computation (e.g. percent of purchase amount).
 */
export interface AwardContext {
  /** USD purchase amount, in money minor units. Required by `pct_of_purchase`. */
  purchaseAmount?: bigint
  /** A win amount that triggered a jackpot bonus. */
  winAmount?: bigint
  /** Streak length for streak-based formulas (e.g. daily login). */
  streak?: number
  /** Free-form extras the trigger wants to forward to audit/CRM. */
  extra?: Record<string, unknown>
}

export interface AwardSpec {
  playerId: string
  /** bonuses.id of the template to award. */
  bonusId: string
  /** (kind, id) becomes the idempotency anchor on `bonuses_awarded`. */
  sourceKind: BonusAwardSourceKind
  sourceId: string
  /** Promo-code-style overrides per docs/06 §12 step 7. */
  playthroughMultiplierOverride?: number
  playthroughWindowOverride?: number | null
  /** Force a specific bucket — promo-code awards land in 'promo'. */
  subBucketOverride?: 'bonus' | 'promo'
  /** Admin who triggered a manual award (sets audit_log.actor_kind='admin'). */
  adminId?: string | null
  /** Free-form reason persisted to bonuses_awarded.award_reason + audit_log. */
  reason?: string | null
  /** Extras for the amount computer + persisted in metadata. */
  context?: AwardContext
  /**
   * When true, the award is created in `pending` status and NO ledger
   * entry is written. The coins land in the player's wallet only after
   * they explicitly claim the bonus from the Available Rewards popover
   * (see `claimPending`). Used for admin-granted bonuses, affiliate
   * payouts, and any other path where the player should see the bonus
   * waiting in their inbox before accepting.
   */
  pendingClaim?: boolean
}

export type AwardErrorCode =
  | 'BONUS_NOT_FOUND'
  | 'BONUS_NOT_ACTIVE'
  | 'BONUS_OUTSIDE_VALIDITY'
  | 'PLAYER_NOT_FOUND'
  | 'PLAYER_NOT_ELIGIBLE'
  | 'SELF_EXCLUDED'
  | 'STATE_BLOCKED'
  | 'TIER_INSUFFICIENT'
  | 'MAX_AWARDS_REACHED'
  | 'COOLDOWN_ACTIVE'
  | 'NOT_STACKABLE_ACTIVE_EXISTS'
  | 'AMOUNT_ZERO'
  | 'INVALID_FORMULA'
  | 'LEDGER_FAILED'
  | 'DB_ERROR'

export interface AwardError {
  code: AwardErrorCode
  reason?: string
  retryAfterHours?: number
}

export type AwardResult =
  | { status: 'awarded'; awardId: string; pairId: string; gcAmount: bigint; scAmount: bigint }
  | { status: 'pending'; awardId: string; gcAmount: bigint; scAmount: bigint }
  | { status: 'duplicate'; awardId: string }

// ---------- Award formula JSONB shapes ----------

export type AwardFormula =
  | PctOfPurchaseFormula
  | TierMatchFormula
  | TierPctOfPurchaseFormula
  | FixedWithStreakMultiplierFormula

export interface PctOfPurchaseFormula {
  type: 'pct_of_purchase'
  /** Decimal percent — 0.20 = 20%. */
  pct: number
  currency?: CoinCurrency
}

export interface TierMatchFormula {
  type: 'tier_match'
  /** Map tier level (1..6) -> { gc, sc } in minor units. */
  tier_table: Record<string, { gc?: string | number; sc?: string | number }>
}

export interface TierPctOfPurchaseFormula {
  type: 'tier_pct_of_purchase'
  pct_by_tier: Record<string, number>
  default_pct?: number
  currency?: CoinCurrency
}

export interface FixedWithStreakMultiplierFormula {
  type: 'fixed_with_streak_multiplier'
  base_sc: string | number
  max_streak: number
}

// ---------- Per-bet contribution ----------

export interface BetSpec {
  playerId: string
  /** SC bets contribute, GC bets do not. */
  currency: CoinCurrency
  /** Bet amount in money minor units. */
  amount: bigint
  /** `games.id` (NOT the external Alea id). */
  gameId: string
  /** `game_rounds.id` — anchors the playthrough_contributions row. */
  roundId: string
  /** External round id (for audit cross-ref). */
  externalRoundId?: string
}

export interface RecordBetResult {
  /** Bonuses whose progress changed. */
  contributed: Array<{
    awardId: string
    contribution: bigint
    newProgress: bigint
    required: bigint
    completed: boolean
  }>
  /** Awards we skipped, with reason — surfaced for diagnostics. */
  skipped: Array<{
    awardId: string
    reason: 'min_bet' | 'max_bet_flagged' | 'zero_weight'
  }>
  /** Awards released as a result of this bet. */
  released: string[]
}
