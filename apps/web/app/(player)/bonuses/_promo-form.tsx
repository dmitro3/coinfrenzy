'use client'

import * as React from 'react'

import { Button } from '@coinfrenzy/ui/primitives/button'
import { Input } from '@coinfrenzy/ui/primitives/input'

const ERROR_MESSAGES: Record<string, string> = {
  CODE_NOT_FOUND: "We couldn't find that code.",
  CODE_INACTIVE: 'That code is inactive.',
  CODE_NOT_YET_VALID: "That code isn't active yet — try again later.",
  CODE_EXPIRED: 'That code has expired.',
  CODE_USAGE_EXCEEDED: 'That code has reached its usage limit.',
  PLAYER_CODE_USAGE_EXCEEDED: "You've already redeemed that code.",
  CODE_REQUIRES_CONTEXT: 'That code can only be used in checkout.',
  BLOCKED_DOMAIN: 'That code is not eligible for your account.',
  BLOCKED_CODE: 'That code is no longer available.',
}

export function PromoCodeRedeemForm() {
  const [code, setCode] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [result, setResult] = React.useState<{ ok: boolean; message: string } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    setSubmitting(true)
    setResult(null)
    try {
      const res = await fetch('/api/player/promo/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), context: 'standalone' }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string; awardStatus?: string }
      if (!res.ok) {
        setResult({
          ok: false,
          message: body.error ? (ERROR_MESSAGES[body.error] ?? body.error) : 'Redemption failed.',
        })
      } else {
        setResult({
          ok: true,
          message:
            body.awardStatus === 'duplicate'
              ? "Already redeemed — you've claimed this code before."
              : 'Code redeemed — your bonus is now active.',
        })
        setCode('')
        if (body.awardStatus === 'awarded') {
          // Refresh so the new bonus shows up in the list.
          setTimeout(() => window.location.reload(), 800)
        }
      }
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : 'Network error' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card p-4 sm:flex-row sm:items-center"
    >
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="ENTER CODE"
        maxLength={64}
        className="flex-1 font-mono uppercase"
      />
      <Button type="submit" disabled={submitting || !code.trim()}>
        {submitting ? 'Redeeming…' : 'Redeem'}
      </Button>
      {result && (
        <p className={`text-xs sm:ml-3 ${result.ok ? 'text-emerald-500' : 'text-destructive'}`}>
          {result.message}
        </p>
      )}
    </form>
  )
}
