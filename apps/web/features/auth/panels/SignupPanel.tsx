'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { useForm } from 'react-hook-form'
import { Ticket, ChevronDown } from 'lucide-react'

import { CfLabel, CfPasswordInput, CfTextInput, GoldButton } from '@coinfrenzy/ui/player'

import { signupApi } from '../services/auth-service'
import { signupSchema, type SignupFormValues } from '../schemas/auth-schemas'
import { useAuthModal } from '../context/AuthModalContext'

const CF_SITE_KEY =
  process.env.NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY ||
  (process.env.NODE_ENV !== 'production' ? '1x00000000000000000000AA' : undefined)

const IS_PROD_KEY_MISSING =
  process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY

export function SignupPanel() {
  const router = useRouter()
  const { goToOtp, openLogin, close } = useAuthModal()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupFormValues>({ resolver: zodResolver(signupSchema) })

  const [showCode, setShowCode] = React.useState(false)
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const [turnstileToken, setTurnstileToken] = React.useState<string | null>(null)
  const turnstileRef = React.useRef<TurnstileInstance>(null)

  async function onSubmit(values: SignupFormValues) {
    setSubmitError(null)

    if (!turnstileToken && CF_SITE_KEY) {
      setSubmitError('Please complete the security challenge.')
      return
    }

    try {
      const browser =
        typeof navigator !== 'undefined' ? (navigator.userAgent.split(' ').slice(-1)[0] ?? '') : ''
      const platform = typeof navigator !== 'undefined' ? (navigator.platform ?? '') : ''

      await signupApi({
        email: values.email.trim().toLowerCase(),
        password: values.password,
        isTermsAccepted: values.isTermsAccepted,
        referralCode: values.referralCode?.trim() || '',
        captchaToken: turnstileToken ?? '',
        browser,
        platform,
      })

      router.refresh()
      goToOtp(values.email.trim().toLowerCase())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create your account'
      setSubmitError(message)
      setTurnstileToken(null)
      turnstileRef.current?.reset()
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="space-y-1.5">
        <CfLabel htmlFor="signup-email">Email</CfLabel>
        <CfTextInput
          id="signup-email"
          type="email"
          autoComplete="email"
          placeholder="Email Address"
          {...register('email')}
        />
        {errors.email && (
          <p className="text-xs text-[var(--cf-red-primary)]">{errors.email.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <CfLabel htmlFor="signup-password">Password</CfLabel>
        <CfPasswordInput
          id="signup-password"
          autoComplete="new-password"
          placeholder="Enter password"
          {...register('password')}
        />
        {errors.password && (
          <p className="text-xs text-[var(--cf-red-primary)]">{errors.password.message}</p>
        )}
      </div>

      {/* Referral code collapsible */}
      <div className="overflow-hidden rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)]">
        <button
          type="button"
          onClick={() => setShowCode((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2.5 text-sm text-white"
          aria-expanded={showCode}
        >
          <span className="flex items-center gap-2">
            <Ticket className="h-4 w-4 text-[var(--cf-gold-medium)]" />I have a joining code
          </span>
          <ChevronDown
            className={`h-4 w-4 text-[var(--cf-gray-light)] transition-transform ${showCode ? 'rotate-180' : ''}`}
          />
        </button>
        {showCode && (
          <div className="border-t border-[var(--cf-border-default)] px-3 py-3">
            <CfTextInput
              placeholder="Referral / promo code"
              autoCapitalize="characters"
              className="uppercase"
              {...register('referralCode')}
            />
          </div>
        )}
      </div>

      {/* Terms */}
      <div className="space-y-2 text-xs text-[var(--cf-gray-light)]">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-[var(--cf-gold-medium)]"
            {...register('isTermsAccepted')}
          />
          <span>
            By signing up, you confirm that you are at least 18 years old, accept our{' '}
            <Link
              className="text-[var(--cf-gold-light)] hover:underline"
              href="/terms"
              onClick={close}
            >
              Terms of Service
            </Link>
            , and consent to the collection and processing of your data as outlined in our Privacy
            Policy.
          </span>
        </label>
        {errors.isTermsAccepted && (
          <p className="ml-6 text-xs text-[var(--cf-red-primary)]">
            {errors.isTermsAccepted.message}
          </p>
        )}
      </div>

      {CF_SITE_KEY ? (
        <Turnstile
          ref={turnstileRef}
          siteKey={CF_SITE_KEY}
          onSuccess={setTurnstileToken}
          onExpire={() => setTurnstileToken(null)}
          onError={() => setTurnstileToken(null)}
          options={{ theme: 'dark', size: 'flexible' }}
          className="w-full"
        />
      ) : IS_PROD_KEY_MISSING ? (
        <TurnstileMisconfigured />
      ) : null}

      {submitError && (
        <div className="rounded-md border border-[var(--cf-red-dark)] bg-[var(--cf-red-deep)]/40 p-3 text-sm text-[var(--cf-red-primary)]">
          {submitError}
        </div>
      )}

      <GoldButton
        type="submit"
        variant="gold-horizontal"
        disabled={isSubmitting || IS_PROD_KEY_MISSING || (!!CF_SITE_KEY && !turnstileToken)}
        fullWidth
        size="md"
      >
        {isSubmitting ? 'Creating account…' : 'Sign Up'}
      </GoldButton>

      <div className="mt-4 space-y-3">
        <div className="text-center text-sm font-semibold text-white">Or Continue With</div>
        <div className="flex justify-center">
          <span
            aria-hidden="true"
            className="grid h-10 w-10 place-items-center rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)]"
          >
            <GoogleGlyph />
          </span>
        </div>
      </div>

      <p className="text-center text-sm text-[var(--cf-gray-light)]">
        Already have an account?{' '}
        <button
          type="button"
          onClick={openLogin}
          className="font-semibold text-white hover:text-[var(--cf-gold-light)]"
        >
          Login
        </button>
      </p>
    </form>
  )
}

function TurnstileMisconfigured() {
  return (
    <div className="rounded-md border border-[var(--cf-red-dark)] bg-[var(--cf-red-deep)]/40 px-3 py-2 text-xs text-[var(--cf-red-primary)]">
      ⚠️ Turnstile widget not configured — set{' '}
      <code className="font-mono">NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY</code> as a Docker build ARG and
      rebuild the image.
    </div>
  )
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.83z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"
        fill="#EA4335"
      />
    </svg>
  )
}
