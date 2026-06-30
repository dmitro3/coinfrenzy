'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Check, ShieldCheck } from 'lucide-react'

import { Button } from '@coinfrenzy/ui/primitives/button'
import { Input } from '@coinfrenzy/ui/primitives/input'
import { Label } from '@coinfrenzy/ui/primitives/label'

// Self-service password change for the logged-in admin. Talks to
// /api/admin/auth/change-password — server-side enforces min length 12 and
// re-verifies the current password.

interface FormState {
  current: string
  next: string
  confirm: string
}

const empty: FormState = { current: '', next: '', confirm: '' }

export function PasswordChangeForm() {
  const router = useRouter()
  const [form, setForm] = React.useState<FormState>(empty)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState(false)

  const nextMismatch = form.next.length > 0 && form.confirm.length > 0 && form.next !== form.confirm
  const tooShort = form.next.length > 0 && form.next.length < 12
  const reused = form.next.length >= 12 && form.next === form.current
  const canSubmit =
    form.current.length > 0 && form.next.length >= 12 && form.next === form.confirm && !reused

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    setSuccess(false)
    try {
      const res = await fetch('/api/admin/auth/change-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          currentPassword: form.current,
          newPassword: form.next,
          confirmPassword: form.confirm,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        throw new Error(humanError(data.error) ?? `Request failed (${res.status})`)
      }
      setForm(empty)
      setSuccess(true)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="grid grid-cols-1 gap-3">
        <div>
          <Label htmlFor="current-pw" className="text-sm">
            Current password
          </Label>
          <Input
            id="current-pw"
            type="password"
            autoComplete="current-password"
            className="mt-1"
            value={form.current}
            onChange={(e) => setForm((f) => ({ ...f, current: e.target.value }))}
          />
        </div>
        <div>
          <Label htmlFor="new-pw" className="text-sm">
            New password
          </Label>
          <Input
            id="new-pw"
            type="password"
            autoComplete="new-password"
            className="mt-1"
            value={form.next}
            onChange={(e) => setForm((f) => ({ ...f, next: e.target.value }))}
          />
          <p
            className={`mt-1 text-xs ${tooShort ? 'text-critical' : 'text-ink-tertiary'}`}
            aria-live="polite"
          >
            Minimum 12 characters.
          </p>
        </div>
        <div>
          <Label htmlFor="confirm-pw" className="text-sm">
            Confirm new password
          </Label>
          <Input
            id="confirm-pw"
            type="password"
            autoComplete="new-password"
            className="mt-1"
            value={form.confirm}
            onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
          />
          {nextMismatch ? (
            <p className="mt-1 text-xs text-critical">Passwords don&rsquo;t match.</p>
          ) : null}
          {reused ? (
            <p className="mt-1 text-xs text-critical">New password must differ from the current.</p>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="rounded-md bg-critical-bg px-3 py-2 text-xs text-critical">{error}</p>
      ) : null}
      {success ? (
        <p className="flex items-center gap-2 rounded-md bg-positive-bg px-3 py-2 text-xs text-positive">
          <Check className="h-3.5 w-3.5" />
          Password updated. Future sessions use the new password.
        </p>
      ) : null}

      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs text-ink-tertiary">
          <ShieldCheck className="h-3.5 w-3.5" />
          Audited as <span className="font-mono">admin.password.changed</span>.
        </p>
        <Button type="submit" disabled={!canSubmit || submitting}>
          {submitting ? 'Updating…' : 'Update password'}
        </Button>
      </div>
    </form>
  )
}

function humanError(code: string | undefined): string | null {
  switch (code) {
    case 'invalid_current_password':
      return 'Current password is incorrect.'
    case 'password_mismatch':
      return 'New password and confirmation do not match.'
    case 'password_unchanged':
      return 'New password must be different from your current password.'
    case 'invalid_input':
      return 'Password must be at least 12 characters.'
    default:
      return null
  }
}
