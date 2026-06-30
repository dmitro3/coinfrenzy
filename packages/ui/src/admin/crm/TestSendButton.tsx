'use client'

import * as React from 'react'
import { Send, Check, AlertCircle } from 'lucide-react'

import { Button } from '../../primitives/button'
import { cn } from '../../lib/utils'

interface TestSendButtonProps {
  channel: 'email' | 'sms'
  templateId: string | null
  /**
   * Sample player to render the template against. The button is
   * disabled when this is null.
   */
  samplePlayerId: string | null
  /** Optional override; defaults to the admin's email/phone on file. */
  adminEmailOverride?: string
  adminPhoneOverride?: string
  /** Visual size — matches the admin Button primitive. */
  size?: 'default' | 'sm' | 'lg'
  /** Optional label override. */
  label?: string
  className?: string
  variant?: 'default' | 'outline' | 'ghost'
}

type Status = 'idle' | 'sending' | 'sent' | 'error'

/**
 * Universal "Send to me first" button. Drops onto every send-related
 * surface (template editors, campaign wizard, flow node config). Sends
 * to the current admin's email/phone (overridable), bypassing
 * suppression and frequency caps. Logs a `test_send` row in
 * crm_message_log so analytics can exclude it.
 */
export function TestSendButton({
  channel,
  templateId,
  samplePlayerId,
  adminEmailOverride,
  adminPhoneOverride,
  size = 'sm',
  label,
  className,
  variant = 'outline',
}: TestSendButtonProps) {
  const [status, setStatus] = React.useState<Status>('idle')
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)

  const disabled = !templateId || !samplePlayerId || status === 'sending'

  async function handle() {
    if (disabled) return
    setStatus('sending')
    setErrorMsg(null)
    try {
      const res = await fetch('/api/admin/crm/test-send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          channel,
          templateId,
          samplePlayerId,
          adminEmailOverride,
          adminPhoneOverride,
        }),
      })
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        setErrorMsg(json.error ?? `HTTP ${res.status}`)
        setStatus('error')
        return
      }
      setStatus('sent')
      window.setTimeout(() => setStatus('idle'), 2500)
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }

  const Icon = status === 'sent' ? Check : status === 'error' ? AlertCircle : Send

  const text =
    status === 'sending'
      ? 'Sending…'
      : status === 'sent'
        ? 'Sent to you'
        : status === 'error'
          ? 'Send failed'
          : (label ?? 'Send to me first')

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <Button
        type="button"
        size={size}
        variant={variant}
        onClick={handle}
        disabled={disabled}
        className={cn(
          status === 'sent' && 'border-emerald-500/40 text-emerald-400',
          status === 'error' && 'border-rose-500/40 text-rose-400',
        )}
      >
        <Icon className="mr-1.5 h-3.5 w-3.5" />
        {text}
      </Button>
      {status === 'error' && errorMsg ? (
        <span className="text-xs text-rose-400">{errorMsg}</span>
      ) : null}
    </span>
  )
}
