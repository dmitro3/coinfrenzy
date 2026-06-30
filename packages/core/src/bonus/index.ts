// docs/06 — bonus engine. The award path + playthrough hot path + expiry
// + promo-code redemption + trigger helpers. All public callers should
// import from this barrel.

export { award } from './engine'
export { recordBet, releasePlaythrough, recordContributionAudit } from './playthrough'
export { expireBonuses, type ExpireBonusesResult } from './expire'
export { redeemPromoCode } from './redeem-promo'
export { awardBySlug, findBonusBySlug, BONUS_SLUGS } from './triggers'
export { claimPending } from './claim-pending'
export type {
  ClaimPendingError,
  ClaimPendingErrorCode,
  ClaimPendingResult,
  ClaimPendingInput,
} from './claim-pending'
export { listPendingBonuses, type PendingBonusRow } from './list-pending'

export { computeAwardAmounts, type BonusForCompute, type ComputeResult } from './compute-amount'
export { computeGameWeight, applyWeightToAmount, type GameForWeight } from './game-weight'

export type {
  AwardSpec,
  AwardError,
  AwardErrorCode,
  AwardResult,
  AwardContext,
  AwardFormula,
  BonusType,
  BonusAwardSourceKind,
  BetSpec,
  RecordBetResult,
  PctOfPurchaseFormula,
  TierMatchFormula,
  TierPctOfPurchaseFormula,
  FixedWithStreakMultiplierFormula,
} from './types'

export type {
  RedeemPromoSpec,
  RedeemPromoError,
  RedeemPromoResult,
  PromoContext,
} from './redeem-promo'
