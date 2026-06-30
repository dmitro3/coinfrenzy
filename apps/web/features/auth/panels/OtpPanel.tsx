'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { GoldButton, useToast } from '@coinfrenzy/ui/player'

import { verifyOtpApi, resendOtpApi } from '../services/auth-service'
import { useAuthModal } from '../context/AuthModalContext'

const OTP_LENGTH = 6
const RESEND_COOLDOWN = 60

export function OtpPanel() {
  const router = useRouter()
  const toast = useToast()
  const { otpEmail, goToUsername, openSignup, close } = useAuthModal()

  // 6 individual digit inputs
  const [digits, setDigits] = React.useState<string[]>(Array(OTP_LENGTH).fill(''))
  const inputRefs = React.useRef<Array<HTMLInputElement | null>>(Array(OTP_LENGTH).fill(null))

  const [isVerifying, setIsVerifying] = React.useState(false)
  const [isResending, setIsResending] = React.useState(false)
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const [countdown, setCountdown] = React.useState(RESEND_COOLDOWN)

  // Auto-focus first input on mount
  React.useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  // Countdown timer
  React.useEffect(() => {
    if (countdown <= 0) return
    const timer = window.setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  function handleChange(index: number, value: string) {
    // Only accept a single digit
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[index] = digit
    setDigits(next)
    setSubmitError(null)

    // Auto-advance
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault()
      if (digits[index]) {
        const next = [...digits]
        next[index] = ''
        setDigits(next)
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus()
        const next = [...digits]
        next[index - 1] = ''
        setDigits(next)
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH)
    if (!pasted) return
    const next = Array(OTP_LENGTH).fill('')
    pasted.split('').forEach((ch, i) => {
      next[i] = ch
    })
    setDigits(next)
    setSubmitError(null)
    // Focus last filled or next empty
    const focusIdx = Math.min(pasted.length, OTP_LENGTH - 1)
    inputRefs.current[focusIdx]?.focus()
  }

  const otp = digits.join('')
  const isComplete = otp.length === OTP_LENGTH

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!isComplete || !otpEmail) return
    setSubmitError(null)
    setIsVerifying(true)

    try {
      const result = await verifyOtpApi(otpEmail, otp)
      const user = result.data.user

      if (!user.username) {
        goToUsername()
      } else {
        toast.success('Email verified successfully.', { title: 'Email Verified' })
        router.refresh()
        close()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid or expired OTP'
      setSubmitError(message)
      setDigits(Array(OTP_LENGTH).fill(''))
      inputRefs.current[0]?.focus()
    } finally {
      setIsVerifying(false)
    }
  }

  async function handleResend() {
    if (!otpEmail || isResending || countdown > 0) return
    setIsResending(true)
    setSubmitError(null)
    try {
      await resendOtpApi(otpEmail)
      toast.success('A new verification code has been sent.', { title: 'Code Sent' })
      setCountdown(RESEND_COOLDOWN)
      setDigits(Array(OTP_LENGTH).fill(''))
      inputRefs.current[0]?.focus()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not resend the code'
      setSubmitError(message)
    } finally {
      setIsResending(false)
    }
  }

  return (
    <form onSubmit={handleVerify} className="space-y-6" noValidate>
      <div>
        <h2 className="cf-headline text-xl font-bold uppercase tracking-wider text-white">
          Verify your email
        </h2>
        <p className="mt-2 text-sm text-[var(--cf-gray-light)]">
          We sent a 6-digit code to{' '}
          <span className="font-semibold text-white">{otpEmail ?? 'your email'}</span>. Enter it
          below.
        </p>
      </div>

      {/* 6-digit OTP inputs */}
      <div className="flex gap-2" role="group" aria-label="One-time password input">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              inputRefs.current[index] = el
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            aria-label={`Digit ${index + 1}`}
            className={
              'flex h-12 w-full min-w-0 rounded-md border text-center text-lg font-bold text-white ' +
              'bg-[var(--cf-bg-elevated)] transition-colors outline-none ' +
              (digit
                ? 'border-[var(--cf-gold-medium)]'
                : 'border-[var(--cf-border-default)] focus:border-[var(--cf-gold-medium)]')
            }
          />
        ))}
      </div>

      {submitError && (
        <div className="rounded-md border border-[var(--cf-red-dark)] bg-[var(--cf-red-deep)]/40 p-3 text-sm text-[var(--cf-red-primary)]">
          {submitError}
        </div>
      )}

      <GoldButton type="submit" disabled={!isComplete || isVerifying} fullWidth size="md">
        {isVerifying ? 'Verifying…' : 'Verify Email'}
      </GoldButton>

      {/* Resend + timer */}
      <div className="text-center text-sm text-[var(--cf-gray-light)]">
        {countdown > 0 ? (
          <span>
            Resend code in{' '}
            <span className="font-semibold text-white">
              {String(Math.floor(countdown / 60)).padStart(2, '0')}:
              {String(countdown % 60).padStart(2, '0')}
            </span>
          </span>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            disabled={isResending}
            className="font-semibold text-[var(--cf-gold-light)] hover:text-white disabled:opacity-50"
          >
            {isResending ? 'Sending…' : 'Resend OTP'}
          </button>
        )}
      </div>

      <p className="text-center text-xs text-[var(--cf-gray-light)]">
        Wrong email?{' '}
        <button
          type="button"
          onClick={openSignup}
          className="font-semibold text-[var(--cf-gold-light)] hover:text-white"
        >
          Change email
        </button>
      </p>
    </form>
  )
}
