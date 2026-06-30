'use client'

import * as React from 'react'
import { Eye, EyeOff, Lock } from 'lucide-react'

import { cn } from '@coinfrenzy/ui/lib/utils'
import { GoldButton, useToast } from '@coinfrenzy/ui/player'

// Reset Your Password form — matches the live coinfrenzy.com /settings
// Password tab. Three password fields (Old / New / Confirm) each with
// a click-to-reveal eye icon. The Update button stays disabled until
// the form satisfies the basic client-side checks (non-empty, new !==
// old, new === confirm, ≥ 8 chars). On submit we POST to the existing
// auth route; if it doesn't exist yet, the form surfaces the error
// without crashing the page.

interface FormState {
  status: 'idle' | 'submitting' | 'success' | 'error'
  message?: string
}

export function PasswordForm() {
  const [state, setState] = React.useState<FormState>({ status: 'idle' })
  const [oldPw, setOldPw] = React.useState('')
  const [newPw, setNewPw] = React.useState('')
  const [confirmPw, setConfirmPw] = React.useState('')
  const toast = useToast()

  const validation = validate(oldPw, newPw, confirmPw)
  const canSubmit = state.status !== 'submitting' && validation.ok

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return
    setState({ status: 'submitting' })
    try {
      // Better Auth ships a built-in change-password endpoint on the
      // catch-all `/api/auth/*` route. Body shape comes from the
      // email-and-password plugin: { currentPassword, newPassword }.
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          currentPassword: oldPw,
          newPassword: newPw,
          revokeOtherSessions: false,
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
        const message =
          body.message ?? body.error ?? 'We couldn’t update your password. Try again in a moment.'
        setState({ status: 'error', message })
        toast.error(message, { title: 'Password not updated' })
        return
      }
      setState({ status: 'success', message: 'Password updated.' })
      toast.success('Your password has been updated.', { title: 'Saved' })
      setOldPw('')
      setNewPw('')
      setConfirmPw('')
    } catch {
      setState({ status: 'error', message: 'Connection problem — please retry.' })
      toast.error('Connection problem — please retry.', { title: 'Password not updated' })
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <header className="flex items-center gap-2">
        <Lock className="h-4 w-4 text-[var(--cf-gold-light)]" />
        <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-white">
          Reset Your Password
        </h2>
      </header>

      <PasswordField
        id="old-password"
        label="Old Password"
        value={oldPw}
        onChange={setOldPw}
        placeholder="Enter current password"
        autoComplete="current-password"
      />
      <PasswordField
        id="new-password"
        label="New Password"
        value={newPw}
        onChange={setNewPw}
        placeholder="Enter new password"
        autoComplete="new-password"
        hint={validation.newHint}
      />
      <PasswordField
        id="confirm-password"
        label="Confirm New Password"
        value={confirmPw}
        onChange={setConfirmPw}
        placeholder="Confirm new password"
        autoComplete="new-password"
        hint={validation.confirmHint}
        error={Boolean(confirmPw) && newPw !== confirmPw}
      />

      {state.message && (
        <p
          className={cn(
            'rounded-md border px-3 py-2 text-xs',
            state.status === 'success'
              ? 'border-[var(--cf-green-bright)]/40 bg-[var(--cf-green-bright)]/10 text-[var(--cf-green-bright)]'
              : 'border-[var(--cf-red-primary)]/40 bg-[var(--cf-red-primary)]/10 text-[var(--cf-red-primary)]',
          )}
        >
          {state.message}
        </p>
      )}

      <GoldButton
        type="submit"
        variant="gold-horizontal"
        disabled={!canSubmit}
        className={cn(
          'cf-gold-gradient relative inline-flex h-10 items-center justify-center rounded-md px-6',
          'text-sm font-extrabold uppercase tracking-[0.16em] text-[#1a1300]',
          'transition-all duration-200',
          canSubmit
            ? 'hover:-translate-y-0.5 hover:shadow-[0_8px_22px_-8px_rgba(245,208,102,0.55)]'
            : 'cursor-not-allowed opacity-50',
        )}
      >
        {state.status === 'submitting' ? 'Updating…' : 'Update'}
      </GoldButton>
    </form>
  )
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  hint,
  error,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  autoComplete: string
  hint?: string | null
  error?: boolean
}) {
  const [revealed, setRevealed] = React.useState(false)
  return (
    <label htmlFor={id} className="block">
      <span className="block text-xs font-medium text-[var(--cf-gray-light)]">{label}</span>
      <span className="relative mt-1 block">
        <input
          id={id}
          type={revealed ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className={cn(
            'h-11 w-full rounded-md border bg-[var(--cf-bg-base)] px-3 pr-10 text-sm text-white',
            'placeholder:text-[var(--cf-gray-light)]/70 focus:outline-none',
            'transition-colors duration-150',
            error
              ? 'border-[var(--cf-red-primary)]/70 focus:border-[var(--cf-red-primary)]'
              : 'border-[var(--cf-border-default)] focus:border-[var(--cf-gold-medium)]',
          )}
        />
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          aria-label={revealed ? `Hide ${label}` : `Show ${label}`}
          className="absolute inset-y-0 right-2 grid place-items-center text-[var(--cf-gray-light)] hover:text-[var(--cf-gold-light)]"
        >
          {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </span>
      {hint ? (
        <span
          className={cn(
            'mt-1 block text-[11px]',
            error ? 'text-[var(--cf-red-primary)]' : 'text-[var(--cf-gray-light)]',
          )}
        >
          {hint}
        </span>
      ) : null}
    </label>
  )
}

function validate(
  oldPw: string,
  newPw: string,
  confirmPw: string,
): {
  ok: boolean
  newHint?: string | null
  confirmHint?: string | null
} {
  let newHint: string | null = null
  let confirmHint: string | null = null
  if (newPw && newPw.length < 8) newHint = 'Use at least 8 characters.'
  else if (newPw && oldPw && newPw === oldPw)
    newHint = 'Choose a password different from your current one.'
  if (confirmPw && newPw !== confirmPw) confirmHint = 'Passwords don’t match.'
  const ok = Boolean(
    oldPw && newPw && confirmPw && newPw.length >= 8 && newPw !== oldPw && newPw === confirmPw,
  )
  return { ok, newHint, confirmHint }
}
