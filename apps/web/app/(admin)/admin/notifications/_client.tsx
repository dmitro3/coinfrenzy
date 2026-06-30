'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, ExternalLink, Plus, Send, User } from 'lucide-react'

import { StatusPill, type StatusPillTone } from '@coinfrenzy/ui/admin'
import { Button } from '@coinfrenzy/ui/primitives/button'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@coinfrenzy/ui/primitives/dialog'
import { Input } from '@coinfrenzy/ui/primitives/input'
import { Label } from '@coinfrenzy/ui/primitives/label'

const PRIORITY_TONE: Record<string, StatusPillTone> = {
  high: 'critical',
  normal: 'neutral',
  low: 'neutral',
}

export interface InboxRowProps {
  id: string
  playerId: string
  title: string
  body: string | null
  category: string | null
  priority: string
  readAtIso: string | null
  createdAtIso: string
  expiresAtIso: string | null
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function ComposeTrigger({ canCompose }: { canCompose: boolean }) {
  const [open, setOpen] = React.useState(false)
  if (!canCompose) {
    return (
      <Button disabled title="Requires marketing or manager role">
        <Plus className="mr-1 h-4 w-4" /> Compose
      </Button>
    )
  }
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" /> Compose
      </Button>
      <ComposeDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

function ComposeDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
}) {
  const router = useRouter()
  const [recipientKind, setRecipientKind] = React.useState<'player' | 'broadcast'>('player')
  const [toPlayerId, setToPlayerId] = React.useState('')
  const [title, setTitle] = React.useState('')
  const [body, setBody] = React.useState('')
  const [ctaUrl, setCtaUrl] = React.useState('')
  const [category, setCategory] = React.useState('')
  const [priority, setPriority] = React.useState<'low' | 'normal' | 'high'>('normal')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [confirmBroadcast, setConfirmBroadcast] = React.useState(false)

  React.useEffect(() => {
    if (!open) {
      setError(null)
      setConfirmBroadcast(false)
    }
  }, [open])

  const isBroadcast = recipientKind === 'broadcast'
  const disableSend =
    busy ||
    title.trim().length === 0 ||
    (recipientKind === 'player' && toPlayerId.trim().length === 0) ||
    (isBroadcast && !confirmBroadcast)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        body: body.trim() || undefined,
        ctaUrl: ctaUrl.trim() || undefined,
        category: category.trim() || undefined,
        priority,
      }
      if (recipientKind === 'player') {
        payload.toPlayerId = toPlayerId.trim()
      } else {
        payload.audience = 'all_active'
      }
      const res = await fetch('/api/admin/notifications/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json().catch(() => null)) as {
        recipientCount?: number
        firstId?: string
        error?: string
        details?: { reason?: string }
      } | null
      if (!res.ok) {
        const reason = data?.details?.reason ?? data?.error ?? 'failed'
        setError(reason)
        setBusy(false)
        return
      }
      onOpenChange(false)
      setTitle('')
      setBody('')
      setCtaUrl('')
      setCategory('')
      setToPlayerId('')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Compose in-app notification</DialogTitle>
          <DialogDescription>
            Notifications appear in the player&apos;s bell. Broadcasts hit every active player and
            are audited.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2 rounded-md border border-line-subtle bg-surface p-1">
            <button
              type="button"
              onClick={() => setRecipientKind('player')}
              className={`flex-1 rounded px-3 py-1.5 text-sm ${
                recipientKind === 'player'
                  ? 'bg-bg text-ink-primary'
                  : 'text-ink-tertiary hover:text-ink-secondary'
              }`}
            >
              <User className="mr-1 inline h-3 w-3" /> Single player
            </button>
            <button
              type="button"
              onClick={() => setRecipientKind('broadcast')}
              className={`flex-1 rounded px-3 py-1.5 text-sm ${
                recipientKind === 'broadcast'
                  ? 'bg-bg text-ink-primary'
                  : 'text-ink-tertiary hover:text-ink-secondary'
              }`}
            >
              <Send className="mr-1 inline h-3 w-3" /> Broadcast (all active)
            </button>
          </div>

          {recipientKind === 'player' ? (
            <div>
              <Label
                htmlFor="to-player-id"
                className="text-xs uppercase tracking-wide text-ink-tertiary"
              >
                Player UUID
              </Label>
              <Input
                id="to-player-id"
                value={toPlayerId}
                onChange={(e) => setToPlayerId(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
                className="font-mono"
              />
            </div>
          ) : (
            <div className="rounded-md border border-amber-700/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-100">
              This will write a notification row for every player with status active. Use sparingly
              — players cannot opt out of in-app pushes the way they can email/SMS.
            </div>
          )}

          <div>
            <Label
              htmlFor="notif-title"
              className="text-xs uppercase tracking-wide text-ink-tertiary"
            >
              Title
            </Label>
            <Input
              id="notif-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="🎉 Free SC just dropped"
            />
          </div>

          <div>
            <Label
              htmlFor="notif-body"
              className="text-xs uppercase tracking-wide text-ink-tertiary"
            >
              Body (optional, max 600)
            </Label>
            <textarea
              id="notif-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={600}
              rows={3}
              className="mt-1 w-full rounded-md border border-line-subtle bg-bg px-3 py-2 text-sm text-ink-primary"
              placeholder="Optional supporting text — shows below the title."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label
                htmlFor="notif-cta"
                className="text-xs uppercase tracking-wide text-ink-tertiary"
              >
                CTA URL (optional)
              </Label>
              <Input
                id="notif-cta"
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
                placeholder="/cashier"
              />
            </div>
            <div>
              <Label
                htmlFor="notif-category"
                className="text-xs uppercase tracking-wide text-ink-tertiary"
              >
                Category (optional)
              </Label>
              <Input
                id="notif-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="promo"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wide text-ink-tertiary">Priority</Label>
            <div className="flex gap-2">
              {(['low', 'normal', 'high'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`rounded-md border px-3 py-1.5 text-sm capitalize ${
                    priority === p
                      ? 'border-accent bg-surface text-ink-primary'
                      : 'border-line-subtle text-ink-tertiary hover:bg-surface-hover'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {isBroadcast ? (
            <label className="flex items-start gap-2 rounded-md border border-rose-700/40 bg-rose-950/20 px-3 py-2 text-xs text-rose-200">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={confirmBroadcast}
                onChange={(e) => setConfirmBroadcast(e.target.checked)}
              />
              I understand this broadcasts to every active player and is recorded in the audit log.
            </label>
          ) : null}

          {error ? <div className="text-sm text-rose-300">{error}</div> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={disableSend}>
            {busy ? 'Sending…' : isBroadcast ? 'Broadcast' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Inbox({ rows, openIdInitial }: { rows: InboxRowProps[]; openIdInitial: string | null }) {
  const [openId, setOpenId] = React.useState<string | null>(openIdInitial)
  return (
    <Card>
      <CardContent className="overflow-hidden p-0">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
            <Bell className="h-6 w-6 text-ink-tertiary" />
            <div className="text-sm font-medium text-ink-primary">No notifications</div>
            <div className="text-xs text-ink-tertiary">
              Compose your first one to see it appear here.
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-subtle bg-surface text-left text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">Player</th>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2">Priority</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Expires</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setOpenId(r.id)}
                  className="cursor-pointer border-b border-line-subtle last:border-b-0 hover:bg-surface-hover"
                >
                  <td className="px-4 py-3 text-xs text-ink-tertiary">
                    {fmtDateTime(r.createdAtIso)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink-primary">{r.title}</div>
                    {r.body ? (
                      <div className="line-clamp-1 text-xs text-ink-tertiary">{r.body}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-secondary">
                    <Link
                      href={`/admin/players/${r.playerId}`}
                      className="hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {r.playerId.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs uppercase tracking-wide text-ink-tertiary">
                    {r.category ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill
                      status="custom"
                      color={PRIORITY_TONE[r.priority] ?? 'neutral'}
                      label={r.priority}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill
                      status="custom"
                      color={r.readAtIso ? 'neutral' : 'positive'}
                      label={r.readAtIso ? 'Read' : 'Unread'}
                    />
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-tertiary">
                    {r.expiresAtIso ? fmtDateTime(r.expiresAtIso) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>

      <DetailDialog id={openId} onClose={() => setOpenId(null)} />
    </Card>
  )
}

interface NotificationDetail {
  id: string
  playerId: string
  title: string
  body: string | null
  ctaUrl: string | null
  category: string | null
  priority: string
  readAt: string | null
  createdAt: string
  expiresAt: string | null
  sourceKind: string | null
  sourceId: string | null
  playerEmail: string | null
  playerUsername: string | null
}

function DetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [msg, setMsg] = React.useState<NotificationDetail | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!id) return
    setMsg(null)
    setError(null)
    setLoading(true)
    const ac = new AbortController()
    fetch(`/api/admin/notifications/${id}`, { signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(data?.error ?? `HTTP ${res.status}`)
        }
        const data = (await res.json()) as { message: NotificationDetail }
        setMsg(data.message)
      })
      .catch((e) => {
        if ((e as Error).name === 'AbortError') return
        setError(e instanceof Error ? e.message : 'failed')
      })
      .finally(() => setLoading(false))
    return () => ac.abort()
  }, [id])

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Notification</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="py-10 text-center text-sm text-ink-tertiary">Loading…</div>
        ) : error ? (
          <div className="rounded-md border border-rose-700/40 bg-rose-950/20 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        ) : msg ? (
          <div className="space-y-3 text-sm">
            <div className="rounded-md border border-line-subtle bg-surface p-4">
              <div className="text-base font-semibold text-ink-primary">{msg.title}</div>
              {msg.body ? (
                <div className="mt-2 whitespace-pre-wrap text-sm text-ink-secondary">
                  {msg.body}
                </div>
              ) : null}
              {msg.ctaUrl ? (
                <div className="mt-3">
                  <a
                    href={msg.ctaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-emerald-300 underline-offset-4 hover:underline"
                  >
                    {msg.ctaUrl}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              ) : null}
            </div>

            <dl className="grid grid-cols-2 gap-y-2 text-xs">
              <DT>Player</DT>
              <DD>
                <Link href={`/admin/players/${msg.playerId}`} className="font-mono hover:underline">
                  {msg.playerEmail ?? msg.playerUsername ?? msg.playerId.slice(0, 8)}
                </Link>
              </DD>
              <DT>Category</DT>
              <DD>{msg.category ?? '—'}</DD>
              <DT>Priority</DT>
              <DD>
                <StatusPill
                  status="custom"
                  color={PRIORITY_TONE[msg.priority] ?? 'neutral'}
                  label={msg.priority}
                />
              </DD>
              <DT>Status</DT>
              <DD>{msg.readAt ? `Read ${fmtDateTime(msg.readAt)}` : 'Unread'}</DD>
              <DT>Source</DT>
              <DD className="font-mono text-ink-tertiary">{msg.sourceKind ?? '—'}</DD>
              <DT>Created</DT>
              <DD>{fmtDateTime(msg.createdAt)}</DD>
              <DT>Expires</DT>
              <DD>{msg.expiresAt ? fmtDateTime(msg.expiresAt) : 'Never'}</DD>
            </dl>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DT({ children }: { children: React.ReactNode }) {
  return <dt className="text-ink-tertiary">{children}</dt>
}

function DD({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dd className={`text-ink-secondary ${className ?? ''}`}>{children}</dd>
}

export const NotificationsClient = {
  ComposeTrigger,
  Inbox,
}
