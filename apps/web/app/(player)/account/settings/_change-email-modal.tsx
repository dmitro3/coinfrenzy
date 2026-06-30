'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { CfLabel, CfTextInput, useToast } from '@coinfrenzy/ui/player'

import { RESEND_COOLDOWN_SEC } from './_constants'
import { GradientModalShell } from './_gradient-modal-shell'
import { OtpInput } from './_otp-input'
import { PrimaryModalButton, SecondaryModalButton } from './_modal-buttons'

interface ChangeEmailModalProps {
  open: boolean
  onClose: () => void
  currentEmail: string
}

type Step = 'email' | 'verify'

export function ChangeEmailModal({ open, onClose, currentEmail }: ChangeEmailModalProps) {
  const router = useRouter()
  const toast = useToast()
  const [step, setStep] = React.useState<Step>('email')
  const [newEmail, setNewEmail] = React.useState('')
  const [otp, setOtp] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [countdown, setCountdown] = React.useState(0)

  React.useEffect(() => {
    if (!open) {
      setStep('email')
      setNewEmail('')
      setOtp('')
      setError(null)
      setSubmitting(false)
      setCountdown(0)
    }
  }, [open])

  React.useEffect(() => {
    if (countdown <= 0) return
    const timer = window.setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  async function sendCode(email: string) {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/player/change-email/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const body = (await res.json().catch(() => null)) as { message?: string } | null
      if (!res.ok) {
        throw new Error(body?.message ?? 'Could not send verification code.')
      }
      toast.success('Verification code sent.', { title: 'Email' })
      setStep('verify')
      setCountdown(RESEND_COOLDOWN_SEC)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send verification code.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault()
    const email = newEmail.trim().toLowerCase()
    if (!email || !email.includes('@')) {
      setError('Enter a valid email address.')
      return
    }
    if (email === currentEmail.trim().toLowerCase()) {
      setError('That is already your email address.')
      return
    }
    await sendCode(email)
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (otp.length !== 6) {
      setError('Enter the 6-digit verification code.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/player/change-email/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: newEmail.trim().toLowerCase(), otp }),
      })
      const body = (await res.json().catch(() => null)) as { message?: string } | null
      if (!res.ok) {
        throw new Error(body?.message ?? 'Verification failed.')
      }
      toast.success('Your email has been updated.', { title: 'Saved' })
      router.refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.')
      setOtp('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <GradientModalShell open={open} onClose={onClose} size="sm">
      {step === 'email' ? (
        <form onSubmit={handleSendCode} className="mt-2 space-y-5">
          <h2 className="text-lg font-bold tracking-tight text-white">Change Email</h2>
          <div className="space-y-2">
            <CfLabel htmlFor="new-email" className="text-xs font-semibold text-white/40">
              New Email Address
            </CfLabel>
            <CfTextInput
              id="new-email"
              type="email"
              value={newEmail}
              onChange={(e) => {
                setNewEmail(e.target.value)
                setError(null)
              }}
              placeholder="you@example.com"
              autoComplete="email"
              autoFocus
              className="border-white/10 bg-[#121212]"
            />
          </div>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <PrimaryModalButton type="submit" disabled={submitting || !newEmail.trim()} fullWidth>
            {submitting ? 'Sending…' : 'Send verification code'}
          </PrimaryModalButton>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="mt-2 space-y-5">
          <h2 className="text-lg font-bold tracking-tight text-white">Verify email</h2>
          <p className="text-sm text-white/70">
            We&apos;ve sent a verification code to:{' '}
            <span className="font-semibold text-white">{newEmail.trim().toLowerCase()}</span>
          </p>
          <div className="space-y-2">
            <CfLabel className="text-xs font-semibold text-white/40">
              Enter verification code
            </CfLabel>
            <OtpInput value={otp} onChange={setOtp} disabled={submitting} autoFocus />
          </div>
          <p className="text-xs text-white/40">
            Didn&apos;t receive the code?{' '}
            {countdown > 0 ? (
              <>
                Try again in <span className="font-bold text-white">{countdown}s</span>
              </>
            ) : (
              <button
                type="button"
                className="font-bold text-white underline"
                disabled={submitting}
                onClick={() => void sendCode(newEmail.trim().toLowerCase())}
              >
                Try again
              </button>
            )}
          </p>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <div className="flex gap-3 pt-2">
            <SecondaryModalButton type="button" onClick={() => setStep('email')}>
              Back
            </SecondaryModalButton>
            <PrimaryModalButton type="submit" disabled={submitting || otp.length !== 6}>
              {submitting ? 'Verifying…' : 'Verify'}
            </PrimaryModalButton>
          </div>
        </form>
      )}
    </GradientModalShell>
  )
}
