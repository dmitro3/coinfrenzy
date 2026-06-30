import Link from 'next/link'

import { cn } from '@coinfrenzy/ui/lib/utils'

type View = 'table' | 'feed'

interface MessageLogViewTabsProps {
  view: View
  playerId?: string
  campaignId?: string
}

const TABS: { key: View; label: string }[] = [
  { key: 'table', label: 'Table' },
  { key: 'feed', label: 'Live feed' },
]

function buildHref(view: View, playerId?: string, campaignId?: string): string {
  const params = new URLSearchParams()
  if (view === 'feed') params.set('view', 'feed')
  if (playerId) params.set('playerId', playerId)
  if (campaignId) params.set('campaignId', campaignId)
  const qs = params.toString()
  return `/admin/crm/message-log${qs ? `?${qs}` : ''}`
}

export function MessageLogViewTabs({ view, playerId, campaignId }: MessageLogViewTabsProps) {
  return (
    <div className="border-b border-line-subtle">
      <nav className="flex flex-wrap gap-1" aria-label="Message log views">
        {TABS.map((t) => {
          const active = view === t.key
          return (
            <Link
              key={t.key}
              href={buildHref(t.key, playerId, campaignId)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative -mb-px h-9 border-b-2 px-3 text-sm font-medium transition-colors',
                active
                  ? 'border-brand text-ink-primary'
                  : 'border-transparent text-ink-secondary hover:text-ink-primary',
              )}
            >
              {t.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
