'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ChevronDown, Ticket } from 'lucide-react'

import { US_STATES, BLOCKED_STATES } from '@coinfrenzy/config'
import {
  AuthModal,
  AuthTabs,
  CfLabel,
  CfPasswordInput,
  CfTextInput,
  GoldButton,
} from '@coinfrenzy/ui/player'

// Cloudflare's test site key always passes the challenge (docs:
// https://developers.cloudflare.com/turnstile/reference/testing/).
// Used in non-production when NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY is absent
// so the real widget renders and can be tested without real credentials.
//
// IMPORTANT: use `||` not `??` here — the Docker build ARG is an empty
// string "" when the key hasn't been filled in, and ?? does NOT fall through
// for "", so CF_SITE_KEY would silently be "" (falsy) → placeholder renders
// instead of the real widget even though the server expects a real token.
const CF_SITE_KEY =
  process.env.NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY ||
  (process.env.NODE_ENV !== 'production' ? '1x00000000000000000000AA' : undefined)

// True when we are in production but the site key was not baked in at build
// time. Prevents the misleading fake placeholder from showing; blocks submit
// since the middleware will reject with TURNSTILE_REQUIRED anyway.
const IS_PROD_KEY_MISSING =
  process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY

// docs/10 §4.1 — public signup form. Renders inside the Coin Frenzy
// auth modal with the fox mascot on the right. State and date-of-birth
// stay required (state drives the SC eligibility check, DOB is the 18+
// gate) but they live in a collapsible "Personal details" group below
// the email/password fields so the modal feels close to the live site's
// short form. Joining-code (referral) box matches the screenshot.

const signupSchema = z.object({
  email: z.string().email('Please enter an email address'),
  password: z.string().min(8, 'Password must contain at least 8 characters').max(128),
  firstName: z.string().min(1, 'Required').max(80),
  lastName: z.string().min(1, 'Required').max(80),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  state: z.string().length(2, 'Pick a state'),
  phone: z.string().optional(),
  joiningCode: z.string().optional(),
  ageConfirm: z.literal(true, { errorMap: () => ({ message: 'You must be 18 or older' }) }),
  tosConfirm: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the terms to continue' }),
  }),
})

type SignupValues = z.infer<typeof signupSchema>

export default function SignupPage() {
  return (
    <React.Suspense fallback={null}>
      <SignupPageInner />
    </React.Suspense>
  )
}

function SignupPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams?.get('next') ?? '/lobby'

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
  })

  const state = watch('state')
  const stateIsBlocked = state ? BLOCKED_STATES.has(state.toUpperCase()) : false
  const [showCode, setShowCode] = React.useState(false)
  const [showDetails, setShowDetails] = React.useState(false)
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const [turnstileToken, setTurnstileToken] = React.useState<string | null>(null)
  const turnstileRef = React.useRef<TurnstileInstance>(null)

  async function onSubmit(values: SignupValues) {
    setSubmitError(null)
    let response: Response
    try {
      response = await fetch('/api/player/signup', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: values.email.trim().toLowerCase(),
          password: values.password,
          firstName: values.firstName,
          lastName: values.lastName,
          dateOfBirth: values.dateOfBirth,
          phone: values.phone || undefined,
          state: values.state.toUpperCase(),
          country: 'US',
          emailConsent: true,
          smsConsent: false,
          referralCode: values.joiningCode?.trim().toUpperCase() || undefined,
          turnstileToken,
        }),
      })
    } catch {
      setSubmitError('Network error — please try again.')
      setTurnstileToken(null)
      turnstileRef.current?.reset()
      return
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null
      setSubmitError(body?.message ?? 'Could not create your account')
      setTurnstileToken(null)
      turnstileRef.current?.reset()
      return
    }

    router.push(next.startsWith('/') ? next : '/lobby')
    router.refresh()
  }

  return (
    <AuthModal closeHref="/" foxVariant="coins-half">
      <AuthTabs active="signup" />

      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="space-y-1.5">
          <CfLabel htmlFor="email">Email</CfLabel>
          <CfTextInput
            id="email"
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
          <CfLabel htmlFor="password">Password</CfLabel>
          <CfPasswordInput
            id="password"
            autoComplete="new-password"
            placeholder="Enter password"
            {...register('password')}
          />
          {errors.password && (
            <p className="text-xs text-[var(--cf-red-primary)]">{errors.password.message}</p>
          )}
        </div>

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
                {...register('joiningCode')}
              />
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)]">
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2.5 text-sm text-white"
            aria-expanded={showDetails}
          >
            <span>Personal details (required)</span>
            <ChevronDown
              className={`h-4 w-4 text-[var(--cf-gray-light)] transition-transform ${showDetails ? 'rotate-180' : ''}`}
            />
          </button>
          {showDetails && (
            <div className="space-y-3 border-t border-[var(--cf-border-default)] px-3 py-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <CfLabel htmlFor="firstName">First name</CfLabel>
                  <CfTextInput
                    id="firstName"
                    autoComplete="given-name"
                    {...register('firstName')}
                  />
                  {errors.firstName && (
                    <p className="text-xs text-[var(--cf-red-primary)]">
                      {errors.firstName.message}
                    </p>
                  )}
                </div>
                <div>
                  <CfLabel htmlFor="lastName">Last name</CfLabel>
                  <CfTextInput id="lastName" autoComplete="family-name" {...register('lastName')} />
                  {errors.lastName && (
                    <p className="text-xs text-[var(--cf-red-primary)]">
                      {errors.lastName.message}
                    </p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <CfLabel htmlFor="dateOfBirth">Date of birth</CfLabel>
                  <CfTextInput
                    id="dateOfBirth"
                    type="date"
                    autoComplete="bday"
                    {...register('dateOfBirth')}
                  />
                  {errors.dateOfBirth && (
                    <p className="text-xs text-[var(--cf-red-primary)]">
                      {errors.dateOfBirth.message}
                    </p>
                  )}
                </div>
                <div>
                  <CfLabel htmlFor="state">State</CfLabel>
                  <select
                    id="state"
                    className="flex h-11 w-full rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] px-3 text-sm text-white focus:border-[var(--cf-gold-medium)] focus:outline-none"
                    {...register('state')}
                  >
                    <option value="">Select…</option>
                    {US_STATES.map((s: { code: string; name: string }) => (
                      <option key={s.code} value={s.code}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                  {errors.state && (
                    <p className="text-xs text-[var(--cf-red-primary)]">{errors.state.message}</p>
                  )}
                </div>
              </div>
              <div>
                <CfLabel htmlFor="phone">Phone (optional)</CfLabel>
                <CfTextInput id="phone" type="tel" autoComplete="tel" {...register('phone')} />
              </div>
            </div>
          )}
        </div>

        {stateIsBlocked && (
          <div className="rounded-md border border-[var(--cf-gold-deep)] bg-[#231804] p-3 text-xs text-[var(--cf-gold-light)]">
            Your state allows only Gold Coin play, not Sweepstakes Coins.
          </div>
        )}

        <div className="space-y-2 text-xs text-[var(--cf-gray-light)]">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[var(--cf-gold-medium)]"
              {...register('ageConfirm')}
            />
            <span>
              By signing up, you confirm that you are at least 18 years old, accept our{' '}
              <Link className="text-[var(--cf-gold-light)] hover:underline" href="/terms">
                Terms of Service
              </Link>
              , and consent to the collection and processing of your data as outlined in our Privacy
              Policy.
            </span>
          </label>
          {errors.ageConfirm && (
            <p className="ml-6 text-xs text-[var(--cf-red-primary)]">{errors.ageConfirm.message}</p>
          )}
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[var(--cf-gold-medium)]"
              {...register('tosConfirm')}
            />
            <span>I agree to the Terms &amp; Conditions and Sweepstakes Rules.</span>
          </label>
          {errors.tosConfirm && (
            <p className="ml-6 text-xs text-[var(--cf-red-primary)]">{errors.tosConfirm.message}</p>
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
          disabled={isSubmitting || IS_PROD_KEY_MISSING || (!!CF_SITE_KEY && !turnstileToken)}
          fullWidth
          size="md"
        >
          {isSubmitting ? 'Creating account…' : 'Sign Up'}
        </GoldButton>
      </form>

      <div className="mt-6 space-y-3">
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

      <p className="mt-6 text-center text-xs text-[var(--cf-gray-light)]">
        Already have an account?{' '}
        <Link className="font-semibold text-white hover:text-[var(--cf-gold-light)]" href="/login">
          Log in
        </Link>
      </p>
    </AuthModal>
  )
}

/**
 * Rendered only in production when NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY was not
 * baked in at docker build time. Replaces the old fake "✓ Success!" sticker
 * that silently allowed a broken UX while the server rejected logins.
 *
 * FIX: Set NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY in .env.docker and export it
 * in your shell before running `docker compose build`.
 */
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
