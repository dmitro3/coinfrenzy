'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'

import { AuthModal, AuthTabs } from '@coinfrenzy/ui/player'

import { useAuthModal } from './context/AuthModalContext'
import { LoginPanel } from './panels/LoginPanel'
import { SignupPanel } from './panels/SignupPanel'
import { OtpPanel } from './panels/OtpPanel'
import { UsernamePanel } from './panels/UsernamePanel'
import { ForgotPasswordPanel } from './panels/ForgotPasswordPanel'
import { ResetPasswordPanel } from './panels/ResetPasswordPanel'

// Saved scroll position so iOS Safari scroll lock works correctly
let savedScrollY = 0

function useScrollLock(active: boolean) {
  React.useEffect(() => {
    if (!active) return
    savedScrollY = window.scrollY
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${savedScrollY}px`
    document.body.style.width = '100%'

    return () => {
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      window.scrollTo(0, savedScrollY)
    }
  }, [active])
}

function useFocusTrap(ref: React.RefObject<HTMLDivElement | null>, active: boolean) {
  React.useEffect(() => {
    if (!active || !ref.current) return

    const el = ref.current
    const focusableSelectors = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',')

    function getFocusable(): HTMLElement[] {
      return Array.from(el.querySelectorAll<HTMLElement>(focusableSelectors))
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      const focusable = getFocusable()
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    // Focus first focusable element
    const focusable = getFocusable()
    focusable[0]?.focus()

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [active, ref])
}

function ModalContent() {
  const { state, close, openLogin, openSignup } = useAuthModal()
  const containerRef = React.useRef<HTMLDivElement>(null)

  const isOpen = state !== 'closed'
  useScrollLock(isOpen)
  useFocusTrap(containerRef, isOpen)

  // Escape key to close
  React.useEffect(() => {
    if (!isOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, close])

  if (!isOpen) return null

  // Which panel + fox variant to show
  const showTabs = state === 'login' || state === 'signup'
  const foxVariant = state === 'otp' || state === 'username' ? 'coins-half' : 'auth-modal'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Authentication"
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={close}
      />

      {/* Modal container */}
      <div ref={containerRef} className="relative z-10 w-full max-w-[826px]">
        <AuthModal foxVariant={foxVariant} onClose={close}>
          {showTabs && (
            <AuthTabs
              active={state as 'login' | 'signup'}
              onLogin={openLogin}
              onSignup={openSignup}
            />
          )}
          {state === 'login' && <LoginPanel />}
          {state === 'signup' && <SignupPanel />}
          {state === 'otp' && <OtpPanel />}
          {state === 'username' && <UsernamePanel />}
          {state === 'forgot-password' && <ForgotPasswordPanel />}
          {state === 'reset-password' && <ResetPasswordPanel />}
        </AuthModal>
      </div>
    </div>
  )
}

export function AuthModalRoot() {
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return createPortal(<ModalContent />, document.body)
}

// ─── AuthOpenOnQueryParam ──────────────────────────────────────────────────────
// Reads ?auth=login|signup on mount and auto-opens the modal, then
// cleans the URL via history.replaceState so refreshes don't reopen it.

export function AuthOpenOnQueryParam() {
  const { openLogin, openSignup, openForgotPassword, openResetPassword } = useAuthModal()

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const auth = params.get('auth')
    if (!auth) return

    if (auth === 'login') openLogin()
    else if (auth === 'signup') openSignup()
    else if (auth === 'forgot-password') openForgotPassword()
    else if (auth === 'reset-password') {
      const token = params.get('token')
      if (token) openResetPassword(token)
    }

    params.delete('auth')
    params.delete('token')
    const next = params.toString()
    const clean = window.location.pathname + (next ? `?${next}` : '')
    window.history.replaceState({}, '', clean)
  }, [openLogin, openSignup, openForgotPassword, openResetPassword])

  return null
}
