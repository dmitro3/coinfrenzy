// docs/07 §6 — KYC integration surface. Footprint adapter + validation
// token exchange + onboarding session creation.

export { startKycOnboarding } from './start-onboarding'
export type {
  StartOnboardingSpec,
  StartOnboardingResult,
  StartOnboardingError,
} from './start-onboarding'

export { completeKycValidation } from './complete-validation'
export type { CompleteSpec, CompleteResult, CompleteError } from './complete-validation'
