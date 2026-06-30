'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import {
  AuthModal,
  AuthTabs,
  CfLabel,
  CfPasswordInput,
  CfTextInput,
  GoldButton,
} from '@coinfrenzy/ui/player'

import { signIn } from '@/lib/auth-client'

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
// time. In this state the middleware WILL require a Turnstile token but the
// widget cannot render — we must surface a config error instead of silently
// failing (which was the original bug: the fake placeholder made the UI look
// fine while every login attempt returned TURNSTILE_REQUIRED from the server).
const IS_PROD_KEY_MISSING =
  process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY

const loginSchema = z.object({
  email: z.string().email('Please enter an email address'),
  password: z.string().min(8, 'Password must contain at least 8 characters'),
})

type LoginValues = z.infer<typeof loginSchema>

export default function LoginPage() {
  // useSearchParams() forces this page out of static prerendering, so the
  // body must live below a Suspense boundary or `next build` aborts.
  return (
    <React.Suspense fallback={null}>
      <LoginPageInner />
    </React.Suspense>
  )
}

function LoginPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams?.get('next') ?? '/lobby'

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const [turnstileToken, setTurnstileToken] = React.useState<string | null>(null)
  const turnstileRef = React.useRef<TurnstileInstance>(null)

  async function onSubmit(values: LoginValues) {
    setSubmitError(null)
    const result = await signIn.email({
      email: values.email.trim().toLowerCase(),
      password: values.password,
      callbackURL: next.startsWith('/') ? next : '/',
      fetchOptions: {
        headers: turnstileToken ? { 'X-CF-Turnstile-Token': turnstileToken } : {},
      },
    })

    if (result.error) {
      const code = result.error.code ?? ''
      if (code === 'TWO_FACTOR_REQUIRED' || code.toLowerCase().includes('two')) {
        router.push(`/mfa?next=${encodeURIComponent(next)}`)
        return
      }
      setSubmitError(result.error.message ?? 'Could not sign you in')
      setTurnstileToken(null)
      turnstileRef.current?.reset()
      return
    }

    router.push(next.startsWith('/') ? next : '/')
    router.refresh()
  }

  // Google social sign-in is wired through Better Auth's social
  // provider plugin (docs/09 §5.2). Until the OAuth client IDs land
  // in Doppler we surface a friendly error rather than throwing.
  async function googleSignIn() {
    setSubmitError(null)
    const social = (
      signIn as unknown as {
        social?: (args: unknown) => Promise<{ error?: { message?: string } } | undefined>
      }
    ).social
    if (!social) {
      setSubmitError('Google sign-in is not enabled yet — please use email + password.')
      return
    }
    const result = await social({
      provider: 'google',
      callbackURL: next.startsWith('/') ? next : '/',
    })
    if (result?.error) {
      setSubmitError(result.error.message ?? 'Could not start Google sign-in')
    }
  }

  return (
    <AuthModal closeHref="/" foxVariant="coins-half">
      <AuthTabs active="login" />

      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="space-y-1.5">
          <CfLabel htmlFor="email">Email</CfLabel>
          <CfTextInput
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
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
            autoComplete="current-password"
            placeholder="••••••••••"
            {...register('password')}
          />
          {errors.password && (
            <p className="text-xs text-[var(--cf-red-primary)]">{errors.password.message}</p>
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
          {isSubmitting ? 'Signing in…' : 'Login'}
        </GoldButton>

        <p className="text-center text-sm text-[var(--cf-gray-light)]">
          Forgot Your Password?{' '}
          <Link
            href="/reset-password"
            className="font-semibold text-white hover:text-[var(--cf-gold-light)]"
          >
            Reset it Here
          </Link>
        </p>
      </form>

      <div className="mt-6 space-y-3">
        <div className="text-center text-sm font-semibold text-white">Or Continue With</div>
        <button
          type="button"
          onClick={googleSignIn}
          aria-label="Continue with Google"
          className="mx-auto flex h-10 w-10 items-center justify-center rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] transition-colors hover:bg-[var(--cf-bg-card-hover)]"
        >
          <GoogleGlyph />
        </button>
        <p className="text-center text-xs text-[var(--cf-gray-light)]">
          By signing in you agree to our{' '}
          <Link className="underline hover:text-white" href="/terms">
            Terms
          </Link>{' '}
          and{' '}
          <Link className="underline hover:text-white" href="/privacy">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </AuthModal>
  )
}

/**
 * Rendered only in production when NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY was not
 * baked in at docker build time. This replaces the old misleading
 * "✓ Success!" placeholder that made the UI look fine while every login
 * attempt silently failed with TURNSTILE_REQUIRED from the middleware.
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
