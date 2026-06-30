// docs/05 §4 + docs/07 §6 — Footprint adapter surface.

export interface FootprintCreateOnboardingInput {
  playerId: string
  email: string
  /**
   * Optional pre-fill bag. Real Footprint accepts a `vault` of pre-loaded
   * fields keyed by their schema; we pass only what we know up front.
   */
  prefill?: {
    first_name?: string
    last_name?: string
    dob?: string
    phone_number?: string
    address_line1?: string
    address_line2?: string
    city?: string
    state?: string
    zip?: string
    country?: string
  }
  returnUrl?: string
}

export interface FootprintCreateOnboardingResult {
  /** Footprint user id — stored on kyc_status.footprint_user_id. */
  footprintUserId: string
  /** Token consumed by the embeddable SDK. */
  validationToken: string
  /** Hosted-flow URL the player visits in a popover. */
  url: string
}

export type FootprintUserStatus = 'pass' | 'fail' | 'none' | 'pending'

export interface FootprintGetUserResult {
  footprintUserId: string
  status: FootprintUserStatus
  manualReviewStatus: 'pending' | 'approved' | 'denied' | null
  raw?: unknown
}

export interface FootprintClient {
  createOnboardingSession(
    input: FootprintCreateOnboardingInput,
  ): Promise<FootprintCreateOnboardingResult>
  getUser(footprintUserId: string): Promise<FootprintGetUserResult>
  readonly mode: 'mock' | 'real'
}
