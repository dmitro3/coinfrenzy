'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@coinfrenzy/ui/primitives/button'
import { Input } from '@coinfrenzy/ui/primitives/input'
import { VerifyIdentityButton } from '@coinfrenzy/ui/player'

import { formatCoins, formatUsd } from '@/lib/format'

interface InstrumentRow {
  id: string
  type: string
  displayName: string | null
  bankName: string | null
  accountLast4: string | null
  cardBrand: string | null
  cardLast4: string | null
  plaidValidationStatus: string | null
}

interface RedeemFormProps {
  kycVerified: boolean
  blockedSC: boolean
  redeemable: bigint
  instruments: InstrumentRow[]
}

// docs/10 §4.2 — Redemption form. The amount input is treated as SC (which
// 1:1 maps to USD), so we render both side by side.

export function RedeemForm({ kycVerified, blockedSC, redeemable, instruments }: RedeemFormProps) {
  const router = useRouter()
  const [amount, setAmount] = React.useState('20')
  const [method, setMethod] = React.useState<'finix_ach' | 'apt_debit'>('finix_ach')
  const [instrumentId, setInstrumentId] = React.useState<string | null>(
    instruments.find((i) => i.type === 'bank_account')?.id ?? null,
  )
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [okMessage, setOkMessage] = React.useState<string | null>(null)

  const bankInstruments = instruments.filter((i) => i.type === 'bank_account')
  const debitInstruments = instruments.filter((i) => i.type === 'debit_card')

  const disabled = blockedSC

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setOkMessage(null)
    if (!kycVerified) {
      setError('Verify your identity before redeeming.')
      return
    }
    if (method === 'finix_ach' && !instrumentId) {
      setError('Add or select a bank account first.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/player/redemptions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          amountSc: amount,
          method,
          paymentInstrumentId: method === 'finix_ach' ? instrumentId : null,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (body.error === 'ineligible') {
          setError(prettifyEligibility(body.reason as string))
        } else {
          setError(body.error ?? `HTTP ${res.status}`)
        }
        return
      }
      setOkMessage(
        body.redemption?.status === 'approved'
          ? 'Approved — submitting to your bank now.'
          : body.redemption?.status === 'kyc_pending'
            ? 'Saved — finish identity verification to send for review.'
            : 'Submitted for cashier review.',
      )
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mt-6 space-y-4 rounded-lg border border-border/60 bg-card p-4"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Amount to redeem
          </label>
          <div className="mt-1 flex items-center gap-2">
            <Input
              type="number"
              step="0.01"
              min="1"
              max={Number(redeemable / 10_000n)}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={disabled}
              className="text-base"
              data-numeric="true"
            />
            <span className="text-sm text-muted-foreground">SC</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            ≈ {formatUsd(parseAmount(amount))} · max {formatCoins(redeemable)} SC
          </p>
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Method
          </label>
          <select
            className="mt-1 block h-10 w-full rounded-md border border-border/60 bg-background px-2 text-sm"
            value={method}
            onChange={(e) => setMethod(e.target.value as 'finix_ach' | 'apt_debit')}
            disabled={disabled}
          >
            <option value="finix_ach">Bank transfer (ACH)</option>
            <option value="apt_debit">Debit card (APT)</option>
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            {method === 'finix_ach' ? '1–3 business days' : 'Instant (where supported)'}
          </p>
        </div>
      </div>

      {method === 'finix_ach' ? (
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Bank account
          </label>
          {bankInstruments.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              You haven&apos;t linked a bank yet — that flow lands in the cashier integration setup.
              Until then please contact support to link one.
            </p>
          ) : (
            <select
              className="mt-1 block h-10 w-full rounded-md border border-border/60 bg-background px-2 text-sm"
              value={instrumentId ?? ''}
              onChange={(e) => setInstrumentId(e.target.value || null)}
              disabled={disabled}
            >
              <option value="">— select —</option>
              {bankInstruments.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.bankName ?? 'Bank'} ****{i.accountLast4 ?? '----'}
                  {i.plaidValidationStatus !== 'valid' ? ' (pending validation)' : ''}
                </option>
              ))}
            </select>
          )}
        </div>
      ) : (
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Debit card
          </label>
          {debitInstruments.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              APT integration ships in v1 once the operator wires the credentials. For now, please
              use ACH.
            </p>
          ) : (
            <select
              className="mt-1 block h-10 w-full rounded-md border border-border/60 bg-background px-2 text-sm"
              value={instrumentId ?? ''}
              onChange={(e) => setInstrumentId(e.target.value || null)}
              disabled={disabled}
            >
              <option value="">— select —</option>
              {debitInstruments.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.cardBrand ?? 'Card'} ****{i.cardLast4 ?? '----'}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {error ? (
        <div className="space-y-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <div>{error}</div>
          {needsKyc(error) ? (
            <VerifyIdentityButton
              reason="Required to redeem Sweepstakes Coins"
              label="Verify identity now"
              variant="pill"
            />
          ) : null}
        </div>
      ) : null}
      {okMessage ? (
        <div className="rounded border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">
          {okMessage}
        </div>
      ) : null}

      <Button type="submit" disabled={disabled || submitting}>
        {submitting ? 'Submitting…' : 'Request redemption'}
      </Button>
    </form>
  )
}

// Pattern-match the human-readable error strings produced below to
// decide whether to surface the verification CTA inline. Keeps the
// detection in one place even if copy moves around.
function needsKyc(message: string): boolean {
  const lower = message.toLowerCase()
  return lower.includes('verify') || lower.includes('kyc level')
}

function parseAmount(raw: string): bigint {
  if (!raw || Number.isNaN(Number(raw))) return 0n
  const [whole = '0', frac = ''] = raw.split('.')
  const fracPadded = frac.padEnd(4, '0').slice(0, 4)
  return BigInt(whole) * 10_000n + BigInt(fracPadded || '0')
}

function prettifyEligibility(code: string): string {
  switch (code) {
    case 'KYC_LEVEL_INSUFFICIENT':
      return 'Your KYC level is too low for this amount. Verify your identity or request a smaller amount.'
    case 'INSUFFICIENT_REDEEMABLE_BALANCE':
      return 'You do not have enough redeemable Sweepstakes Coins to cover this request.'
    case 'AMOUNT_BELOW_MINIMUM':
      return 'Minimum redemption is $1.'
    case 'AMOUNT_ABOVE_MAXIMUM':
      return 'Single-request maximum exceeded. Split into multiple redemptions.'
    case 'DAILY_LIMIT_EXCEEDED':
      return 'Daily redemption limit reached. Try again tomorrow.'
    case 'WEEKLY_LIMIT_EXCEEDED':
      return 'Weekly redemption limit reached.'
    case 'PAYMENT_INSTRUMENT_NOT_FOUND':
    case 'PAYMENT_INSTRUMENT_DISABLED':
    case 'BANK_ACCOUNT_NOT_VALIDATED':
      return 'Selected bank account is not valid for redemption.'
    case 'COMPLIANCE_FLAG_ACTIVE':
      return 'Your account has an active compliance flag. Contact support.'
    case 'REGISTERED_STATE_BLOCKED':
    case 'CURRENT_LOCATION_BLOCKED':
      return 'Sweepstakes redemption is not available in your jurisdiction.'
    case 'VPN_DETECTED':
      return 'A VPN was detected on your connection. Disable it and try again.'
    case 'SELF_EXCLUDED':
      return 'Self-exclusion is active on your account.'
    case 'ACCOUNT_SUSPENDED':
    case 'ACCOUNT_CLOSED':
      return 'Your account is not eligible for redemptions. Contact support.'
    default:
      return `Redemption blocked: ${code.replace(/_/g, ' ').toLowerCase()}.`
  }
}
