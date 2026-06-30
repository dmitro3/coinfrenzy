// Auth modal state machine — all possible screens
export type AuthModalState =
  | 'closed'
  | 'login'
  | 'signup'
  | 'otp'
  | 'username'
  | 'forgot-password'
  | 'reset-password'

export interface AuthModalContextValue {
  state: AuthModalState
  /** Email carried forward from signup/login into the OTP panel */
  otpEmail: string | null
  /** Token from the reset-password email link (admin / Better Auth flow) */
  resetToken: string | null
  /** Email carried from forgot-password into the reset panel */
  resetEmail: string | null
  /** OTP expiry timestamp (ms) for the reset-password countdown */
  resetOtpExpiresAt: number | null
  openLogin: () => void
  openSignup: () => void
  openForgotPassword: () => void
  openResetPassword: (token: string) => void
  goToResetPassword: (email: string, otpExpiresAt?: number) => void
  close: () => void
  goToOtp: (email: string) => void
  goToUsername: () => void
}

// ─── API response shapes (exact from API documentation) ──────────────────────

export interface SignupApiResponse {
  data: {
    user: {
      email: string
      userId: number
    }
    success: boolean
    message: string
  }
  errors: unknown[]
}

export interface VerifyOtpApiResponse {
  data: {
    user: {
      userId: number
      username: string | null
      isEmailVerified: boolean
      email: string
      kycStatus: string
      affiliateCode: string | null
      signInCount: number
      firstName: string | null
      lastName: string | null
    }
    success: boolean
    message: string
  }
  errors: unknown[]
}

export interface ResendOtpApiResponse {
  data: {
    success: boolean
    message: string
  }
  errors: unknown[]
}

export interface CheckUsernameApiResponse {
  data: {
    success: boolean
    isUserNameExist: boolean
    message: string
  }
  errors: unknown[]
}

export interface SetUsernameApiResponse {
  data: {
    success: boolean
    message: string
  }
  errors: unknown[]
}

export interface ForgotPasswordApiResponse {
  data: {
    success: boolean
    message: string
    otpExpiresAt: string
  }
  errors: unknown[]
}

export interface ResetPasswordApiResponse {
  data: {
    success: boolean
    message: string
  }
  errors: unknown[]
}

export interface ResendResetOtpApiResponse {
  data: {
    success: boolean
    message: string
    otpExpiresAt: string
  }
  errors: unknown[]
}

export interface ProfileApiResponse {
  data: {
    success: boolean
    data: {
      userId: number
      username: string | null
      uniqueId: string
      profileImage: string | null
      firstName: string | null
      middleName: string | null
      lastName: string | null
      email: string
      isEmailVerified: boolean
      gender: string | null
      dateOfBirth: string | null
      kycStatus: string
      mfaType: string | null
      signInMethod: string
      isInternalUser: boolean
      subscriptionStatus: number
      isIncognitoMode: boolean
      isFrenzyCreatorAffiliate: boolean
    }
    message: string
  }
  errors: unknown[]
}

export interface ApiErrorResponse {
  message?: string
  errors?: unknown[]
}
