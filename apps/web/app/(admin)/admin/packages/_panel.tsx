'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Pencil, Sparkles, Star, Trash2, Wand2 } from 'lucide-react'

import { StatusPill } from '@coinfrenzy/ui/admin'
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

export interface PackageRowLite {
  id: string
  slug: string
  displayName: string
  // pre-formatted strings — server computes formatUsd / formatCoins so
  // the client never has to ship the bigint helpers.
  priceLabel: string
  gcLabel: string
  gcBonusLabel: string | null
  scLabel: string
  scBonusLabel: string | null
  revenueLabel: string
  promotionalLabel: string | null
  badgeColor: string | null
  sortOrder: number
  status: string
  firstPurchaseOnly: boolean
  featuredSlot: number | null
  bannerHeadline: string | null
  lifetimeSales: number
}

interface PackagesPanelProps {
  rows: PackageRowLite[]
  canEdit: boolean
}

// `formatCoins` / `formatUsd` already executed server-side. The panel
// only handles interactivity: reorder controls, feature-slot toggling,
// delete confirmation.
export function PackagesPanel({ rows, canEdit }: PackagesPanelProps) {
  const router = useRouter()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState<PackageRowLite | null>(null)

  // Split the rows into featured + welcome + standard buckets so each
  // group renders as its own section. Featured slots get top billing
  // because they map 1:1 to the on-shop banner placements.
  const featured = rows.filter((r) => r.featuredSlot !== null).sort(byFeaturedSlot)
  const welcome = rows.filter((r) => r.firstPurchaseOnly && r.featuredSlot === null)
  const standard = rows.filter((r) => !r.firstPurchaseOnly && r.featuredSlot === null)

  async function setSlot(row: PackageRowLite, slot: 1 | 2 | null) {
    if (!canEdit) return
    setBusy(row.id)
    try {
      const res = await fetch(`/api/admin/packages/${row.id}/feature`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slot }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null
        if (err?.error === 'featured_slot_taken') {
          alert(`Slot ${slot} is already taken. Remove the existing package first.`)
        } else {
          alert(`Could not update feature slot: ${err?.error ?? res.statusText}`)
        }
        return
      }
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  async function moveRow(group: PackageRowLite[], index: number, dir: -1 | 1) {
    if (!canEdit) return
    const target = group[index + dir]
    const me = group[index]
    if (!target || !me) return
    setBusy(me.id)
    try {
      const res = await fetch('/api/admin/packages/reorder', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          positions: [
            { id: me.id, sortOrder: target.sortOrder },
            { id: target.id, sortOrder: me.sortOrder },
          ],
        }),
      })
      if (!res.ok) {
        alert('Could not reorder packages.')
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
    try {
      const res = await fetch(`/api/admin/packages/${confirmDelete.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null
        alert(`Could not delete: ${err?.error ?? res.statusText}`)
        return
      }
      setConfirmDelete(null)
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* ---- Featured slot section -------------------------------------- */}
      <section className="space-y-3">
        <header className="flex items-baseline justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-violet-200">
              <Sparkles className="h-4 w-4" /> Featured slots
            </h2>
            <p className="text-xs text-ink-tertiary">
              These render as banner cards on top of the player shop. At most one each in slot 1 and
              slot 2.
            </p>
          </div>
        </header>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[1, 2].map((slot) => {
            const occupant = featured.find((f) => f.featuredSlot === slot) ?? null
            return (
              <Card key={slot} className="border-violet-500/40 bg-violet-500/5">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium uppercase tracking-wider text-violet-200">
                      Slot {slot}
                    </div>
                    {occupant ? (
                      canEdit ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setSlot(occupant, null)}
                          disabled={busy === occupant.id}
                        >
                          Clear
                        </Button>
                      ) : null
                    ) : (
                      <FeaturePicker
                        rows={[...standard, ...welcome]}
                        slot={slot as 1 | 2}
                        disabled={!canEdit}
                        onPick={(row) => setSlot(row, slot as 1 | 2)}
                      />
                    )}
                  </div>
                  {occupant ? (
                    <div className="space-y-1">
                      <div className="text-base font-semibold text-ink-primary">
                        {occupant.bannerHeadline ?? occupant.displayName}
                      </div>
                      <div className="text-xs text-ink-tertiary">
                        {occupant.slug} · sort {occupant.sortOrder}
                      </div>
                      {occupant.promotionalLabel ? (
                        <div className="text-xs text-violet-300">{occupant.promotionalLabel}</div>
                      ) : null}
                      <div className="pt-2">
                        <Link
                          href={`/admin/packages/${occupant.id}`}
                          className="text-xs font-medium text-violet-300 hover:underline"
                        >
                          Edit banner copy →
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed border-violet-500/30 px-3 py-4 text-center text-xs text-ink-tertiary">
                      No package featured here. Pick one to deploy a banner.
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      {/* ---- Welcome packages section ----------------------------------- */}
      {welcome.length > 0 ? (
        <section className="space-y-3">
          <header>
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-amber-200">
              <Wand2 className="h-4 w-4" /> Welcome packages
            </h2>
            <p className="text-xs text-ink-tertiary">
              Shown only to brand-new players. After a player&apos;s first paid purchase the
              standard packages take over and welcome packages disappear forever.
            </p>
          </header>
          <PackageTable
            rows={welcome}
            canEdit={canEdit}
            busy={busy}
            onMove={(i, d) => moveRow(welcome, i, d)}
            onDelete={(r) => setConfirmDelete(r)}
          />
        </section>
      ) : null}

      {/* ---- Standard packages section ---------------------------------- */}
      <section className="space-y-3">
        <header>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Standard packages
          </h2>
          <p className="text-xs text-ink-tertiary">
            Shown to all players after their first purchase. Drag the arrows to reorder.
          </p>
        </header>
        <PackageTable
          rows={standard}
          canEdit={canEdit}
          busy={busy}
          onMove={(i, d) => moveRow(standard, i, d)}
          onDelete={(r) => setConfirmDelete(r)}
        />
      </section>

      {/* ---- Delete confirmation --------------------------------------- */}
      <Dialog open={confirmDelete !== null} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete package</DialogTitle>
            <DialogDescription>
              Archive <span className="font-semibold">{confirmDelete?.displayName}</span>? Existing
              purchases keep their reference. Players will no longer see the package in the shop.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={doDelete} disabled={busy !== null}>
              Archive package
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface TableProps {
  rows: PackageRowLite[]
  canEdit: boolean
  busy: string | null
  onMove: (index: number, dir: -1 | 1) => void
  onDelete: (row: PackageRowLite) => void
}

function PackageTable({ rows, canEdit, busy, onMove, onDelete }: TableProps) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="px-4 py-6 text-center text-sm text-ink-tertiary">
          No packages in this group.
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line-subtle text-left text-xs font-medium uppercase tracking-wide text-ink-tertiary">
              <th className="w-24 px-4 py-2 text-right">Order</th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2 text-right">Price</th>
              <th className="px-4 py-2 text-right">GC + bonus</th>
              <th className="px-4 py-2 text-right">SC + bonus</th>
              <th className="px-4 py-2">Label</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Sales</th>
              <th className="px-4 py-2 text-right">Revenue</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.id}
                className="border-b border-line-subtle text-sm last:border-b-0 hover:bg-surface-hover"
              >
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span className="font-mono text-xs tabular-nums text-ink-tertiary">
                      {r.sortOrder}
                    </span>
                    {canEdit ? (
                      <div className="flex flex-col">
                        <button
                          type="button"
                          aria-label="Move up"
                          disabled={i === 0 || busy === r.id}
                          onClick={() => onMove(i, -1)}
                          className="rounded p-0.5 text-ink-tertiary hover:bg-surface-hover hover:text-ink-primary disabled:opacity-30"
                        >
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          aria-label="Move down"
                          disabled={i === rows.length - 1 || busy === r.id}
                          onClick={() => onMove(i, 1)}
                          className="rounded p-0.5 text-ink-tertiary hover:bg-surface-hover hover:text-ink-primary disabled:opacity-30"
                        >
                          <ArrowDown className="h-3 w-3" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 text-ink-primary">
                    {r.featuredSlot !== null ? (
                      <Sparkles className="h-3.5 w-3.5 text-violet-400" />
                    ) : r.promotionalLabel ? (
                      <Star className="h-3.5 w-3.5 text-attention" />
                    ) : null}
                    <Link href={`/admin/packages/${r.id}`} className="font-medium hover:underline">
                      {r.displayName}
                    </Link>
                  </div>
                  <div className="font-mono text-xs text-ink-tertiary">{r.slug}</div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-ink-primary">
                  {r.priceLabel}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <div className="text-ink-primary">{r.gcLabel}</div>
                  {r.gcBonusLabel ? (
                    <div className="text-xs text-positive">{r.gcBonusLabel}</div>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <div className="text-ink-primary">{r.scLabel}</div>
                  {r.scBonusLabel ? (
                    <div className="text-xs text-positive">{r.scBonusLabel}</div>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-xs text-ink-secondary">
                  {r.promotionalLabel ? (
                    <span className="font-medium text-ink-primary">{r.promotionalLabel}</span>
                  ) : (
                    <span className="text-ink-tertiary">—</span>
                  )}
                  {r.firstPurchaseOnly ? (
                    <div className="text-[10px] uppercase tracking-wide text-notice">welcome</div>
                  ) : null}
                  {r.featuredSlot ? (
                    <div className="text-[10px] uppercase tracking-wide text-violet-300">
                      featured · slot {r.featuredSlot}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <StatusPill
                    status="custom"
                    color={
                      r.status === 'active'
                        ? 'positive'
                        : r.status === 'inactive'
                          ? 'neutral'
                          : 'critical'
                    }
                    label={r.status}
                  />
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-ink-secondary">
                  {r.lifetimeSales.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-ink-primary">
                  {r.revenueLabel}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/admin/packages/${r.id}`}
                      aria-label="Edit"
                      className="rounded-md border border-line-subtle p-1.5 text-ink-secondary hover:bg-surface-hover"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Link>
                    {canEdit ? (
                      <button
                        type="button"
                        aria-label="Delete"
                        onClick={() => onDelete(r)}
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
  )
}

function FeaturePicker({
  rows,
  slot,
  disabled,
  onPick,
}: {
  rows: PackageRowLite[]
  slot: 1 | 2
  disabled: boolean
  onPick: (row: PackageRowLite) => void
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={disabled || rows.length === 0}
      >
        Pick package
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Promote a package to slot {slot}</DialogTitle>
            <DialogDescription>
              Pick any active package. It will show as a banner above the regular grid.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto rounded-md border border-line-subtle">
            {rows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setOpen(false)
                  onPick(r)
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-surface-hover"
              >
                <span className="font-medium text-ink-primary">{r.displayName}</span>
                <span className="text-xs text-ink-tertiary">{r.slug}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function byFeaturedSlot(a: PackageRowLite, b: PackageRowLite): number {
  return (a.featuredSlot ?? 99) - (b.featuredSlot ?? 99)
}
