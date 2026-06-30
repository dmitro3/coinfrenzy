'use client'

import * as React from 'react'

import { Button } from '../../primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../primitives/dialog'
import { Label } from '../../primitives/label'

// M4 — Host log-interaction modal. Used by hosts to record a phone call,
// text, in-person meeting, etc. Submission posts to /api/admin/host/interaction.
//
// We pin the interaction_type enum (DB constraint) to the original five
// values, then capture the actual platform used as `metadata.channel`.
// This lets hosts log "WhatsApp" vs "Telegram" vs "SMS" without forcing
// a schema migration, and the senior dev can promote the column later.

export type InteractionType = 'call' | 'text' | 'email' | 'in_person' | 'note'
export type InteractionOutcome = 'positive' | 'neutral' | 'negative' | 'no_response'
export type InteractionChannel =
  | 'whatsapp'
  | 'telegram'
  | 'sms'
  | 'imessage'
  | 'signal'
  | 'company_phone'
  | 'other'

const TYPES: { value: InteractionType; label: string }[] = [
  { value: 'text', label: 'Text / chat' },
  { value: 'call', label: 'Phone call' },
  { value: 'email', label: 'Email' },
  { value: 'in_person', label: 'In person' },
  { value: 'note', label: 'Note only' },
]

const OUTCOMES: { value: InteractionOutcome; label: string }[] = [
  { value: 'positive', label: 'Positive' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'negative', label: 'Negative' },
  { value: 'no_response', label: 'No response' },
]

/** Channels we present in the picker when the type is "text" or "call".
 * The labels match operator vocabulary, not API IDs. */
const CHANNELS_FOR_TEXT: { value: InteractionChannel; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'sms', label: 'SMS' },
  { value: 'imessage', label: 'iMessage' },
  { value: 'signal', label: 'Signal' },
  { value: 'other', label: 'Other' },
]

const CHANNELS_FOR_CALL: { value: InteractionChannel; label: string }[] = [
  { value: 'company_phone', label: 'Company phone' },
  { value: 'whatsapp', label: 'WhatsApp call' },
  { value: 'telegram', label: 'Telegram call' },
  { value: 'signal', label: 'Signal call' },
  { value: 'other', label: 'Other' },
]

interface LogInteractionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  playerId: string
  playerLabel: string
  /** Endpoint to POST the interaction to. Default: /api/admin/host/interaction */
  endpoint?: string
  onLogged?: () => void
}

export function LogInteractionModal({
  open,
  onOpenChange,
  playerId,
  playerLabel,
  endpoint = '/api/admin/host/interaction',
  onLogged,
}: LogInteractionModalProps) {
  const [type, setType] = React.useState<InteractionType>('text')
  const [channel, setChannel] = React.useState<InteractionChannel>('whatsapp')
  const [outcome, setOutcome] = React.useState<InteractionOutcome>('positive')
  const [notes, setNotes] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setType('text')
      setChannel('whatsapp')
      setOutcome('positive')
      setNotes('')
      setError(null)
    }
  }, [open])

  // Channel only applies to text + call. Keep the value coherent when
  // the type changes (e.g. picking 'call' should default to company_phone).
  React.useEffect(() => {
    if (type === 'call') setChannel('company_phone')
    else if (type === 'text') setChannel('whatsapp')
  }, [type])

  const channelChoices =
    type === 'text' ? CHANNELS_FOR_TEXT : type === 'call' ? CHANNELS_FOR_CALL : null

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          playerId,
          type,
          outcome,
          notes: notes.trim() || null,
          metadata: channelChoices ? { channel } : undefined,
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? `Request failed (${res.status})`)
      }
      onLogged?.()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log interaction</DialogTitle>
          <DialogDescription>
            Quick record of your touchpoint with <span className="font-medium">{playerLabel}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-sm">Type</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={
                    'rounded-md border px-3 py-1.5 text-xs transition-colors ' +
                    (type === t.value
                      ? 'border-brand bg-brand-bg text-brand'
                      : 'border-line-subtle text-ink-secondary hover:bg-surface-hover hover:text-ink-primary')
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {channelChoices && (
            <div>
              <Label className="text-sm">Channel</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {channelChoices.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setChannel(c.value)}
                    className={
                      'rounded-md border px-3 py-1.5 text-xs transition-colors ' +
                      (channel === c.value
                        ? 'border-brand bg-brand-bg text-brand'
                        : 'border-line-subtle text-ink-secondary hover:bg-surface-hover hover:text-ink-primary')
                    }
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label className="text-sm">Outcome</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {OUTCOMES.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setOutcome(o.value)}
                  className={
                    'rounded-md border px-3 py-1.5 text-xs transition-colors ' +
                    (outcome === o.value
                      ? 'border-brand bg-brand-bg text-brand'
                      : 'border-line-subtle text-ink-secondary hover:bg-surface-hover hover:text-ink-primary')
                  }
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="interaction-notes" className="text-sm">
              Notes
            </Label>
            <textarea
              id="interaction-notes"
              className="mt-2 w-full rounded-md border border-line-subtle bg-surface px-3 py-2 text-sm placeholder:text-ink-tertiary focus:outline-none focus:ring-1 focus:ring-brand"
              rows={4}
              placeholder="Brief summary of the conversation, next steps, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error ? (
            <p className="rounded-md bg-critical-bg px-3 py-2 text-xs text-critical">{error}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? 'Logging…' : 'Log interaction'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
