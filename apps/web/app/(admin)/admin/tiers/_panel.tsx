'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Pencil, Trash2 } from 'lucide-react'

import { StatusPill } from '@coinfrenzy/ui/admin'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'
import { Button } from '@coinfrenzy/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@coinfrenzy/ui/primitives/dialog'

export interface TierRowLite {
  id: string
  slug: string
  displayName: string
  level: number
  badgeColor: string | null
  description: string | null
  status: string
  xpRequiredLabel: string
  weeklyScLabel: string
  monthlyScLabel: string
  loginMultLabel: string
  cashbackLabel: string
  playerCount: number
  weeklyPayoutLabel: string
}

interface TiersPanelProps {
  rows: TierRowLite[]
  canEdit: boolean
}

export function TiersPanel({ rows, canEdit }: TiersPanelProps) {
  const router = useRouter()
  const [order, setOrder] = React.useState(rows)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState<TierRowLite | null>(null)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)

  // Sync local order when the server hands us a fresh list (e.g. after
  // a refresh). React's state isn't auto-reset from props.
  React.useEffect(() => {
    setOrder(rows)
  }, [rows])

  async function move(index: number, dir: -1 | 1) {
    if (!canEdit) return
    const target = order[index + dir]
    const me = order[index]
    if (!target || !me) return
    const next = order.slice()
    next[index + dir] = me
    next[index] = target
    setOrder(next)
    setBusy(me.id)
    try {
      const res = await fetch('/api/admin/tiers/reorder', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderedIds: next.map((r) => r.id) }),
      })
      if (!res.ok) {
        // Revert local reorder on failure.
        setOrder(order)
        const err = (await res.json().catch(() => null)) as { error?: string } | null
        alert(`Could not reorder tiers: ${err?.error ?? res.statusText}`)
        return
      }
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  async function doDelete() {
    if (!confirmDelete) return
    setBusy(confirmDelete.id)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/admin/tiers/${confirmDelete.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string
          details?: { playerCount?: number }
        } | null
        if (data?.error === 'tier_in_use') {
          setDeleteError(
            `${data.details?.playerCount ?? 'Some'} players are still in this tier (or a package gates on it). Move them out first, or set the tier inactive instead.`,
          )
          return
        }
        setDeleteError(`Could not delete tier: ${data?.error ?? res.statusText}`)
        return
      }
      setConfirmDelete(null)
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-subtle text-left text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                <th className="w-24 px-4 py-2 text-right">Lvl</th>
                <th className="px-4 py-2">Tier</th>
                <th className="px-4 py-2 text-right">XP threshold</th>
                <th className="px-4 py-2 text-right">Players</th>
                <th className="px-4 py-2 text-right">Weekly SC</th>
                <th className="px-4 py-2 text-right">Monthly SC</th>
                <th className="px-4 py-2 text-right">Login ×</th>
                <th className="px-4 py-2 text-right">Cashback</th>
                <th className="px-4 py-2 text-right">Weekly cost</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {order.map((t, i) => (
                <tr
                  key={t.id}
                  className="border-b border-line-subtle text-sm last:border-b-0 hover:bg-surface-hover"
                >
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <span className="font-mono text-xs tabular-nums text-ink-tertiary">
                        {t.level}
                      </span>
                      {canEdit ? (
                        <div className="flex flex-col">
                          <button
                            type="button"
                            aria-label="Move up"
                            disabled={i === 0 || busy === t.id}
                            onClick={() => move(i, -1)}
                            className="rounded p-0.5 text-ink-tertiary hover:bg-surface-hover hover:text-ink-primary disabled:opacity-30"
                          >
                            <ArrowUp className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            aria-label="Move down"
                            disabled={i === order.length - 1 || busy === t.id}
                            onClick={() => move(i, 1)}
                            className="rounded p-0.5 text-ink-tertiary hover:bg-surface-hover hover:text-ink-primary disabled:opacity-30"
                          >
                            <ArrowDown className="h-3 w-3" />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="inline-flex h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: t.badgeColor ?? '#6b7280' }}
                      />
                      <Link
                        href={`/admin/tiers/${t.id}`}
                        className="font-medium text-ink-primary hover:underline"
                      >
                        {t.displayName}
                      </Link>
                    </div>
                    {t.description ? (
                      <div className="truncate text-xs text-ink-tertiary">{t.description}</div>
                    ) : null}
                    <div className="font-mono text-[10px] text-ink-tertiary">{t.slug}</div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-secondary">
                    {t.xpRequiredLabel}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-primary">
                    {t.playerCount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-secondary">
                    {t.weeklyScLabel}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-secondary">
                    {t.monthlyScLabel}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-secondary">
                    {t.loginMultLabel}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-secondary">
                    {t.cashbackLabel}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-amber-200">
                    {t.weeklyPayoutLabel} SC
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill
                      status="custom"
                      color={t.status === 'active' ? 'positive' : 'neutral'}
                      label={t.status}
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/admin/tiers/${t.id}`}
                        aria-label="Edit"
                        className="rounded-md border border-line-subtle p-1.5 text-ink-secondary hover:bg-surface-hover"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Link>
                      {canEdit ? (
                        <button
                          type="button"
                          aria-label="Delete"
                          onClick={() => {
                            setDeleteError(null)
                            setConfirmDelete(t)
                          }}
                          className="rounded-md border border-line-subtle p-1.5 text-critical hover:bg-critical/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(v) => {
          if (!v) {
            setConfirmDelete(null)
            setDeleteError(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete tier</DialogTitle>
            <DialogDescription>
              Hard-delete <span className="font-semibold">{confirmDelete?.displayName}</span>? This
              is rejected if any players are still in this tier. For safety we recommend setting the
              tier to <span className="font-semibold">inactive</span> instead — that&apos;s
              reversible and keeps the row for audit.
            </DialogDescription>
          </DialogHeader>
          {deleteError ? (
            <div className="rounded-md border border-critical/40 bg-critical/10 px-3 py-2 text-sm text-critical">
              {deleteError}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={doDelete} disabled={busy !== null}>
              Delete tier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
