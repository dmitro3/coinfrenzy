'use client'

import { createAuthClient } from 'better-auth/react'
import { magicLinkClient, twoFactorClient } from 'better-auth/client/plugins'

// Browser-side Better Auth client. Used by signup/login/MFA pages.
// docs/09 §5.1.

export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : undefined,
  plugins: [magicLinkClient(), twoFactorClient()],
})

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  requestPasswordReset,
  resetPassword,
  sendVerificationEmail,
  verifyEmail,
  twoFactor,
} = authClient
