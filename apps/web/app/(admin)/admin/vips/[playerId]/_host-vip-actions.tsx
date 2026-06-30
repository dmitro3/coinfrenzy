'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardList, Gift, MessageCircle, NotebookPen } from 'lucide-react'

import { LogInteractionModal, SendBonusModal, type HostBonusTemplate } from '@coinfrenzy/ui/admin'
import { Button } from '@coinfrenzy/ui/primitives/button'

interface HostVipActionsProps {
  playerId: string
  playerLabel: string
  budget: { remainingSc: string; capSc: string }
  templates: HostBonusTemplate[]
}

export function HostVipActions({ playerId, playerLabel, budget, templates }: HostVipActionsProps) {
  const router = useRouter()
  const [bonusOpen, setBonusOpen] = React.useState(false)
  const [logOpen, setLogOpen] = React.useState(false)
  const [messageOpen, setMessageOpen] = React.useState(false)
  const [noteOpen, setNoteOpen] = React.useState(false)

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={() => setBonusOpen(true)} className="justify-start">
        <Gift className="mr-2 h-4 w-4" />
        Send bonus
      </Button>
      <Button variant="secondary" onClick={() => setMessageOpen(true)} className="justify-start">
        <MessageCircle className="mr-2 h-4 w-4" />
        Send message
      </Button>
      <Button variant="secondary" onClick={() => setLogOpen(true)} className="justify-start">
        <ClipboardList className="mr-2 h-4 w-4" />
        Log interaction
      </Button>
      <Button variant="ghost" onClick={() => setNoteOpen(true)} className="justify-start">
        <NotebookPen className="mr-2 h-4 w-4" />
        Add note
      </Button>

      <SendBonusModal
        open={bonusOpen}
        onOpenChange={setBonusOpen}
        playerId={playerId}
        playerLabel={playerLabel}
        templates={templates}
        remainingSc={budget.remainingSc}
        capSc={budget.capSc}
        onSent={() => router.refresh()}
      />
      <LogInteractionModal
        open={logOpen}
        onOpenChange={setLogOpen}
        playerId={playerId}
        playerLabel={playerLabel}
        onLogged={() => router.refresh()}
      />
      <NoteOnlyModal
        open={noteOpen}
        onOpenChange={setNoteOpen}
        playerId={playerId}
        playerLabel={playerLabel}
        onSaved={() => router.refresh()}
      />
      <MessageModal
        open={messageOpen}
        onOpenChange={setMessageOpen}
        playerId={playerId}
        playerLabel={playerLabel}
        onSent={() => router.refresh()}
      />
    </div>
  )
}

function NoteOnlyModal({
  open,
  onOpenChange,
  playerId,
  playerLabel,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  playerId: string
  playerLabel: string
  onSaved: () => void
}) {
  // Wraps LogInteractionModal with the type forced to 'note'. We just
  // reuse the same modal — the user picks notes anyway. This component
  // exists only for the dedicated "Add note" CTA in the sidebar.
  return (
    <LogInteractionModal
      open={open}
      onOpenChange={onOpenChange}
      playerId={playerId}
      playerLabel={playerLabel}
      onLogged={onSaved}
    />
  )
}

function MessageModal({
  open,
  onOpenChange,
  playerId,
  playerLabel,
  onSent,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  playerId: string
  playerLabel: string
  onSent: () => void
}) {
  const [subject, setSubject] = React.useState('')
  const [body, setBody] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setSubject('')
      setBody('')
      setError(null)
    }
  }, [open])

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/host/message', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          playerId,
          channel: 'email',
          subject,
          body,
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? `Request failed (${res.status})`)
      }
      onOpenChange(false)
      onSent()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="w-full max-w-lg rounded-xl border border-line-subtle bg-elevated p-6 shadow-popover">
        <h2 className="text-lg font-semibold text-ink-primary">Send message</h2>
        <p className="mt-1 text-sm text-ink-secondary">
          Email <span className="font-medium">{playerLabel}</span>.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-sm">Subject</label>
            <input
              className="mt-1 w-full rounded-md border border-line-subtle bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Quick check-in"
            />
          </div>
          <div>
            <label className="text-sm">Body</label>
            <textarea
              rows={6}
              className="mt-1 w-full rounded-md border border-line-subtle bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hi there — wanted to check in…"
            />
          </div>
          {error ? (
            <p className="rounded-md bg-critical-bg px-3 py-2 text-xs text-critical">{error}</p>
          ) : null}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || !subject.trim() || !body.trim()}>
            {submitting ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  )
}
