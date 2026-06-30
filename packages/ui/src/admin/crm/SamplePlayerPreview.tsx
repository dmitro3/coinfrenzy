'use client'

import * as React from 'react'
import { ExternalLink, Users } from 'lucide-react'

import { cn } from '../../lib/utils'

export interface SamplePlayer {
  id: string
  email: string
  displayName: string | null
  tierLevel: number | null
  totalDepositedUsd: string | null
  lastLoginAt: string | null
}

interface SamplePlayerPreviewProps {
  players: SamplePlayer[]
  loading?: boolean
  className?: string
}

/**
 * Sidebar list shown next to the SegmentBuilder. Renders 5 actual
 * matching players so the operator can sanity-check the segment by
 * looking at real data — "do these look like the people I expect?"
 */
export function SamplePlayerPreview({ players, loading, className }: SamplePlayerPreviewProps) {
  return (
    <div className={cn('rounded-lg border border-line-subtle bg-surface', className)}>
      <div className="flex items-center justify-between border-b border-line-subtle px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
          <Users className="h-3.5 w-3.5" />
          Sample matching players
        </div>
        <span className="text-[10px] text-ink-tertiary">first {players.length}</span>
      </div>
      <div className="px-1 py-1">
        {loading && players.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-ink-tertiary">Loading…</div>
        ) : players.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-ink-tertiary">
            No matching players yet
          </div>
        ) : (
          <ul className="divide-y divide-line-subtle">
            {players.map((p) => (
              <li key={p.id}>
                <a
                  href={`/admin/players/${p.id}`}
                  className="block rounded-md px-2 py-2 transition-colors hover:bg-surface-hover"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-elevated text-[11px] font-semibold text-ink-secondary">
                      {(p.displayName ?? p.email).slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-ink-primary">
                        {p.displayName ?? p.email}
                      </div>
                      <div className="truncate text-[11px] text-ink-tertiary">{p.email}</div>
                    </div>
                    <ExternalLink className="h-3 w-3 shrink-0 text-ink-tertiary" />
                  </div>
                  <div className="mt-1 grid grid-cols-3 gap-1 text-[10px] text-ink-tertiary">
                    <span>tier {p.tierLevel ?? '—'}</span>
                    <span className="tabular-nums">${formatUsd(p.totalDepositedUsd)}</span>
                    <span className="text-right">{relativeTime(p.lastLoginAt)}</span>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function formatUsd(raw: string | null): string {
  if (!raw) return '0'
  const n = Number(raw)
  if (!Number.isFinite(n)) return '0'
  if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
  return n.toFixed(0)
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 86_400_000) return 'today'
  if (ms < 7 * 86_400_000) return `${Math.floor(ms / 86_400_000)}d ago`
  if (ms < 30 * 86_400_000) return `${Math.floor(ms / (7 * 86_400_000))}w ago`
  if (ms < 365 * 86_400_000) return `${Math.floor(ms / (30 * 86_400_000))}mo`
  return `${Math.floor(ms / (365 * 86_400_000))}y`
}
