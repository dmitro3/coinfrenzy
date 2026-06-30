// docs/07 — redemption module barrel.
//
// Public surface for the player API, admin API, and worker jobs. All
// internal cross-imports go through file-level paths; consumers only see
// these names.

export {
  checkRedemptionEligibility,
  computeRequiredKycLevel,
  isKycSoftDeny,
  isWithinAutoApproveThreshold,
  type EligibilitySpec,
  type KycLevelInput,
} from './eligibility'

export {
  createRedemption,
  determineNextStatus,
  loadRedemption,
  rowToRecord,
  type CreateRedemptionSpec,
} from './create'

export { approveRedemption, type ApproveSpec } from './approve'
export { rejectRedemption, type RejectSpec } from './reject'
export { actOnAmlHold, type AmlAction, type AmlActionSpec } from './aml-action'
export { submitRedemptionToFinix, type SubmitSpec } from './submit-to-finix'
export { processPendingRedemptionsAwaitingKyc, type ProgressResult } from './progress-kyc-pending'
export { generateAnnualTaxRollup, type TaxRollupResult } from './tax-rollup'

export {
  AUTO_APPROVE_THRESHOLD_USD,
  EDD_REQUIRED_USD,
  EDD_CUMULATIVE_DEPOSIT_USD,
  MAX_DAILY_REDEMPTION_SC,
  MAX_REDEMPTION_SC,
  MAX_WEEKLY_REDEMPTION_SC,
  MIN_REDEMPTION_SC,
  SC_TO_USD_RATE,
  TAX_REPORT_THRESHOLD_USD,
} from './constants'

export type {
  AmlActionError,
  ApprovalError,
  EligibilityAllow,
  EligibilityDeny,
  EligibilityDenyCode,
  EligibilityResult,
  PersistedDrainStep,
  RedemptionError,
  RedemptionMethod,
  RedemptionRecord,
  RedemptionStatus,
  RejectError,
  SubmitError,
} from './types'
