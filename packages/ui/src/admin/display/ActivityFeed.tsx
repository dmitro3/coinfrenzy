'use client'

import * as React from 'react'
import { Clock } from 'lucide-react'

import { cn } from '../../lib/utils'

export interface ActivityFeedItem {
  id: string
  /** ISO timestamp. */
  timestamp: string
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  actor?: string
  href?: string
}

interface ActivityFeedProps {
  items: ActivityFeedItem[]
  /** Render prop for the host app's Link wrapper. */
  renderLink?: (props: { href: string; children: React.ReactNode }) => React.ReactNode
  /** Empty-state caption. */
  emptyMessage?: string
  className?: string
}

/**
 * Vertical timeline. Items are grouped by day with section headers; each item
 * has an icon-on-left + content-on-right with a subtle connector line.
 */
export function ActivityFeed({
  items,
  renderLink,
  emptyMessage = 'No activity yet.',
  className,
}: ActivityFeedProps) {
  if (items.length === 0) {
    return <p className={cn('text-sm text-ink-tertiary', className)}>{emptyMessage}</p>
  }

  const grouped = groupByDay(items)

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      {grouped.map(({ dayLabel, items: dayItems }) => (
        <section key={dayLabel}>
          <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-ink-tertiary">
            {dayLabel}
          </h4>
          <ol className="relative">
            {dayItems.map((item, idx) => (
              <li key={item.id} className="relative flex gap-4 pb-5 last:pb-0">
                {idx < dayItems.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className="absolute left-[15px] top-8 bottom-0 w-px bg-line-subtle"
                  />
                ) : null}
                <div className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line-subtle bg-surface text-ink-tertiary [&>svg]:h-4 [&>svg]:w-4">
                  {item.icon ?? <Clock />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink-primary">{item.title}</p>
                  {item.description ? (
                    <p className="mt-0.5 text-sm text-ink-secondary">{item.description}</p>
                  ) : null}
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-tertiary">
                    {item.actor ? (
                      <>
                        <span>{item.actor}</span>
                        <span aria-hidden="true">·</span>
                      </>
                    ) : null}
                    <time
                      dateTime={item.timestamp}
                      title={new Date(item.timestamp).toLocaleString()}
                    >
                      {formatRelative(item.timestamp)}
                    </time>
                    {item.href && renderLink ? (
                      <>
                        <span aria-hidden="true">·</span>
                        {renderLink({
                          href: item.href,
                          children: (
                            <span className="text-ink-secondary hover:text-ink-primary">
                              Details
                            </span>
                          ),
                        })}
                      </>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}

function groupByDay(items: ActivityFeedItem[]): { dayLabel: string; items: ActivityFeedItem[] }[] {
  const out: Map<string, ActivityFeedItem[]> = new Map()
  const sorted = [...items].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  )
  for (const item of sorted) {
    const key = dayLabelFor(item.timestamp)
    if (!out.has(key)) out.set(key, [])
    out.get(key)!.push(item)
  }
  return Array.from(out.entries()).map(([dayLabel, items]) => ({ dayLabel, items }))
}

function dayLabelFor(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yest = new Date()
  yest.setDate(today.getDate() - 1)
  if (sameDay(d, today)) return 'Today'
  if (sameDay(d, yest)) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}
