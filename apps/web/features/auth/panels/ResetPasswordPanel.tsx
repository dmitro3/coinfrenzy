'use client'

import * as React from 'react'
import { ArrowLeft } from 'lucide-react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { CfLabel, CfPasswordInput, GoldButton, useToast } from '@coinfrenzy/ui/player'

import { resetPassword } from '@/lib/auth-client'
import { resetPasswordWithOtpApi, resendResetOtpApi } from '../services/auth-service'
import { useAuthModal } from '../context/AuthModalContext'

const OTP_LENGTH = 6

const otpResetSchema = z
  .object({
    password: z.string().min(10, 'Password must contain at least 10 characters').max(128),
    confirm: z.string().min(1),
  })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'Passwords must match',
  })

const tokenResetSchema = z
  .object({
    password: z.string().min(8, 'Password must contain at least 8 characters').max(128),
    confirm: z.string().min(1),
  })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'Passwords must match',
  })

type OtpResetValues = z.infer<typeof otpResetSchema>
type TokenResetValues = z.infer<typeof tokenResetSchema>

function useOtpCountdown(expiresAt: number | null) {
  const [secondsLeft, setSecondsLeft] = React.useState(0)

  React.useEffect(() => {
    if (!expiresAt) {
      setSecondsLeft(0)
      return
    }

    const expiry = expiresAt

    function tick() {
      const remaining = Math.max(0, Math.ceil((expiry - Date.now()) / 1000))
      setSecondsLeft(remaining)
    }

    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [expiresAt])

  return secondsLeft
}

export function ResetPasswordPanel() {
  const {
    resetToken,
    resetEmail,
    resetOtpExpiresAt,
    openLogin,
    openForgotPassword,
    goToResetPassword,
  } = useAuthModal()

  const isOtpFlow = Boolean(resetEmail) && !resetToken

  if (isOtpFlow) {
    return (
      <ResetPasswordOtpForm
        email={resetEmail!}
        otpExpiresAt={resetOtpExpiresAt}
        onBack={openLogin}
        onResendExpires={(expiresAt) => goToResetPassword(resetEmail!, expiresAt)}
        onSuccess={openLogin}
      />
    )
  }

  if (resetToken) {
    return <ResetPasswordTokenForm token={resetToken} onBack={openLogin} onSuccess={openLogin} />
  }

  return (
    <>
      <h1 className="cf-headline text-xl font-bold uppercase tracking-wider text-white">
        Reset Password
      </h1>
      <p className="mt-1 text-sm text-[var(--cf-gray-light)]">
        Request a reset code from the forgot-password screen first.
      </p>
      <GoldButton
        type="button"
        variant="gold-horizontal"
        onClick={openForgotPassword}
        fullWidth
        size="md"
        className="mt-6"
      >
        Forgot Password
      </GoldButton>
    </>
  )
}

function ResetPasswordOtpForm({
  email,
  otpExpiresAt,
  onBack,
  onResendExpires,
  onSuccess,
}: {
  email: string
  otpExpiresAt: number | null
  onBack: () => void
  onResendExpires: (expiresAt: number) => void
  onSuccess: () => void
}) {
  const toast = useToast()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OtpResetValues>({ resolver: zodResolver(otpResetSchema) })

  const [digits, setDigits] = React.useState<string[]>(Array(OTP_LENGTH).fill(''))
  const inputRefs = React.useRef<Array<HTMLInputElement | null>>(Array(OTP_LENGTH).fill(null))
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState(false)
  const [isResending, setIsResending] = React.useState(false)
  const secondsLeft = useOtpCountdown(otpExpiresAt)

  function handleChange(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[index] = digit
    setDigits(next)
    setError(null)
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
    setError(null)
    const focusIdx = Math.min(pasted.length, OTP_LENGTH - 1)
    inputRefs.current[focusIdx]?.focus()
  }

  const otp = digits.join('')
  const otpComplete = otp.length === OTP_LENGTH

  async function onSubmit(values: OtpResetValues) {
    if (!otpComplete) {
      setError('Please enter the 6-digit code sent to your email.')
      return
    }
    if (secondsLeft <= 0) {
      setError('Your reset code has expired. Request a new one.')
      return
    }

    setError(null)
    try {
      await resetPasswordWithOtpApi({
        email,
        otp,
        password: values.password,
        confirmPassword: values.confirm,
      })
      setDone(true)
      window.setTimeout(() => onSuccess(), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset password')
      setDigits(Array(OTP_LENGTH).fill(''))
      inputRefs.current[0]?.focus()
    }
  }

  async function handleResend() {
    if (isResending || secondsLeft > 0) return
    setIsResending(true)
    setError(null)
    try {
      const result = await resendResetOtpApi(email)
      toast.success('OTP has been sent to your email.')
      const expiresAt = Date.parse(result.data.otpExpiresAt)
      onResendExpires(Number.isFinite(expiresAt) ? expiresAt : Date.now() + 10 * 10 * 1000)
      setDigits(Array(OTP_LENGTH).fill(''))
      inputRefs.current[0]?.focus()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not resend the code')
    } finally {
      setIsResending(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-white hover:text-[var(--cf-gold-light)]"
      >
        <ArrowLeft className="h-4 w-4" /> Back To Login
      </button>

      <h1 className="cf-headline text-xl font-bold uppercase tracking-wider text-white">
        Reset Password
      </h1>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="space-y-1.5">
          <CfLabel htmlFor="reset-password">New Password</CfLabel>
          <CfPasswordInput
            id="reset-password"
            autoComplete="new-password"
            placeholder="Enter new password"
            {...register('password')}
          />
          {errors.password && (
            <p className="text-xs text-[var(--cf-red-primary)]">{errors.password.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <CfLabel htmlFor="reset-confirm">Confirm Password</CfLabel>
          <CfPasswordInput
            id="reset-confirm"
            autoComplete="new-password"
            placeholder="Confirm password"
            {...register('confirm')}
          />
          {errors.confirm && (
            <p className="text-xs text-[var(--cf-red-primary)]">{errors.confirm.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <CfLabel>OTP</CfLabel>
          <div className="flex gap-2" role="group" aria-label="Password reset code">
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
          <p className="text-sm text-[var(--cf-gray-light)]">
            {secondsLeft > 0 ? (
              <>
                Time Remaining: <span className="font-semibold text-white">{secondsLeft} sec</span>
              </>
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
          </p>
        </div>

        {error && (
          <div className="rounded-md border border-[var(--cf-red-dark)] bg-[var(--cf-red-deep)]/40 p-3 text-sm text-[var(--cf-red-primary)]">
            {error}
          </div>
        )}
        {done && (
          <div className="rounded-md border border-[var(--cf-gold-deep)] bg-black/40 p-3 text-sm text-[var(--cf-gold-light)]">
            Password reset. Redirecting to login…
          </div>
        )}

        <GoldButton
          type="submit"
          variant="gold-horizontal"
          disabled={isSubmitting || done || !otpComplete}
          fullWidth
          size="md"
        >
          {isSubmitting ? 'Saving…' : 'Submit'}
        </GoldButton>
      </form>
    </>
  )
}

function ResetPasswordTokenForm({
  token,
  onBack,
  onSuccess,
}: {
  token: string
  onBack: () => void
  onSuccess: () => void
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TokenResetValues>({ resolver: zodResolver(tokenResetSchema) })
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState(false)

  async function onSubmit(values: TokenResetValues) {
    setError(null)
    const result = await resetPassword({ token, newPassword: values.password })
    if (result.error) {
      setError(result.error.message ?? 'Could not reset password')
      return
    }
    setDone(true)
    window.setTimeout(() => onSuccess(), 1500)
  }

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-white hover:text-[var(--cf-gold-light)]"
      >
        <ArrowLeft className="h-4 w-4" /> Back To Login
      </button>

      <h1 className="cf-headline text-xl font-bold uppercase tracking-wider text-white">
        Reset Password
      </h1>
      <p className="mt-1 text-sm text-[var(--cf-gray-light)]">
        Pick something you haven&apos;t used before.
      </p>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="space-y-1.5">
          <CfLabel htmlFor="token-reset-password">New Password</CfLabel>
          <CfPasswordInput
            id="token-reset-password"
            autoComplete="new-password"
            placeholder="Enter new password"
            {...register('password')}
          />
          {errors.password && (
            <p className="text-xs text-[var(--cf-red-primary)]">{errors.password.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <CfLabel htmlFor="token-reset-confirm">Confirm Password</CfLabel>
          <CfPasswordInput
            id="token-reset-confirm"
            autoComplete="new-password"
            placeholder="Confirm password"
            {...register('confirm')}
          />
          {errors.confirm && (
            <p className="text-xs text-[var(--cf-red-primary)]">{errors.confirm.message}</p>
          )}
        </div>
        {error && (
          <div className="rounded-md border border-[var(--cf-red-dark)] bg-[var(--cf-red-deep)]/40 p-3 text-sm text-[var(--cf-red-primary)]">
            {error}
          </div>
        )}
        {done && (
          <div className="rounded-md border border-[var(--cf-gold-deep)] bg-black/40 p-3 text-sm text-[var(--cf-gold-light)]">
            Password reset. Redirecting to login…
          </div>
        )}
        <GoldButton
          type="submit"
          variant="gold-horizontal"
          disabled={isSubmitting || done}
          fullWidth
          size="md"
        >
          {isSubmitting ? 'Saving…' : 'Submit'}
        </GoldButton>
      </form>
    </>
  )
}
