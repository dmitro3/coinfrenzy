'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Loader2, ShieldCheck } from 'lucide-react'

import { Button } from '@coinfrenzy/ui/primitives/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@coinfrenzy/ui/primitives/card'
import { Input } from '@coinfrenzy/ui/primitives/input'
import { Label } from '@coinfrenzy/ui/primitives/label'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FlowState =
  | { step: 'password'; error?: string }
  | {
      step: 'setup_2fa'
      pending: string
      displayName: string
      secret: string
      qrPngDataUrl: string
      otpauthUrl: string
      error?: string
    }
  | { step: 'verify_2fa'; pending: string; displayName: string; error?: string }
  | { step: 'backup_codes'; backupCodes: string[]; nextPath: string }

interface LoginFormProps {
  nextPath: string
}

// ---------------------------------------------------------------------------
// LoginForm – top-level multi-step shell
// ---------------------------------------------------------------------------

export function LoginForm({ nextPath }: LoginFormProps) {
  const router = useRouter()
  const [state, setState] = React.useState<FlowState>({ step: 'password' })

  /**
   * Single shared async-loading flag. We intentionally use useState (not
   * useTransition) so we can set it synchronously *before* the first await,
   * giving users immediate visual feedback on click.
   */
  const [loading, setLoading] = React.useState(false)

  // -------------------------------------------------------------------------
  // Step 1 – email + password
  // -------------------------------------------------------------------------

  async function submitPassword(email: string, password: string) {
    // Prevent duplicate submissions if already in-flight.
    if (loading) return
    setLoading(true)

    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>

      if (!res.ok || data.ok !== true) {
        setState({
          step: 'password',
          error: humanizeError((data.error as string) || 'login_failed'),
        })
        return
      }

      const step = data.step as 'setup_2fa' | 'verify_2fa' | 'done'
      const pending = data.pending as string
      const displayName = (data.displayName as string) ?? ''

      // Dev-only path: ADMIN_2FA_OPTIONAL=true issues a session straight from
      // the password step. Cookie is already set by the server response.
      if (step === 'done') {
        router.replace((data.redirect as string) ?? nextPath)
        router.refresh()
        return
      }

      if (step === 'setup_2fa') {
        const setupRes = await fetch('/api/admin/auth/setup-2fa', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ pending }),
        })
        const setupData = (await setupRes.json().catch(() => ({}))) as Record<string, unknown>

        if (!setupRes.ok || setupData.ok !== true) {
          setState({
            step: 'password',
            error: humanizeError((setupData.error as string) || 'setup_failed'),
          })
          return
        }

        setState({
          step: 'setup_2fa',
          pending,
          displayName,
          secret: setupData.secret as string,
          qrPngDataUrl: setupData.qrPngDataUrl as string,
          otpauthUrl: setupData.otpauthUrl as string,
        })
      } else {
        setState({ step: 'verify_2fa', pending, displayName })
      }
    } catch {
      // Network-level failure – show a generic message so no raw error leaks.
      setState({ step: 'password', error: humanizeError('login_failed') })
    } finally {
      // Always clear the loading flag so the button is re-enabled.
      setLoading(false)
    }
  }

  // -------------------------------------------------------------------------
  // Step 2a – first-time 2FA setup confirmation
  // -------------------------------------------------------------------------

  async function confirmFirstTime(code: string) {
    if (state.step !== 'setup_2fa' || loading) return
    setLoading(true)

    try {
      const res = await fetch('/api/admin/auth/confirm-2fa', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pending: state.pending, secret: state.secret, code }),
      })
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>

      if (!res.ok || data.ok !== true) {
        setState({ ...state, error: humanizeError((data.error as string) || 'invalid_code') })
        return
      }

      const backupCodes = (data.backupCodes as string[] | undefined) ?? []
      setState({ step: 'backup_codes', backupCodes, nextPath })
    } catch {
      setState({ ...state, error: humanizeError('login_failed') })
    } finally {
      setLoading(false)
    }
  }

  // -------------------------------------------------------------------------
  // Step 2b – existing 2FA verification
  // -------------------------------------------------------------------------

  async function verifyExisting(code: string) {
    if (state.step !== 'verify_2fa' || loading) return
    setLoading(true)

    try {
      const res = await fetch('/api/admin/auth/verify-2fa', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pending: state.pending, code }),
      })
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>

      if (!res.ok || data.ok !== true) {
        setState({ ...state, error: humanizeError((data.error as string) || 'invalid_code') })
        return
      }

      router.replace(nextPath)
      router.refresh()
    } catch {
      setState({ ...state, error: humanizeError('login_failed') })
    } finally {
      setLoading(false)
    }
  }

  // -------------------------------------------------------------------------
  // Final step – navigate to dashboard after backup codes acknowledged
  // -------------------------------------------------------------------------

  function goToDashboard() {
    router.replace(state.step === 'backup_codes' ? state.nextPath : nextPath)
    router.refresh()
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (state.step === 'password') {
    return <PasswordStep error={state.error} loading={loading} onSubmit={submitPassword} />
  }

  if (state.step === 'setup_2fa') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Set up two-factor authentication</CardTitle>
          <CardDescription>
            Scan this QR with your authenticator (1Password, Authy, Google Authenticator, etc.) then
            enter the 6-digit code.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={state.qrPngDataUrl}
              alt="CoinFrenzy admin 2FA setup QR code"
              className="h-44 w-44 rounded-md bg-white p-2"
            />
            <details className="w-full text-xs text-muted-foreground">
              <summary className="cursor-pointer">Can&apos;t scan? Reveal the secret</summary>
              <code className="mt-2 block break-all rounded-md bg-secondary p-2 font-mono text-[11px]">
                {state.secret}
              </code>
            </details>
          </div>
          <CodeForm
            label="6-digit code"
            onSubmit={confirmFirstTime}
            loading={loading}
            error={state.error}
          />
        </CardContent>
      </Card>
    )
  }

  if (state.step === 'verify_2fa') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Two-factor verification</CardTitle>
          <CardDescription>
            Enter the 6-digit code from your authenticator. (Backup codes also work.)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CodeForm
            label={`Hello, ${state.displayName}. Enter your code:`}
            onSubmit={verifyExisting}
            loading={loading}
            error={state.error}
          />
        </CardContent>
      </Card>
    )
  }

  // backup_codes
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-success" /> 2FA enabled
        </CardTitle>
        <CardDescription>
          Save these backup codes somewhere safe. Each works once if you lose your authenticator.
          They will not be shown again.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 rounded-md border bg-secondary p-3 font-mono text-sm">
          {state.backupCodes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <Button className="w-full" onClick={goToDashboard}>
          Continue to dashboard
        </Button>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// PasswordStep – extracted to keep LoginForm concise and reduce re-renders.
// Controlled inputs preserve values across async submissions.
// ---------------------------------------------------------------------------

interface PasswordStepProps {
  error?: string
  loading: boolean
  onSubmit: (email: string, password: string) => Promise<void>
}

function PasswordStep({ error, loading, onSubmit }: PasswordStepProps) {
  // Controlled state preserves field values across submissions and errors.
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [validationError, setValidationError] = React.useState<string | null>(null)

  const isDisabled = loading

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    // Clear any prior validation message.
    setValidationError(null)

    // Client-side validation before hitting the network.
    if (!email.trim()) {
      setValidationError('Email is required.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setValidationError('Enter a valid email address.')
      return
    }
    if (!password) {
      setValidationError('Password is required.')
      return
    }

    void onSubmit(email.trim(), password)
  }

  // Combine server-side API error with client-side validation error.
  const displayError = validationError ?? error

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in to CoinFrenzy admin</CardTitle>
        <CardDescription>Use your operator email and password.</CardDescription>
      </CardHeader>
      <CardContent>
        {/*
         * aria-live="polite" announces error changes to screen readers without
         * interrupting their current narration.
         */}
        <div aria-live="polite" aria-atomic="true">
          {displayError ? <ErrorBanner message={displayError} /> : null}
        </div>

        <form
          id="admin-login-form"
          onSubmit={handleSubmit}
          className="mt-2 space-y-4"
          noValidate
          aria-busy={loading}
        >
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              aria-describedby={displayError ? 'login-error' : undefined}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              aria-describedby={displayError ? 'login-error' : undefined}
            />
          </div>

          <Button
            id="admin-login-submit"
            type="submit"
            className="w-full"
            disabled={isDisabled}
            aria-disabled={isDisabled}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Validating user data…
              </>
            ) : (
              'Continue'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// CodeForm – shared TOTP / backup-code entry used in setup_2fa and verify_2fa.
// ---------------------------------------------------------------------------

interface CodeFormProps {
  label: string
  onSubmit: (code: string) => Promise<void>
  loading: boolean
  error?: string
}

function CodeForm({ label, onSubmit, loading, error }: CodeFormProps) {
  // Preserve the entered code across error responses so the user can correct
  // a single digit without re-typing the whole sequence.
  const [code, setCode] = React.useState('')

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = code.trim()
    if (!trimmed) return
    void onSubmit(trimmed)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-busy={loading}>
      <div aria-live="polite" aria-atomic="true">
        {error ? <ErrorBanner message={error} /> : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="code">{label}</Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={12}
          required
          autoFocus
          className="font-mono text-center text-lg tracking-[0.4em]"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={loading}
        />
      </div>

      <Button
        id="admin-2fa-submit"
        type="submit"
        className="w-full"
        disabled={loading}
        aria-disabled={loading}
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            Verifying…
          </>
        ) : (
          'Verify'
        )}
      </Button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// ErrorBanner
// ---------------------------------------------------------------------------

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      id="login-error"
      role="alert"
      className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
      {message}
    </div>
  )
}

// ---------------------------------------------------------------------------
// humanizeError – maps server error codes to user-friendly messages
// ---------------------------------------------------------------------------

function humanizeError(code: string): string {
  switch (code) {
    case 'invalid_credentials':
      return 'Email or password is incorrect.'
    case 'account_suspended':
      return 'This account has been suspended. Contact a master admin.'
    case 'account_terminated':
      return 'This account has been terminated.'
    case 'no_roles':
      return 'No roles assigned. Contact a master admin.'
    case 'invalid_pending':
      return 'Your sign-in step expired. Please start over.'
    case 'invalid_code':
      return 'That code is invalid or expired. Try again.'
    case 'totp_already_enabled':
      return '2FA is already enabled. Please verify with your authenticator.'
    case 'turnstile_required':
      return 'Security challenge is required. Please complete the verification below.'
    case 'turnstile_failed':
      return 'Security challenge failed. Please try again.'
    case 'server_misconfigured':
      return 'Server is missing ADMIN_SESSION_SECRET. Tell engineering.'
    case 'ip_changed':
      return 'Your network changed mid-login. Please start over.'
    default:
      return `Sign-in failed (${code}).`
  }
}
