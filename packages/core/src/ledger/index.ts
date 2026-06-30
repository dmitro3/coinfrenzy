// docs/04 / .cursorrules: all coin movements go through ledger.write().
// This barrel is the only thing consumers import from the ledger module.

export { write } from './write'
export { writeWithRetry } from './write-with-retry'
export type { WriteWithRetryOptions } from './write-with-retry'

export {
  getBalance,
  getSubBucketBreakdown,
  getRedeemableBalance,
  invalidateBalanceCache,
  type WalletSnapshot,
  type SubBucketBreakdown,
} from './balance'

export { assertBalanced, perCurrencyImbalance } from './balanced'

export {
  computeDrainPlan,
  computeRedemptionDrainPlan,
  redeemableTotal,
  DRAIN_ORDER,
  type DrainPlan,
  type DrainStep,
  type WalletBuckets,
} from './drain-order'

export { getHouseAccountId, isHouseAccount, isPlayerScopedAccount } from './house-accounts'

export {
  reconcileWallets,
  reconcileWalletsFull,
  type ReconcileResult,
  type DriftRow,
} from './reconcile'

export { bigintToNumericString, numericStringToBigint, toBigintAmount, formatMoney } from './money'

export type {
  LedgerLeg,
  LedgerSource,
  LedgerAccountKind,
  SubBucket,
  EntrySpec,
  TransactionSpec,
  InsertedLedgerEntry,
  LedgerWriteResult,
} from './types'

export type { LedgerError } from './errors'

// Transaction builders — one named export per docs/04 §3 type.
export {
  buildPurchase,
  buildBet,
  buildWin,
  buildBonusAward,
  buildPlaythroughRelease,
  buildRedemptionRequest,
  buildRedemptionPaid,
  buildRedemptionRejected,
  buildPurchaseRefund,
  buildAdminAdjustment,
  buildAffiliatePayout,
} from './transactions/index'
