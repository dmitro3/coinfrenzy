'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, ClipboardList, MessageCircle, Phone, X } from 'lucide-react'

import { Button } from '@coinfrenzy/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@coinfrenzy/ui/primitives/dialog'
import { Label } from '@coinfrenzy/ui/primitives/label'
import { LogInteractionModal, VipBadge } from '@coinfrenzy/ui/admin'

import { relativeTime } from '@/lib/format'

export interface RosterPlayer {
  id: string
  email: string
  displayName: string | null
  vipStatus: 'vip' | 'high_roller' | 'candidate' | string
  hostAssignedAt: string | null
  lastSeenAt: string | null
  lastInteractionAt: string | null
  daysSinceLastInteraction: number
  needsAttention: boolean
  lifetimeSpendUsdMinor: string
}

const QUICK_CHANNELS = [
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { value: 'telegram', label: 'Telegram', icon: MessageCircle },
  { value: 'sms', label: 'SMS', icon: MessageCircle },
  { value: 'company_phone', label: 'Call', icon: Phone },
] as const

type QuickChannel = (typeof QUICK_CHANNELS)[number]['value']

export function HostPlayerRoster({
  players,
  hostName,
}: {
  players: RosterPlayer[]
  hostName: string
}) {
  const router = useRouter()
  const [modalPlayer, setModalPlayer] = React.useState<RosterPlayer | null>(null)
  const [quickPlayer, setQuickPlayer] = React.useState<RosterPlayer | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [flashId, setFlashId] = React.useState<string | null>(null)

  async function quickLog(player: RosterPlayer, channel: QuickChannel, type: 'text' | 'call') {
    setBusy(player.id)
    try {
      const res = await fetch('/api/admin/host/interaction', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          playerId: player.id,
          type,
          outcome: 'neutral',
          notes: null,
          metadata: { channel },
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        alert(body.error ?? `Failed (${res.status})`)
        return
      }
      setFlashId(player.id)
      setQuickPlayer(null)
      setTimeout(() => setFlashId(null), 1800)
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  if (players.length === 0) {
    return (
      <p className="text-sm text-ink-tertiary">
        No VIPs assigned. Use the{' '}
        <Link href="/admin/vip/assignments" className="text-brand hover:underline">
          assignments tool
        </Link>{' '}
        to assign players.
      </p>
    )
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-line-subtle text-xs uppercase tracking-wider text-ink-tertiary">
              <th className="py-2 pr-4 text-left font-medium">Player</th>
              <th className="py-2 pr-4 text-left font-medium">VIP</th>
              <th className="py-2 pr-4 text-left font-medium">Last touch</th>
              <th className="py-2 pr-4 text-left font-medium">Last seen</th>
              <th className="py-2 pr-4 text-right font-medium">Quick log</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr
                key={p.id}
                className={`border-b border-line-subtle/40 transition-colors ${
                  p.needsAttention ? 'bg-attention/5' : ''
                } ${flashId === p.id ? 'bg-positive/10' : ''}`}
              >
                <td className="py-3 pr-4">
                  <Link
                    href={`/admin/vip/${p.id}`}
                    className="font-medium text-ink-primary hover:underline"
                  >
                    {p.email}
                  </Link>
                  {p.displayName && (
                    <div className="text-xs text-ink-tertiary">{p.displayName}</div>
                  )}
                </td>
                <td className="py-3 pr-4">
                  <VipBadge status={p.vipStatus as 'vip' | 'high_roller' | 'candidate'} compact />
                </td>
                <td className="py-3 pr-4">
                  {p.lastInteractionAt ? (
                    <span className={p.needsAttention ? 'text-attention' : 'text-ink-secondary'}>
                      {relativeTime(new Date(p.lastInteractionAt))}
                    </span>
                  ) : (
                    <span className="text-critical">never</span>
                  )}
                  {p.needsAttention && (
                    <div className="text-[10px] uppercase tracking-wider text-attention">
                      Needs touch
                    </div>
                  )}
                </td>
                <td className="py-3 pr-4 text-ink-tertiary">
                  {p.lastSeenAt ? relativeTime(new Date(p.lastSeenAt)) : '—'}
                </td>
                <td className="py-3 pr-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {flashId === p.id ? (
                      <span className="inline-flex items-center gap-1 text-xs text-positive">
                        <Check className="h-3.5 w-3.5" /> Logged
                      </span>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy === p.id}
                          onClick={() => setQuickPlayer(p)}
                          title="Quick log (one click)"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy === p.id}
                          onClick={() => setModalPlayer(p)}
                          title="Log with notes"
                        >
                          <ClipboardList className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Full log modal (notes + outcome) */}
      <LogInteractionModal
        open={!!modalPlayer}
        onOpenChange={(v) => !v && setModalPlayer(null)}
        playerId={modalPlayer?.id ?? ''}
        playerLabel={modalPlayer?.email ?? ''}
        onLogged={() => {
          router.refresh()
        }}
      />

      {/* Quick log dialog (channel picker only) */}
      <Dialog open={!!quickPlayer} onOpenChange={(v) => !v && setQuickPlayer(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quick log a touch</DialogTitle>
            <DialogDescription>
              Records one outbound contact to{' '}
              <span className="font-medium">{quickPlayer?.email}</span> from {hostName}. Outcome
              defaults to neutral, no notes — use &ldquo;Log with notes&rdquo; if you need more
              detail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label className="text-sm">How did you reach them?</Label>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_CHANNELS.map((c) => {
                const Icon = c.icon
                return (
                  <Button
                    key={c.value}
                    variant="outline"
                    disabled={busy === quickPlayer?.id}
                    onClick={() => {
                      if (!quickPlayer) return
                      void quickLog(
                        quickPlayer,
                        c.value,
                        c.value === 'company_phone' ? 'call' : 'text',
                      )
                    }}
                    className="justify-start"
                  >
                    <Icon className="mr-2 h-4 w-4" /> {c.label}
                  </Button>
                )
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setQuickPlayer(null)}>
              <X className="h-3.5 w-3.5" /> Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
