'use client'

import * as React from 'react'
import { Archive, Ban, Loader2, Pencil, Play, Plus, Search } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'

import { Button } from '@coinfrenzy/ui/primitives/button'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'
import { EmptyState, StatusPill } from '@coinfrenzy/ui/admin'

import { formatCoins } from '@/lib/format'

import { PromoCodeDialog, type BonusTemplateOption, type PromoCodeEditable } from '../_promo-dialog'

export interface PromoCodeRow {
  id: string
  code: string
  description: string | null
  status: string
  bonusId: string
  bonusName: string
  bonusSc: string
  bonusGc: string
  bonusMultiplier: string
  context: string | null
  usesCount: number
  maxTotalUses: number | null
  maxPerPlayer: number | null
  validFrom: string | null
  validUntil: string | null
  playthroughMultiplier: string | null
  playthroughWindowHours: number | null
  blockedEmailDomains: string[] | null
}

interface PanelProps {
  rows: PromoCodeRow[]
  templates: BonusTemplateOption[]
  filters: {
    status: string
    context: string
    schedule: string
    search: string
  }
  canManage: boolean
}

function statusLabel(
  status: string,
  validFrom: string | null,
  validUntil: string | null,
): {
  color: 'positive' | 'attention' | 'critical' | 'neutral' | 'notice'
  label: string
} {
  const now = Date.now()
  if (status === 'archived') return { color: 'neutral', label: 'Archived' }
  if (status === 'inactive') return { color: 'critical', label: 'Disabled' }
  if (validFrom && new Date(validFrom).getTime() > now) {
    return { color: 'notice', label: 'Scheduled' }
  }
  if (validUntil && new Date(validUntil).getTime() < now) {
    return { color: 'critical', label: 'Expired' }
  }
  return { color: 'positive', label: 'Active' }
}

function contextLabel(ctx: string | null): string {
  if (!ctx) return 'Any'
  if (ctx === 'standalone') return 'Free gift'
  if (ctx === 'signup') return 'Signup'
  if (ctx === 'purchase') return 'Purchase'
  return ctx
}

/** Thin styled select that matches the dark admin theme */
function FilterSelect({
  name,
  value,
  onChange,
  children,
}: {
  name: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <select
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-md border border-line-subtle bg-surface px-3 text-sm text-ink-primary transition-colors hover:border-line-default focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
    >
      {children}
    </select>
  )
}

export function ActivePanel({ rows, templates, filters, canManage }: PanelProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<PromoCodeEditable | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [navigating, setNavigating] = React.useState(false)

  // Local filter state mirrors URL params — updated immediately on change
  const [localStatus, setLocalStatus] = React.useState(filters.status)
  const [localContext, setLocalContext] = React.useState(filters.context)
  const [localSchedule, setLocalSchedule] = React.useState(filters.schedule)
  const [localSearch, setLocalSearch] = React.useState(filters.search)

  // Debounce ref for search input
  const searchDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Push updated filters to the URL, triggering a server re-fetch */
  function applyFilters(overrides: Partial<typeof filters>) {
    setNavigating(true)
    const params = new URLSearchParams(searchParams.toString())
    const next = {
      status: localStatus,
      context: localContext,
      schedule: localSchedule,
      search: localSearch,
      ...overrides,
    }

    if (next.status && next.status !== 'active') params.set('status', next.status)
    else params.delete('status')

    if (next.context && next.context !== 'all') params.set('context', next.context)
    else params.delete('context')

    if (next.schedule && next.schedule !== 'all') params.set('schedule', next.schedule)
    else params.delete('schedule')

    if (next.search) params.set('search', next.search)
    else params.delete('search')

    router.push(`?${params.toString()}`)
  }

  function handleStatusChange(value: string) {
    setLocalStatus(value)
    applyFilters({ status: value })
  }

  function handleContextChange(value: string) {
    setLocalContext(value)
    applyFilters({ context: value })
  }

  function handleScheduleChange(value: string) {
    setLocalSchedule(value)
    applyFilters({ schedule: value })
  }

  function handleSearchChange(value: string) {
    setLocalSearch(value)
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      applyFilters({ search: value })
    }, 380)
  }

  // Stop navigating spinner once the URL params stabilize
  React.useEffect(() => {
    setNavigating(false)
  }, [filters])

  function openCreate() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(row: PromoCodeRow) {
    setEditing({
      id: row.id,
      code: row.code,
      description: row.description,
      bonusId: row.bonusId,
      requiredContext: row.context,
      maxPerPlayer: row.maxPerPlayer,
      maxTotalUses: row.maxTotalUses,
      validFrom: row.validFrom,
      validUntil: row.validUntil,
      playthroughMultiplier: row.playthroughMultiplier,
      playthroughWindowHours: row.playthroughWindowHours,
      blockedEmailDomains: row.blockedEmailDomains,
      status: row.status,
    })
    setDialogOpen(true)
  }

  async function patchStatus(id: string, status: 'active' | 'inactive' | 'archived') {
    setBusyId(id)
    try {
      const res = await fetch(`/api/admin/promo-codes/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        alert(body.error ?? `Failed (${res.status})`)
        return
      }
      window.location.reload()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line-subtle bg-surface p-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
          <input
            name="search"
            value={localSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search code…"
            className="h-9 w-full rounded-md border border-line-subtle bg-base pl-9 pr-3 text-sm text-ink-primary placeholder:text-ink-tertiary transition-colors hover:border-line-default focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>

        {/* Status filter */}
        <FilterSelect name="status" value={localStatus} onChange={handleStatusChange}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Disabled</option>
          <option value="archived">Archived</option>
        </FilterSelect>

        {/* Schedule filter — derived from validFrom logic */}
        <FilterSelect name="schedule" value={localSchedule} onChange={handleScheduleChange}>
          <option value="all">All schedules</option>
          <option value="scheduled">Scheduled</option>
          <option value="live">Live now</option>
          <option value="expired">Expired</option>
        </FilterSelect>

        {/* Context filter */}
        <FilterSelect name="context" value={localContext} onChange={handleContextChange}>
          <option value="all">All contexts</option>
          <option value="standalone">Free gift</option>
          <option value="signup">Signup</option>
          <option value="purchase">Purchase</option>
        </FilterSelect>

        {/* Live loading indicator — shown while navigation is in-flight */}
        {navigating && (
          <Loader2 className="h-4 w-4 animate-spin text-ink-tertiary" aria-label="Loading…" />
        )}

        {/* New promo code button */}
        {canManage && (
          <Button
            type="button"
            onClick={openCreate}
            className="ml-auto h-9"
            disabled={templates.length === 0}
          >
            <Plus className="h-3.5 w-3.5" /> New promo code
          </Button>
        )}
      </div>

      {/* ── Data table ───────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              icon={<Plus />}
              title="No promo codes match"
              description={
                templates.length === 0
                  ? 'Create a bonus template first, then come back here to wrap it in a code.'
                  : 'Clear filters or create a new code.'
              }
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line-subtle text-left text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                  <th className="px-4 py-2">Code</th>
                  <th className="px-4 py-2">Bonus</th>
                  <th className="px-4 py-2">Context</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Uses</th>
                  <th className="px-4 py-2 text-right">Award</th>
                  <th className="px-4 py-2">Window</th>
                  {canManage && <th className="px-4 py-2 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const s = statusLabel(r.status, r.validFrom, r.validUntil)
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-line-subtle text-sm last:border-b-0 hover:bg-surface-hover"
                    >
                      <td className="px-4 py-3">
                        <div className="font-mono font-medium text-ink-primary">{r.code}</div>
                        {r.description ? (
                          <div className="truncate text-xs text-ink-tertiary">{r.description}</div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-ink-secondary">{r.bonusName}</td>
                      <td className="px-4 py-3 text-xs uppercase tracking-wide text-ink-tertiary">
                        {contextLabel(r.context)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status="custom" color={s.color} label={s.label} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink-secondary">
                        {r.usesCount.toLocaleString()}
                        {r.maxTotalUses ? (
                          <span className="text-ink-tertiary"> / {r.maxTotalUses}</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink-primary">
                        {BigInt(r.bonusSc) > 0n ? `${formatCoins(r.bonusSc)} SC` : null}
                        {BigInt(r.bonusGc) > 0n ? (
                          <div className="text-xs text-ink-tertiary">
                            + {formatCoins(r.bonusGc)} GC
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-secondary">
                        {r.validFrom ? new Date(r.validFrom).toLocaleDateString() : '—'}
                        {' → '}
                        {r.validUntil ? new Date(r.validUntil).toLocaleDateString() : '∞'}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEdit(r)}
                              disabled={busyId === r.id}
                              title="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {r.status === 'active' ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => patchStatus(r.id, 'inactive')}
                                disabled={busyId === r.id}
                                title="Disable"
                              >
                                <Ban className="h-3.5 w-3.5" />
                              </Button>
                            ) : r.status === 'inactive' ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => patchStatus(r.id, 'active')}
                                disabled={busyId === r.id}
                                title="Re-enable"
                              >
                                <Play className="h-3.5 w-3.5" />
                              </Button>
                            ) : null}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (confirm(`Archive ${r.code}?`)) {
                                  patchStatus(r.id, 'archived')
                                }
                              }}
                              disabled={busyId === r.id || r.status === 'archived'}
                              title="Archive"
                            >
                              <Archive className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <PromoCodeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        templates={templates}
        onSaved={() => window.location.reload()}
      />
    </>
  )
}
