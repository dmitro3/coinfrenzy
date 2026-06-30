'use client'

import * as React from 'react'

import type { AuthModalState, AuthModalContextValue } from '../types/auth-modal.types'

const AuthModalContext = React.createContext<AuthModalContextValue | null>(null)

export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AuthModalState>('closed')
  const [otpEmail, setOtpEmail] = React.useState<string | null>(null)
  const [resetToken, setResetToken] = React.useState<string | null>(null)
  const [resetEmail, setResetEmail] = React.useState<string | null>(null)
  const [resetOtpExpiresAt, setResetOtpExpiresAt] = React.useState<number | null>(null)

  const openLogin = React.useCallback(() => {
    setResetToken(null)
    setResetEmail(null)
    setResetOtpExpiresAt(null)
    setState('login')
  }, [])
  const openSignup = React.useCallback(() => setState('signup'), [])
  const openForgotPassword = React.useCallback(() => {
    setResetToken(null)
    setResetEmail(null)
    setResetOtpExpiresAt(null)
    setState('forgot-password')
  }, [])
  const openResetPassword = React.useCallback((token: string) => {
    setResetToken(token)
    setResetEmail(null)
    setResetOtpExpiresAt(null)
    setState('reset-password')
  }, [])
  const goToResetPassword = React.useCallback((email: string, otpExpiresAt?: number) => {
    setResetToken(null)
    setResetEmail(email.trim().toLowerCase())
    setResetOtpExpiresAt(otpExpiresAt ?? null)
    setState('reset-password')
  }, [])

  const close = React.useCallback(() => {
    setState('closed')
    setOtpEmail(null)
    setResetToken(null)
    setResetEmail(null)
    setResetOtpExpiresAt(null)
  }, [])

  const goToOtp = React.useCallback((email: string) => {
    setOtpEmail(email)
    setState('otp')
  }, [])

  const goToUsername = React.useCallback(() => setState('username'), [])

  const value = React.useMemo<AuthModalContextValue>(
    () => ({
      state,
      otpEmail,
      resetToken,
      resetEmail,
      resetOtpExpiresAt,
      openLogin,
      openSignup,
      openForgotPassword,
      openResetPassword,
      goToResetPassword,
      close,
      goToOtp,
      goToUsername,
    }),
    [
      state,
      otpEmail,
      resetToken,
      resetEmail,
      resetOtpExpiresAt,
      openLogin,
      openSignup,
      openForgotPassword,
      openResetPassword,
      goToResetPassword,
      close,
      goToOtp,
      goToUsername,
    ],
  )

  return <AuthModalContext.Provider value={value}>{children}</AuthModalContext.Provider>
}

export function useAuthModal(): AuthModalContextValue {
  const ctx = React.useContext(AuthModalContext)
  if (!ctx) {
    // Outside provider — degrade gracefully (e.g. marketing surfaces)
    return {
      state: 'closed',
      otpEmail: null,
      resetToken: null,
      resetEmail: null,
      resetOtpExpiresAt: null,
      openLogin: () => {
        if (typeof window !== 'undefined') window.location.href = '/login'
      },
      openSignup: () => {
        if (typeof window !== 'undefined') window.location.href = '/signup'
      },
      openForgotPassword: () => {
        if (typeof window !== 'undefined') window.location.href = '/reset-password'
      },
      openResetPassword: () => undefined,
      goToResetPassword: () => undefined,
      close: () => undefined,
      goToOtp: () => undefined,
      goToUsername: () => undefined,
    }
  }
  return ctx
}
