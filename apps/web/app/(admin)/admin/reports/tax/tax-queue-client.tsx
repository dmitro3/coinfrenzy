'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

import { Button } from '@coinfrenzy/ui/primitives/button'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'

import { formatMoney } from '../_shared.client'

export interface TaxQueueRow {
  id: string
  playerId: string
  playerEmail: string
  playerDisplayName: string | null
  taxYear: number
  formType: string
  totalAmountUsd: string
  redemptionCount: number
  status: string
  generatedAt: string | null
  deliveredAt: string | null
  filedAt: string | null
  deliveryMethod: string | null
  createdAt: string
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending_generation', label: 'Pending generation' },
  { value: 'generated', label: 'Generated' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'filed', label: 'Filed' },
  { value: 'cancelled', label: 'Cancelled' },
] as const

const STATUS_LABEL: Record<string, string> = {
  pending_generation: 'Pending',
  generated: 'Generated',
  delivered: 'Delivered',
  filed: 'Filed',
  cancelled: 'Cancelled',
}

const STATUS_TONE: Record<string, string> = {
  pending_generation: 'bg-amber-950/40 text-amber-200 ring-amber-500/30',
  generated: 'bg-blue-950/40 text-blue-200 ring-blue-500/30',
  delivered: 'bg-emerald-950/40 text-emerald-200 ring-emerald-500/30',
  filed: 'bg-emerald-700/40 text-emerald-50 ring-emerald-400/40',
  cancelled: 'bg-line-subtle text-ink-tertiary ring-line-default',
}

interface Props {
  rows: TaxQueueRow[]
  year: number
  years: number[]
  statusFilter: string
}

export function TaxQueueClient({ rows, year, years, statusFilter }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function applyFilter(name: 'year' | 'status', value: string) {
    const next = new URLSearchParams(params.toString())
    if (value === '' || value === 'all') next.delete(name)
    else next.set(name, value)
    router.push(`/admin/reports/tax?${next.toString()}`)
  }

  function postAction(id: string, action: string, body: Record<string, unknown> = {}) {
    setError(null)
    setBusyId(id)
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/reports/tax/${id}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action, ...body }),
        })
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(j?.error ?? `HTTP ${res.status}`)
        }
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Action failed')
      } finally {
        setBusyId(null)
      }
    })
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-2">
            <span className="text-ink-tertiary">Year</span>
            <select
              value={year}
              onChange={(e) => applyFilter('year', e.target.value)}
              className="rounded border border-line-subtle bg-surface-2 px-2 py-1 text-ink-primary"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-ink-tertiary">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => applyFilter('status', e.target.value)}
              className="rounded border border-line-subtle bg-surface-2 px-2 py-1 text-ink-primary"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <div className="ml-auto text-ink-tertiary">
            {rows.length} row{rows.length === 1 ? '' : 's'}
          </div>
        </div>

        {error ? <div className="text-xs text-red-400">{error}</div> : null}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-tertiary">
              <tr className="border-b border-line-subtle">
                <th className="py-2 pr-3">Player</th>
                <th className="py-2 pr-3">Form</th>
                <th className="py-2 pr-3 text-right">Total USD</th>
                <th className="py-2 pr-3 text-right">Redemptions</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Last action</th>
                <th className="py-2 pr-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-ink-tertiary">
                    No tax filings for this year/filter.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const last = r.filedAt ?? r.deliveredAt ?? r.generatedAt ?? r.createdAt
                  return (
                    <tr key={r.id} className="border-b border-line-subtle/60">
                      <td className="py-2 pr-3">
                        <Link
                          href={`/admin/players/${r.playerId}`}
                          className="text-ink-primary underline-offset-2 hover:underline"
                        >
                          {r.playerDisplayName ?? r.playerEmail}
                        </Link>
                        <div className="text-[11px] text-ink-tertiary">{r.playerEmail}</div>
                      </td>
                      <td className="py-2 pr-3 text-ink-secondary">{r.formType}</td>
                      <td className="py-2 pr-3 text-right font-mono text-ink-primary">
                        ${formatMoney(r.totalAmountUsd)}
                      </td>
                      <td className="py-2 pr-3 text-right text-ink-secondary">
                        {r.redemptionCount}
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={`inline-flex rounded px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                            STATUS_TONE[r.status] ?? STATUS_TONE.cancelled
                          }`}
                        >
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-[11px] text-ink-tertiary">
                        {new Date(last).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <div className="inline-flex flex-wrap gap-1">
                          {r.status === 'pending_generation' && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={pending && busyId === r.id}
                              onClick={() => postAction(r.id, 'generate')}
                            >
                              Generate
                            </Button>
                          )}
                          {r.status === 'generated' && (
                            <>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                disabled={pending && busyId === r.id}
                                onClick={() => postAction(r.id, 'deliver', { method: 'email' })}
                              >
                                Mark delivered
                              </Button>
                            </>
                          )}
                          {r.status === 'delivered' && (
                            <Button
                              type="button"
                              size="sm"
                              disabled={pending && busyId === r.id}
                              onClick={() => postAction(r.id, 'file')}
                            >
                              Mark filed
                            </Button>
                          )}
                          {r.status !== 'filed' && r.status !== 'cancelled' && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={pending && busyId === r.id}
                              onClick={() => postAction(r.id, 'cancel')}
                            >
                              Cancel
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
