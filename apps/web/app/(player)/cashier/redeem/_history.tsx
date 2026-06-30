'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Badge } from '@coinfrenzy/ui/primitives/badge'
import { Button } from '@coinfrenzy/ui/primitives/button'

import { formatCoins, formatUsd } from '@/lib/format'

interface Row {
  id: string
  status: string
  amountSc: string
  amountUsd: string
  method: string
  rejectionReason: string | null
  createdAt: string
  paidAt: string | null
}

interface Summary {
  redeemable: string
  redeemableUsd: string
}

interface Props {
  rows: Row[]
  summary: Summary
}

export function RedemptionList({ rows, summary }: Props) {
  const router = useRouter()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  async function cancel(id: string) {
    setBusy(id)
    setError(null)
    try {
      const res = await fetch(`/api/player/redemptions/${id}/cancel`, {
        method: 'POST',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 bg-card/40 p-4 text-center text-xs text-muted-foreground">
        No redemptions yet. Once you submit one, status updates land here in real time.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {error ? (
        <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}
      <ul className="divide-y divide-border/60 rounded-lg border border-border/60 bg-card">
        {rows.map((r) => {
          const cancellable =
            r.status === 'requested' || r.status === 'pending_review' || r.status === 'kyc_pending'
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-xs">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-foreground" data-numeric="true">
                    {formatUsd(r.amountUsd)}
                  </span>
                  <Badge variant={statusVariant(r.status)} className="text-[10px]">
                    {r.status.replace('_', ' ')}
                  </Badge>
                </div>
                <p className="mt-0.5 text-muted-foreground">
                  {formatCoins(r.amountSc)} SC · {r.method.replace('_', ' ')} ·{' '}
                  {new Date(r.createdAt).toLocaleString()}
                </p>
                {r.rejectionReason ? (
                  <p className="mt-0.5 text-destructive">Reason: {r.rejectionReason}</p>
                ) : null}
                {r.paidAt ? (
                  <p className="mt-0.5 text-success">Paid {new Date(r.paidAt).toLocaleString()}</p>
                ) : null}
              </div>
              {cancellable ? (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => void cancel(r.id)}
                  disabled={busy === r.id}
                >
                  {busy === r.id ? 'Cancelling…' : 'Cancel'}
                </Button>
              ) : null}
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-muted-foreground">Available to redeem: {summary.redeemableUsd}.</p>
    </div>
  )
}

function statusVariant(
  status: string,
): 'success' | 'destructive' | 'warning' | 'info' | 'secondary' {
  switch (status) {
    case 'paid':
      return 'success'
    case 'rejected':
    case 'failed':
    case 'cancelled':
      return 'destructive'
    case 'aml_hold':
      return 'warning'
    case 'awaiting_webhook':
    case 'submitted':
    case 'approved':
      return 'info'
    default:
      return 'secondary'
  }
}
