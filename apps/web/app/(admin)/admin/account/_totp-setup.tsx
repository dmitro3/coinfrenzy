'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, Copy, RefreshCcw, ShieldCheck } from 'lucide-react'

import { Button } from '@coinfrenzy/ui/primitives/button'
import { Input } from '@coinfrenzy/ui/primitives/input'
import { Label } from '@coinfrenzy/ui/primitives/label'

interface TotpSetupProps {
  enabled: boolean
}

type Stage = 'idle' | 'qr' | 'codes'

// Self-service TOTP enrollment + backup-code rotation for a logged-in
// admin. For first-time login enrollment, the flow at /admin/login uses
// the pending-token path; this component is for in-product setup
// (e.g. after `ADMIN_2FA_OPTIONAL=true` let the admin skip).

export function TotpSetup({ enabled }: TotpSetupProps) {
  const router = useRouter()
  const [stage, setStage] = React.useState<Stage>('idle')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [secret, setSecret] = React.useState<string | null>(null)
  const [qrUrl, setQrUrl] = React.useState<string | null>(null)
  const [code, setCode] = React.useState('')
  const [backupCodes, setBackupCodes] = React.useState<string[] | null>(null)

  async function begin() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/auth/totp/begin', { method: 'POST' })
      const data = (await res.json().catch(() => ({}))) as {
        secret?: string
        qrPngDataUrl?: string
        error?: string
      }
      if (!res.ok || !data.secret || !data.qrPngDataUrl) {
        throw new Error(data.error ?? `Request failed (${res.status})`)
      }
      setSecret(data.secret)
      setQrUrl(data.qrPngDataUrl)
      setCode('')
      setStage('qr')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function confirm() {
    if (!secret || code.length !== 6) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/auth/totp/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ secret, code }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        backupCodes?: string[]
        error?: string
      }
      if (!res.ok || !data.backupCodes) {
        throw new Error(
          data.error === 'invalid_code'
            ? 'Code did not match. Try again.'
            : (data.error ?? `Request failed (${res.status})`),
        )
      }
      setBackupCodes(data.backupCodes)
      setStage('codes')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (enabled) {
    return <RegenerateBackupCodes />
  }

  return (
    <div className="space-y-4">
      {stage === 'idle' ? (
        <>
          <div className="flex items-start gap-3 rounded-md bg-attention-bg px-3 py-2.5 text-xs text-attention">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              Two-factor authentication is not enabled on this account. Adding it takes about a
              minute and protects against stolen passwords.
            </p>
          </div>
          <Button onClick={begin} disabled={busy}>
            {busy ? 'Loading…' : 'Set up two-factor authentication'}
          </Button>
        </>
      ) : null}

      {stage === 'qr' && qrUrl && secret ? (
        <>
          <ol className="space-y-3 text-sm text-ink-secondary">
            <li>
              <p className="font-medium text-ink-primary">1. Scan the QR code</p>
              <p className="text-xs">
                Use Google Authenticator, 1Password, Authy, or any TOTP app.
              </p>
              <div className="mt-2 inline-block rounded-md border border-line-subtle bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrUrl} alt="TOTP QR code" width={180} height={180} />
              </div>
              <details className="mt-2 text-xs text-ink-tertiary">
                <summary className="cursor-pointer hover:text-ink-secondary">
                  Can&rsquo;t scan? Enter the secret manually
                </summary>
                <code className="mt-1 inline-block break-all rounded-sm bg-elevated px-2 py-1 font-mono text-[11px]">
                  {secret}
                </code>
              </details>
            </li>
            <li>
              <p className="font-medium text-ink-primary">2. Enter the 6-digit code</p>
              <div className="mt-2 flex items-center gap-2">
                <Label htmlFor="totp-code" className="sr-only">
                  6-digit code
                </Label>
                <Input
                  id="totp-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  className="w-32 font-mono tracking-widest"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                />
                <Button onClick={confirm} disabled={busy || code.length !== 6}>
                  {busy ? 'Verifying…' : 'Verify & enable'}
                </Button>
                <Button variant="ghost" onClick={() => setStage('idle')} disabled={busy}>
                  Cancel
                </Button>
              </div>
            </li>
          </ol>
          {error ? (
            <p className="rounded-md bg-critical-bg px-3 py-2 text-xs text-critical">{error}</p>
          ) : null}
        </>
      ) : null}

      {stage === 'codes' && backupCodes ? (
        <BackupCodesDisplay codes={backupCodes} title="Two-factor authentication is now active." />
      ) : null}

      {stage === 'idle' && error ? (
        <p className="rounded-md bg-critical-bg px-3 py-2 text-xs text-critical">{error}</p>
      ) : null}
    </div>
  )
}

function RegenerateBackupCodes() {
  const [open, setOpen] = React.useState(false)
  const [code, setCode] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [newCodes, setNewCodes] = React.useState<string[] | null>(null)

  async function submit() {
    if (code.length !== 6) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/auth/totp/regenerate-codes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        backupCodes?: string[]
        error?: string
      }
      if (!res.ok || !data.backupCodes) {
        throw new Error(
          data.error === 'invalid_code'
            ? 'Code did not match. Try again.'
            : (data.error ?? `Request failed (${res.status})`),
        )
      }
      setNewCodes(data.backupCodes)
      setCode('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (newCodes) {
    return (
      <BackupCodesDisplay
        codes={newCodes}
        title="New backup codes generated. Old codes are no longer valid."
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 rounded-md bg-positive-bg px-3 py-2.5 text-xs text-positive">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>Two-factor authentication is enabled. Codes are required on every fresh sign-in.</p>
      </div>
      {!open ? (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <RefreshCcw className="mr-2 h-4 w-4" />
          Regenerate backup codes
        </Button>
      ) : (
        <div className="space-y-3 rounded-md border border-line-subtle bg-surface px-4 py-3">
          <p className="text-sm text-ink-secondary">
            Enter a current 6-digit code to invalidate your old backup codes and generate a new set.
          </p>
          <div className="flex items-center gap-2">
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              className="w-32 font-mono tracking-widest"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
            />
            <Button onClick={submit} disabled={busy || code.length !== 6}>
              {busy ? 'Generating…' : 'Generate new codes'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false)
                setCode('')
                setError(null)
              }}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
          {error ? (
            <p className="rounded-md bg-critical-bg px-3 py-2 text-xs text-critical">{error}</p>
          ) : null}
        </div>
      )}
    </div>
  )
}

function BackupCodesDisplay({ codes, title }: { codes: string[]; title: string }) {
  const [copied, setCopied] = React.useState(false)
  const text = codes.join('\n')

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API may not be available in all browsers/contexts;
      // user can copy manually from the visible block.
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-attention/40 bg-attention-bg px-4 py-3">
      <div className="flex items-start gap-2">
        <Check className="mt-0.5 h-4 w-4 text-attention" />
        <div className="flex-1">
          <p className="text-sm font-medium text-attention">{title}</p>
          <p className="mt-1 text-xs text-ink-secondary">
            Save these one-time backup codes in your password manager. We won&rsquo;t show them
            again. Each can be used exactly once if you lose your authenticator app.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {codes.map((c) => (
          <code
            key={c}
            className="rounded-sm bg-elevated px-2 py-1.5 text-center font-mono text-sm tracking-widest text-ink-primary"
          >
            {c}
          </code>
        ))}
      </div>
      <Button variant="secondary" onClick={copy}>
        <Copy className="mr-2 h-4 w-4" />
        {copied ? 'Copied!' : 'Copy all codes'}
      </Button>
    </div>
  )
}
