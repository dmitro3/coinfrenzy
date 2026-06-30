'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { AssignmentModal, type HostOption, VipBadge } from '@coinfrenzy/ui/admin'
import { Button } from '@coinfrenzy/ui/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@coinfrenzy/ui/primitives/card'

export interface AssignablePlayerJson {
  id: string
  email: string
  displayName: string | null
  vipStatus: string
  vipQualifiedAt: string | null
  lifetimeSpendUsdMinor: string
}

interface AssignmentsClientProps {
  players: AssignablePlayerJson[]
  hosts: HostOption[]
}

export function AssignmentsClient({ players, hosts }: AssignmentsClientProps) {
  const router = useRouter()
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [modalOpen, setModalOpen] = React.useState(false)

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(players.map((p) => p.id)))
  }

  function clearSelection() {
    setSelected(new Set())
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Unassigned VIPs</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={selectAll} disabled={players.length === 0}>
              Select all
            </Button>
            <Button variant="ghost" onClick={clearSelection} disabled={selected.size === 0}>
              Clear
            </Button>
            <Button
              onClick={() => setModalOpen(true)}
              disabled={selected.size === 0 || hosts.length === 0}
            >
              Assign {selected.size} player{selected.size === 1 ? '' : 's'}…
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {players.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-ink-tertiary">
              All VIPs are assigned. Nothing to do here.
            </p>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-line-subtle text-xs uppercase tracking-wider text-ink-tertiary">
                  <th className="px-3 py-3 text-left font-medium">
                    <input
                      type="checkbox"
                      onChange={(e) => (e.target.checked ? selectAll() : clearSelection())}
                      checked={selected.size === players.length && players.length > 0}
                    />
                  </th>
                  <th className="px-3 py-3 text-left font-medium">Player</th>
                  <th className="px-3 py-3 text-left font-medium">Status</th>
                  <th className="px-3 py-3 text-right font-medium">Lifetime spend</th>
                  <th className="px-3 py-3 text-left font-medium">Qualified</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => {
                  const checked = selected.has(p.id)
                  return (
                    <tr
                      key={p.id}
                      className={
                        'cursor-pointer border-b border-line-subtle/40 ' +
                        (checked ? 'bg-brand-bg/30' : 'hover:bg-surface-hover/40')
                      }
                      onClick={() => toggle(p.id)}
                    >
                      <td className="px-3 py-3">
                        <input type="checkbox" checked={checked} readOnly />
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-medium text-ink-primary">{p.email}</p>
                        {p.displayName ? (
                          <p className="text-xs text-ink-tertiary">{p.displayName}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <VipBadge
                          status={p.vipStatus as 'vip' | 'high_roller' | 'candidate'}
                          compact
                        />
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-ink-primary">
                        ${(BigInt(p.lifetimeSpendUsdMinor) / 10000n).toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-ink-tertiary">
                        {p.vipQualifiedAt ? new Date(p.vipQualifiedAt).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <AssignmentModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        playerIds={Array.from(selected)}
        hosts={hosts}
        onAssigned={() => {
          setSelected(new Set())
          router.refresh()
        }}
      />
    </>
  )
}
