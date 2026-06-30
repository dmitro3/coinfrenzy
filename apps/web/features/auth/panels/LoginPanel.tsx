'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { useForm } from 'react-hook-form'

import { CfLabel, CfPasswordInput, CfTextInput, GoldButton } from '@coinfrenzy/ui/player'

import { signIn } from '@/lib/auth-client'
import { loginSchema, type LoginFormValues } from '../schemas/auth-schemas'
import { fetchProfileApi } from '../services/auth-service'
import { useAuthModal } from '../context/AuthModalContext'

const CF_SITE_KEY =
  process.env.NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY ||
  (process.env.NODE_ENV !== 'production' ? '1x00000000000000000000AA' : undefined)

const IS_PROD_KEY_MISSING =
  process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY

export function LoginPanel() {
  const router = useRouter()
  const { close, goToOtp, goToUsername, openSignup, openForgotPassword } = useAuthModal()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) })

  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const [turnstileToken, setTurnstileToken] = React.useState<string | null>(null)
  const turnstileRef = React.useRef<TurnstileInstance>(null)

  async function onSubmit(values: LoginFormValues) {
    setSubmitError(null)

    const result = await signIn.email({
      email: values.email.trim().toLowerCase(),
      password: values.password,
      callbackURL: '/lobby',
      fetchOptions: {
        headers: turnstileToken ? { 'X-CF-Turnstile-Token': turnstileToken } : {},
      },
    })

    if (result.error) {
      const code = result.error.code ?? ''
      if (code === 'TWO_FACTOR_REQUIRED' || code.toLowerCase().includes('two')) {
        // MFA stays as a route — close modal and navigate
        close()
        router.push('/mfa')
        return
      }
      setSubmitError(result.error.message ?? 'Could not sign you in')
      setTurnstileToken(null)
      turnstileRef.current?.reset()
      return
    }

    // Fetch profile to determine next step
    try {
      const profile = await fetchProfileApi()
      const user = profile.data.data

      if (!user.isEmailVerified) {
        goToOtp(values.email.trim().toLowerCase())
        return
      }

      if (!user.username) {
        goToUsername()
        return
      }

      // Fully authenticated — close and refresh
      router.refresh()
      close()
    } catch {
      // Profile fetch failed but login succeeded — just close
      router.refresh()
      close()
    }
  }

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
    const result = await social({ provider: 'google', callbackURL: '/lobby' })
    if (result?.error) {
      setSubmitError(result.error.message ?? 'Could not start Google sign-in')
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="space-y-1.5">
        <CfLabel htmlFor="login-email">Email</CfLabel>
        <CfTextInput
          id="login-email"
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
        <CfLabel htmlFor="login-password">Password</CfLabel>
        <CfPasswordInput
          id="login-password"
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
        variant="gold-horizontal"
        disabled={isSubmitting || IS_PROD_KEY_MISSING || (!!CF_SITE_KEY && !turnstileToken)}
        fullWidth
        size="md"
      >
        {isSubmitting ? 'Validating user data...' : 'Login'}
      </GoldButton>

      <p className="text-center text-sm text-[var(--cf-gray-light)]">
        Forgot Your Password?{' '}
        <button
          type="button"
          onClick={openForgotPassword}
          className="font-semibold text-white hover:text-[var(--cf-gold-light)]"
        >
          Reset it Here
        </button>
      </p>

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
          <Link className="underline hover:text-white" href="/terms" onClick={close}>
            Terms
          </Link>{' '}
          and{' '}
          <Link className="underline hover:text-white" href="/privacy" onClick={close}>
            Privacy Policy
          </Link>
          .
        </p>
      </div>

      <p className="text-center text-sm text-[var(--cf-gray-light)]">
        Don&apos;t have an account?{' '}
        <button
          type="button"
          onClick={openSignup}
          className="font-semibold text-white hover:text-[var(--cf-gold-light)]"
        >
          Create Account
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
