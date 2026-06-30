'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  Loader2,
  Mail,
  MailCheck,
  MailX,
  MousePointerClick,
  PenSquare,
  Send,
  Server,
  ShieldAlert,
  User,
  X,
} from 'lucide-react'

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

// -------------------------------------------------------------------------
// Shared types
// -------------------------------------------------------------------------

export interface InboxRowProps {
  id: string
  recipient: string
  subject: string | null
  status: string
  createdAtIso: string
  sentAtIso: string | null
  openedAtIso: string | null
  clickedAtIso: string | null
  campaignId: string | null
  templateId: string | null
}

const STATUS_TONE: Record<string, StatusPillTone> = {
  sent: 'positive',
  delivered: 'positive',
  opened: 'positive',
  clicked: 'positive',
  bounced: 'critical',
  failed: 'critical',
  spam: 'critical',
  unsubscribed: 'attention',
  queued: 'notice',
}

// -------------------------------------------------------------------------
// Inbox table — clickable rows that open the detail dialog
// -------------------------------------------------------------------------

function Inbox({ rows, openIdInitial }: { rows: InboxRowProps[]; openIdInitial: string | null }) {
  const initial = openIdInitial ? (rows.find((r) => r.id === openIdInitial) ?? null) : null
  const [open, setOpen] = React.useState<{ id: string; createdAtIso: string } | null>(
    initial ? { id: initial.id, createdAtIso: initial.createdAtIso } : null,
  )

  function exportCsv() {
    const header = [
      'created_at',
      'recipient',
      'subject',
      'status',
      'sent_at',
      'opened_at',
      'clicked_at',
      'campaign_id',
      'template_id',
    ]
    const lines = [header.join(',')]
    for (const r of rows) {
      lines.push(
        [
          r.createdAtIso,
          csvCell(r.recipient),
          csvCell(r.subject ?? ''),
          r.status,
          r.sentAtIso ?? '',
          r.openedAtIso ?? '',
          r.clickedAtIso ?? '',
          r.campaignId ?? '',
          r.templateId ?? '',
        ].join(','),
      )
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `email-center-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-2 border-b border-line-subtle px-4 py-2 text-xs text-ink-tertiary">
          <span>Click a row to see full details.</span>
          <Button size="sm" variant="ghost" onClick={exportCsv}>
            <Download className="mr-1 h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-line-subtle text-left font-medium uppercase tracking-wide text-ink-tertiary">
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Recipient</th>
              <th className="px-3 py-2">Subject</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Opened</th>
              <th className="px-3 py-2">Clicked</th>
              <th className="px-3 py-2 text-right">View</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => setOpen({ id: r.id, createdAtIso: r.createdAtIso })}
                className="cursor-pointer border-b border-line-subtle last:border-b-0 hover:bg-surface-hover"
              >
                <td className="px-3 py-1.5 tabular-nums text-ink-secondary">
                  {fmtDateTime(r.createdAtIso)}
                </td>
                <td className="px-3 py-1.5 font-mono text-ink-primary">{r.recipient}</td>
                <td className="px-3 py-1.5 text-ink-primary">
                  {r.subject ?? <span className="text-ink-tertiary">—</span>}
                </td>
                <td className="px-3 py-1.5">
                  <StatusPill
                    status="custom"
                    color={STATUS_TONE[r.status] ?? 'neutral'}
                    label={r.status}
                  />
                </td>
                <td className="px-3 py-1.5 text-ink-tertiary">
                  {r.openedAtIso ? fmtTime(r.openedAtIso) : '—'}
                </td>
                <td className="px-3 py-1.5 text-ink-tertiary">
                  {r.clickedAtIso ? fmtTime(r.clickedAtIso) : '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setOpen({ id: r.id, createdAtIso: r.createdAtIso })
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-line-subtle px-2 py-0.5 text-ink-secondary hover:bg-surface-hover"
                  >
                    <Eye className="h-3 w-3" /> Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>

      <DetailDialog
        id={open?.id ?? null}
        createdAtIso={open?.createdAtIso ?? null}
        onClose={() => setOpen(null)}
      />
    </Card>
  )
}

function csvCell(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

// -------------------------------------------------------------------------
// Filter form action buttons (live inside the server form)
// -------------------------------------------------------------------------

function FilterActions({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Button type="submit" size="sm">
        Apply
      </Button>
      {hasFilters ? (
        <Button asChild size="sm" variant="ghost">
          <Link href="/admin/email-center">Clear</Link>
        </Button>
      ) : null}
    </div>
  )
}

// -------------------------------------------------------------------------
// Detail dialog — opened by clicking an inbox row
// -------------------------------------------------------------------------

interface MessageDetail {
  id: string
  playerId: string | null
  recipient: string
  subject: string | null
  status: string
  bodyPreview: string | null
  bodyStorageKey: string | null
  providerMessageId: string | null
  abVariant: string | null
  campaignId: string | null
  templateId: string | null
  templateName: string | null
  playerEmail: string | null
  playerUsername: string | null
  createdAt: string
  queuedAt: string | null
  sentAt: string | null
  deliveredAt: string | null
  openedAt: string | null
  clickedAt: string | null
  errorCode: string | null
  errorMessage: string | null
}

function DetailDialog({
  id,
  createdAtIso,
  onClose,
}: {
  id: string | null
  createdAtIso: string | null
  onClose: () => void
}) {
  const [msg, setMsg] = React.useState<MessageDetail | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!id) return
    setMsg(null)
    setError(null)
    setLoading(true)
    const ac = new AbortController()
    const qs = createdAtIso ? `?createdAt=${encodeURIComponent(createdAtIso)}` : ''
    fetch(`/api/admin/email-center/messages/${id}${qs}`, { signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null
          setError(data?.error ?? 'Could not load.')
          return
        }
        const data = (await res.json()) as { message: MessageDetail }
        setMsg(data.message)
      })
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') setError('Could not load.')
      })
      .finally(() => setLoading(false))
    return () => ac.abort()
  }, [id, createdAtIso])

  return (
    <Dialog open={id !== null} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Email message</DialogTitle>
          <DialogDescription>
            Full delivery timeline, content preview, and provider details.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm text-ink-tertiary">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : error ? (
          <div className="rounded-md border border-critical/40 bg-critical/10 px-3 py-2 text-sm text-critical">
            {error}
          </div>
        ) : msg ? (
          <DetailBody msg={msg} />
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

function DetailBody({ msg }: { msg: MessageDetail }) {
  const events: Array<{ label: string; iso: string | null; icon: React.ReactNode }> = [
    { label: 'Queued', iso: msg.queuedAt, icon: <Clock className="h-3.5 w-3.5" /> },
    { label: 'Sent', iso: msg.sentAt, icon: <Send className="h-3.5 w-3.5" /> },
    { label: 'Delivered', iso: msg.deliveredAt, icon: <MailCheck className="h-3.5 w-3.5" /> },
    { label: 'Opened', iso: msg.openedAt, icon: <Eye className="h-3.5 w-3.5" /> },
    { label: 'Clicked', iso: msg.clickedAt, icon: <MousePointerClick className="h-3.5 w-3.5" /> },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line-subtle bg-surface p-3 text-sm">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-ink-tertiary">Subject</div>
          <div className="break-words font-medium text-ink-primary">
            {msg.subject ?? <span className="text-ink-tertiary">(no subject)</span>}
          </div>
        </div>
        <StatusPill
          status="custom"
          color={STATUS_TONE[msg.status] ?? 'neutral'}
          label={msg.status}
        />
      </div>

      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <DetailRow icon={<Mail className="h-3.5 w-3.5" />} label="To">
          <span className="font-mono">{msg.recipient}</span>
        </DetailRow>
        <DetailRow icon={<User className="h-3.5 w-3.5" />} label="Player">
          {msg.playerId ? (
            <Link
              href={`/admin/players/${msg.playerId}`}
              className="text-brand underline-offset-2 hover:underline"
            >
              {msg.playerUsername ?? msg.playerEmail ?? msg.playerId.slice(0, 8)}
            </Link>
          ) : (
            <span className="text-ink-tertiary">external recipient</span>
          )}
        </DetailRow>
        <DetailRow icon={<PenSquare className="h-3.5 w-3.5" />} label="Template">
          {msg.templateName ? (
            <span>{msg.templateName}</span>
          ) : (
            <span className="text-ink-tertiary">none (one-off)</span>
          )}
        </DetailRow>
        <DetailRow icon={<Server className="h-3.5 w-3.5" />} label="Provider ID">
          <span className="font-mono text-xs">
            {msg.providerMessageId ?? <span className="text-ink-tertiary">—</span>}
          </span>
        </DetailRow>
        {msg.campaignId ? (
          <DetailRow icon={<Mail className="h-3.5 w-3.5" />} label="Campaign">
            <Link
              href={`/admin/crm/campaigns/${msg.campaignId}`}
              className="text-brand underline-offset-2 hover:underline"
            >
              {msg.campaignId.slice(0, 8)}
            </Link>
          </DetailRow>
        ) : null}
        {msg.abVariant ? (
          <DetailRow icon={<MailX className="h-3.5 w-3.5" />} label="A/B variant">
            <span className="text-ink-secondary">{msg.abVariant}</span>
          </DetailRow>
        ) : null}
      </dl>

      <section>
        <div className="mb-2 text-xs uppercase tracking-wide text-ink-tertiary">
          Delivery timeline
        </div>
        <ol className="space-y-1.5 text-sm">
          {events.map((e, i) => (
            <li
              key={i}
              className={`flex items-center gap-2 ${
                e.iso ? 'text-ink-primary' : 'text-ink-tertiary'
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full ${
                  e.iso ? 'bg-positive/15 text-positive' : 'bg-elevated text-ink-tertiary'
                }`}
              >
                {e.iso ? <CheckCircle2 className="h-3 w-3" /> : e.icon}
              </span>
              <span className="w-20 text-xs uppercase tracking-wide">{e.label}</span>
              <span className="font-mono text-xs">{e.iso ? fmtDateTime(e.iso) : '—'}</span>
            </li>
          ))}
        </ol>
      </section>

      {msg.errorCode || msg.errorMessage ? (
        <div className="space-y-1 rounded-md border border-critical/40 bg-critical/10 p-3 text-xs">
          <div className="flex items-center gap-2 font-medium text-critical">
            <AlertTriangle className="h-3.5 w-3.5" /> Delivery error
          </div>
          {msg.errorCode ? (
            <div className="font-mono">
              <span className="text-ink-tertiary">code: </span>
              {msg.errorCode}
            </div>
          ) : null}
          {msg.errorMessage ? (
            <div className="font-mono text-ink-primary">{msg.errorMessage}</div>
          ) : null}
        </div>
      ) : null}

      <section>
        <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-ink-tertiary">
          <span>Body preview (first 200 chars)</span>
          <span className="font-mono">{msg.createdAt ? fmtDateTime(msg.createdAt) : ''}</span>
        </div>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-line-subtle bg-surface p-3 text-xs text-ink-primary">
          {msg.bodyPreview ?? '(no preview captured)'}
        </pre>
        {msg.bodyStorageKey ? (
          <FullBodyReveal id={msg.id} createdAtIso={msg.createdAt} />
        ) : (
          <p className="mt-1 text-[10px] text-ink-tertiary">
            Full body not archived for this message (legacy row, or R2 was unavailable at send
            time).
          </p>
        )}
      </section>
    </div>
  )
}

function FullBodyReveal({ id, createdAtIso }: { id: string; createdAtIso: string }) {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function reveal() {
    setBusy(true)
    setError(null)
    try {
      const qs = `?createdAt=${encodeURIComponent(createdAtIso)}`
      const res = await fetch(`/api/admin/email-center/messages/${id}/body${qs}`)
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null
      if (!res.ok || !data?.url) {
        setError(data?.error ?? 'failed')
        return
      }
      window.open(data.url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-2 flex items-center justify-between gap-3 text-[11px]">
      <span className="text-ink-tertiary">
        Full HTML body is archived in cold storage. Revealing it is audited.
      </span>
      <button
        type="button"
        onClick={reveal}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-md border border-line-subtle px-2 py-1 text-ink-primary hover:bg-surface-hover disabled:opacity-50"
      >
        {busy ? 'Loading…' : 'Show full body'}
      </button>
      {error ? <span className="text-rose-300">{error}</span> : null}
    </div>
  )
}

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-line-subtle bg-surface p-2 text-sm">
      <span className="mt-0.5 text-ink-tertiary">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wide text-ink-tertiary">{label}</div>
        <div className="text-ink-primary">{children}</div>
      </div>
    </div>
  )
}

// -------------------------------------------------------------------------
// Compose button + dialog
// -------------------------------------------------------------------------

interface TemplateOption {
  id: string
  slug: string
  displayName: string
  category: string | null
  subjectTemplate: string
  bodyHtmlTemplate: string
  bodyTextTemplate: string | null
  fromEmail: string | null
  replyTo: string | null
}

interface PlayerHit {
  id: string
  email: string
  username: string | null
  displayName: string | null
  kycLevel: number
  status: string
}

function ComposeTrigger({
  canCompose,
  canIgnoreSuppression,
  defaultOpen,
}: {
  canCompose: boolean
  canIgnoreSuppression: boolean
  defaultOpen: boolean
}) {
  const [open, setOpen] = React.useState(defaultOpen && canCompose)

  if (!canCompose) {
    return (
      <Button disabled title="Marketing or manager role required.">
        Compose
      </Button>
    )
  }
  return (
    <>
      <Button onClick={() => setOpen(true)}>Compose</Button>
      <ComposeDialog
        open={open}
        onClose={() => setOpen(false)}
        canIgnoreSuppression={canIgnoreSuppression}
      />
    </>
  )
}

function ComposeDialog({
  open,
  onClose,
  canIgnoreSuppression,
}: {
  open: boolean
  onClose: () => void
  canIgnoreSuppression: boolean
}) {
  const router = useRouter()
  const params = useSearchParams()
  void params

  const [toEmail, setToEmail] = React.useState('')
  const [toPlayer, setToPlayer] = React.useState<PlayerHit | null>(null)
  const [subject, setSubject] = React.useState('')
  const [bodyHtml, setBodyHtml] = React.useState('')
  const [bodyText, setBodyText] = React.useState('')
  const [fromEmail, setFromEmail] = React.useState('')
  const [replyTo, setReplyTo] = React.useState('')
  const [templates, setTemplates] = React.useState<TemplateOption[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<string>('')
  const [ignoreSuppression, setIgnoreSuppression] = React.useState(false)
  const [showPreview, setShowPreview] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState<string | null>(null)

  // Load templates once when the dialog opens.
  React.useEffect(() => {
    if (!open || templates.length > 0) return
    fetch('/api/admin/email-center/templates')
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d: { templates: TemplateOption[] }) => setTemplates(d.templates ?? []))
      .catch(() => setTemplates([]))
  }, [open, templates.length])

  function reset() {
    setToEmail('')
    setToPlayer(null)
    setSubject('')
    setBodyHtml('')
    setBodyText('')
    setFromEmail('')
    setReplyTo('')
    setSelectedTemplateId('')
    setIgnoreSuppression(false)
    setError(null)
    setSuccess(null)
  }

  function handleClose() {
    if (!busy) {
      reset()
      onClose()
    }
  }

  function onTemplateChange(id: string) {
    setSelectedTemplateId(id)
    const t = templates.find((x) => x.id === id)
    if (!t) return
    setSubject(t.subjectTemplate)
    setBodyHtml(t.bodyHtmlTemplate)
    setBodyText(t.bodyTextTemplate ?? '')
    if (t.fromEmail) setFromEmail(t.fromEmail)
    if (t.replyTo) setReplyTo(t.replyTo)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const payload: Record<string, unknown> = {
        subject,
        bodyHtml,
        bodyText: bodyText || undefined,
        fromEmail: fromEmail || undefined,
        replyTo: replyTo || undefined,
        templateId: selectedTemplateId || undefined,
        ignoreSuppression: ignoreSuppression || undefined,
      }
      if (toPlayer) payload.toPlayerId = toPlayer.id
      else payload.toEmail = toEmail

      const res = await fetch('/api/admin/email-center/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = (await res.json().catch(() => null)) as {
        messageId?: string
        recipient?: string
        error?: string
        details?: { reason?: string; message?: string }
      } | null
      if (!res.ok) {
        if (data?.error === 'suppressed')
          setError(
            'This recipient is on the suppression list. Manager+ can override via the box below.',
          )
        else if (data?.error === 'player_not_found') setError('Player not found.')
        else if (data?.error === 'template_not_found') setError('Template not found.')
        else if (data?.error === 'dispatch_failed')
          setError(`Provider rejected: ${data.details?.message ?? 'unknown'}`)
        else if (data?.error === 'invalid')
          setError(`Invalid: ${data.details?.reason ?? 'check the values.'}`)
        else if (data?.error === 'cannot_override_suppression')
          setError('Suppression override requires manager role.')
        else setError(data?.error ?? 'Send failed.')
        return
      }
      setSuccess(`Sent to ${data?.recipient}. Message id ${data?.messageId?.slice(0, 8)}.`)
      router.refresh()
    } catch {
      setError('Connection problem. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? handleClose() : undefined)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Compose email</DialogTitle>
          <DialogDescription>
            Send a one-off email to a player or external address. Logs to the inbox below and audit
            log. Bulk campaigns live under CRM.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="rounded-md border border-critical/40 bg-critical/10 px-3 py-2 text-sm text-critical">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="rounded-md border border-positive/40 bg-positive/10 px-3 py-2 text-sm text-positive">
            {success}
          </div>
        ) : null}

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-ink-secondary">
                Recipient <span className="text-critical">*</span>
              </Label>
              {toPlayer ? (
                <div className="flex items-center justify-between gap-2 rounded-md border border-line-subtle bg-surface px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium text-ink-primary">
                      {toPlayer.username ?? toPlayer.displayName ?? toPlayer.email}
                    </div>
                    <div className="font-mono text-xs text-ink-tertiary">{toPlayer.email}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setToPlayer(null)}
                    className="text-ink-tertiary hover:text-ink-primary"
                    aria-label="Clear"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <PlayerOrEmailPicker
                  email={toEmail}
                  onEmailChange={setToEmail}
                  onPickPlayer={setToPlayer}
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-ink-secondary">Load from template</Label>
              <select
                value={selectedTemplateId}
                onChange={(e) => onTemplateChange(e.target.value)}
                className="h-9 w-full rounded-md border border-line-default bg-surface px-3 text-sm text-ink-primary"
              >
                <option value="">— Start from blank —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.displayName}
                    {t.category ? ` · ${t.category}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-medium text-ink-secondary">
                Subject <span className="text-critical">*</span>
              </Label>
              <Input
                required
                maxLength={200}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="A clear subject…"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-ink-secondary">From address</Label>
              <Input
                type="email"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                placeholder="noreply@coinfrenzy.example"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-ink-secondary">Reply-to</Label>
              <Input
                type="email"
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
                placeholder="support@coinfrenzy.example"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-ink-secondary">
                HTML body <span className="text-critical">*</span>
              </Label>
              <button
                type="button"
                onClick={() => setShowPreview((p) => !p)}
                className="text-xs text-ink-tertiary hover:text-ink-primary"
              >
                {showPreview ? 'Edit HTML' : 'Preview as text'}
              </button>
            </div>
            {showPreview ? (
              <div className="max-h-64 overflow-auto rounded-md border border-line-subtle bg-surface p-3 text-sm text-ink-primary">
                <PlainPreview html={bodyHtml} />
              </div>
            ) : (
              <textarea
                required
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                spellCheck
                className="min-h-[180px] w-full rounded-md border border-line-default bg-surface px-3 py-2 font-mono text-sm leading-relaxed text-ink-primary"
                placeholder="<p>Hi {{ firstName }},</p>"
              />
            )}
          </div>

          <details className="rounded-md border border-line-subtle bg-surface p-3 text-xs text-ink-secondary">
            <summary className="cursor-pointer text-ink-primary">
              Plain-text fallback (recommended)
            </summary>
            <textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              className="mt-2 min-h-[80px] w-full rounded-md border border-line-default bg-elevated px-3 py-2 font-mono text-xs leading-relaxed text-ink-primary"
              placeholder="Plain-text version (shown to clients that don't render HTML)."
            />
          </details>

          {canIgnoreSuppression ? (
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-line-subtle bg-surface p-3 text-xs text-ink-secondary">
              <input
                type="checkbox"
                checked={ignoreSuppression}
                onChange={(e) => setIgnoreSuppression(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="flex items-center gap-1 text-ink-primary">
                  <ShieldAlert className="h-3.5 w-3.5" /> Override suppression
                </span>
                <span className="block text-[11px] text-ink-tertiary">
                  Send even if the recipient is on the suppression list. Only use for genuinely
                  transactional messages (account closure, KYC outcome). Audited.
                </span>
              </span>
            </label>
          ) : null}

          <DialogFooter className="!mt-2">
            <Button type="button" variant="ghost" onClick={handleClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Sending…
                </>
              ) : (
                <>
                  <Send className="mr-2 h-3.5 w-3.5" /> Send email
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function PlayerOrEmailPicker({
  email,
  onEmailChange,
  onPickPlayer,
}: {
  email: string
  onEmailChange: (v: string) => void
  onPickPlayer: (p: PlayerHit) => void
}) {
  const [hits, setHits] = React.useState<PlayerHit[]>([])
  const [loading, setLoading] = React.useState(false)
  const [searchQ, setSearchQ] = React.useState('')

  // Trigger search after debounce + min 2 chars. Doesn't fire on bare
  // email format — operator probably just wants to send to that string.
  React.useEffect(() => {
    const q = searchQ.trim()
    if (q.length < 2) {
      setHits([])
      return
    }
    const ac = new AbortController()
    const t = setTimeout(() => {
      setLoading(true)
      fetch(`/api/admin/players/search?q=${encodeURIComponent(q)}`, { signal: ac.signal })
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((d: { results: PlayerHit[] }) => setHits(d.results ?? []))
        .catch(() => undefined)
        .finally(() => setLoading(false))
    }, 200)
    return () => {
      ac.abort()
      clearTimeout(t)
    }
  }, [searchQ])

  return (
    <div>
      <Input
        type="email"
        value={email}
        onChange={(e) => {
          onEmailChange(e.target.value)
          setSearchQ(e.target.value)
        }}
        placeholder="player@example.com or search by username / id…"
      />
      {searchQ.length >= 2 && (hits.length > 0 || loading) ? (
        <div className="mt-1 max-h-48 overflow-auto rounded-md border border-line-subtle bg-surface text-xs">
          {loading && hits.length === 0 ? (
            <div className="px-3 py-2 text-ink-tertiary">Searching…</div>
          ) : null}
          {hits.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => {
                onPickPlayer(h)
                setHits([])
                setSearchQ('')
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-surface-hover"
            >
              <div className="min-w-0">
                <div className="truncate text-ink-primary">
                  {h.username ?? h.displayName ?? h.email}
                </div>
                <div className="truncate font-mono text-[10px] text-ink-tertiary">{h.email}</div>
              </div>
              <span className="text-[10px] uppercase tracking-wide text-ink-tertiary">
                kyc {h.kycLevel}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// -------------------------------------------------------------------------
// HTML → plain-text preview (safe, no innerHTML).
//
// We strip tags and decode a small whitelist of entities. This is a
// PREVIEW, not the send body — the actual sent HTML is the raw value
// in the textarea, dispatched as-is to SendGrid.

function PlainPreview({ html }: { html: string }) {
  const plain = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  return <pre className="whitespace-pre-wrap break-words font-sans">{plain}</pre>
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export const EmailCenterClient = {
  Inbox,
  FilterActions,
  ComposeTrigger,
}
