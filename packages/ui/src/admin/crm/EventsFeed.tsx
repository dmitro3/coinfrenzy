'use client'

import * as React from 'react'
import {
  Eye,
  MailX,
  MousePointerClick,
  Send,
  Sparkles,
  UserMinus,
  Workflow,
  Mail,
} from 'lucide-react'

import { cn } from '../../lib/utils'

type Kind =
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'unsubscribed'
  | 'campaign_created'
  | 'campaign_sent'
  | 'segment_created'
  | 'flow_published'

interface CrmEvent {
  id: string
  kind: Kind
  occurredAt: string
  subject: string
  target: string | null
  detail?: string
  href?: string
}

interface EventsFeedProps {
  /** When provided, the feed scopes the request to a single kind. */
  initialKind?: Kind | null
  /** Bound on number of rows to keep around. */
  limit?: number
  /** Polling interval ms. 0 disables polling. */
  pollMs?: number
  /** Compact mode (smaller text, denser rows) for sidebars. */
  compact?: boolean
  className?: string
}

const FILTERS: Array<{ key: Kind | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'sent', label: 'Sends' },
  { key: 'opened', label: 'Opens' },
  { key: 'clicked', label: 'Clicks' },
  { key: 'unsubscribed', label: 'Unsubs' },
  { key: 'campaign_sent', label: 'Campaigns' },
]

const KIND_ICON: Record<Kind, React.ComponentType<{ className?: string }>> = {
  sent: Send,
  delivered: Mail,
  opened: Eye,
  clicked: MousePointerClick,
  bounced: MailX,
  unsubscribed: UserMinus,
  campaign_created: Sparkles,
  campaign_sent: Send,
  segment_created: Sparkles,
  flow_published: Workflow,
}

const KIND_COLORS: Record<Kind, string> = {
  sent: 'text-sky-400',
  delivered: 'text-sky-400',
  opened: 'text-emerald-400',
  clicked: 'text-emerald-500',
  bounced: 'text-rose-400',
  unsubscribed: 'text-amber-400',
  campaign_created: 'text-violet-400',
  campaign_sent: 'text-sky-400',
  segment_created: 'text-violet-400',
  flow_published: 'text-violet-500',
}

const KIND_VERB: Record<Kind, string> = {
  sent: 'Sent',
  delivered: 'Delivered',
  opened: 'Opened',
  clicked: 'Clicked link in',
  bounced: 'Bounced',
  unsubscribed: 'Unsubscribed from',
  campaign_created: 'Created campaign',
  campaign_sent: 'Sent campaign',
  segment_created: 'Created segment',
  flow_published: 'Published flow',
}

/**
 * Real-time CRM activity feed. Polls /api/admin/crm/events/recent on a
 * timer; new rows fade in at the top. Used on the CRM landing page
 * left rail and as the primary content of /admin/crm/events.
 */
export function EventsFeed({
  initialKind = null,
  limit = 50,
  pollMs = 5000,
  compact = false,
  className,
}: EventsFeedProps) {
  const [kind, setKind] = React.useState<Kind | 'all'>(initialKind ?? 'all')
  const [events, setEvents] = React.useState<CrmEvent[]>([])
  const [loading, setLoading] = React.useState(true)
  const [newIds, setNewIds] = React.useState<Set<string>>(new Set())

  const load = React.useCallback(async () => {
    const url = new URL('/api/admin/crm/events/recent', window.location.origin)
    if (kind !== 'all') url.searchParams.set('kind', kind)
    url.searchParams.set('limit', String(limit))
    try {
      const res = await fetch(url.toString(), { cache: 'no-store' })
      if (!res.ok) return
      const json = (await res.json()) as { events: CrmEvent[] }
      setEvents((prev) => {
        const prevIds = new Set(prev.map((e) => e.id))
        const incomingIds = new Set<string>()
        for (const e of json.events) {
          if (!prevIds.has(e.id)) incomingIds.add(e.id)
        }
        if (incomingIds.size > 0) {
          setNewIds(incomingIds)
          window.setTimeout(() => setNewIds(new Set()), 2000)
        }
        return json.events
      })
    } finally {
      setLoading(false)
    }
  }, [kind, limit])

  React.useEffect(() => {
    let stopped = false
    void load()
    if (pollMs > 0) {
      const interval = window.setInterval(() => {
        if (!stopped) void load()
      }, pollMs)
      return () => {
        stopped = true
        window.clearInterval(interval)
      }
    }
    return undefined
  }, [load, pollMs])

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setKind(f.key)}
            className={cn(
              'rounded-full px-3 py-1 text-xs transition-colors',
              kind === f.key
                ? 'bg-elevated text-ink-primary'
                : 'text-ink-tertiary hover:text-ink-secondary',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div
        className={cn(
          'overflow-hidden rounded-lg border border-line-subtle bg-surface',
          compact ? '' : 'min-h-[400px]',
        )}
      >
        {loading && events.length === 0 ? (
          <div className="flex items-center justify-center px-4 py-12 text-xs text-ink-tertiary">
            Loading…
          </div>
        ) : events.length === 0 ? (
          <div className="flex items-center justify-center px-4 py-12 text-xs text-ink-tertiary">
            No events yet — once campaigns start sending, activity will stream here.
          </div>
        ) : (
          <ul className="divide-y divide-line-subtle">
            {events.map((e) => (
              <EventRow key={e.id} event={e} isNew={newIds.has(e.id)} compact={compact} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function EventRow({
  event,
  isNew,
  compact,
}: {
  event: CrmEvent
  isNew: boolean
  compact: boolean
}) {
  const Icon = KIND_ICON[event.kind]
  const verb = KIND_VERB[event.kind] ?? 'Action'
  const tone = KIND_COLORS[event.kind] ?? 'text-ink-secondary'

  const body = (
    <div
      className={cn(
        'group flex items-start gap-3 transition-colors',
        compact ? 'px-3 py-2' : 'px-4 py-3',
        'hover:bg-surface-hover',
        isNew && 'bg-emerald-500/5',
      )}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone)} />
      <div className="min-w-0 flex-1">
        <div
          className={cn('flex flex-wrap items-baseline gap-x-1.5', compact ? 'text-xs' : 'text-sm')}
        >
          <span className="text-ink-secondary">{verb}</span>
          <span className="font-medium text-ink-primary">{event.subject}</span>
          {event.target ? (
            <>
              <span className="text-ink-tertiary">→</span>
              <span className="text-ink-secondary">{event.target}</span>
            </>
          ) : null}
        </div>
        {event.detail && !compact ? (
          <div className="text-[11px] text-ink-tertiary">{event.detail}</div>
        ) : null}
      </div>
      <span className={cn('shrink-0 text-ink-tertiary', compact ? 'text-[10px]' : 'text-xs')}>
        {relativeTime(event.occurredAt)}
      </span>
    </div>
  )

  return (
    <li className={cn(isNew && 'animate-pulse-soft')}>
      {event.href ? (
        <a href={event.href} className="block">
          {body}
        </a>
      ) : (
        body
      )}
    </li>
  )
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 5_000) return 'just now'
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return `${Math.floor(ms / 86_400_000)}d ago`
}
