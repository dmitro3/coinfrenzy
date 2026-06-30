'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, ShieldAlert, XCircle } from 'lucide-react'

import { Button } from '@coinfrenzy/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@coinfrenzy/ui/primitives/dialog'
import { Input } from '@coinfrenzy/ui/primitives/input'

import { formatCoins, formatUsd } from '@/lib/format'

import type { RedemptionDetail } from './_data'

// docs/07 §7.1 / §7.2 — Cashier action row.
//
// Product spec (May 2026 refresh): cashiers only ever Approve or Cancel.
// Both actions require a second confirmation in a modal — accidentally
// approving a $5k payout or cancelling someone's legitimate request is
// expensive both ways, so the extra click is worth the friction. AML hold
// rows keep their three-button workflow (clear / confirm / escalate) on
// the AML page because manager+ users own that screen separately.
//
// SC handling: Cancel calls the same core function as Reject, which fires
// the `redemption_rejected` ledger transaction. That transaction reads
// the original `drain_plan` jsonb on the redemption row and credits every
// drained SC back to the same sub-bucket it came from (purchased,
// earned, promo, bonus). The player's wallet is fully whole the moment
// the API returns 200.
//
// Layout (June 2026): cashiers were scrolling past the KPI tiles + every
// player card on the detail pane just to reach the bottom-row buttons.
// We now hoist the two pending-action buttons up into the detail header
// via <CashierQuickActions> (rendered by DetailPane next to the dollar
// amount). The bottom panel keeps the dialogs + AML controls + the
// "Cancel returns N SC to the player" reminder. Both surfaces share
// state through the `useCashierActions` hook so the user can click the
// top button and the same dialog opens.

interface ActionPanelProps {
  detail: RedemptionDetail
  /** Shared state from useCashierActions, threaded in by DetailPane. */
  actions?: CashierActionsState
}

// ---------------------------------------------------------------------------
// Shared state hook — owns busy/error/open and exposes the two confirms +
// AML controls. DetailPane calls this once and passes the result to both
// <CashierQuickActions> (header) and <CashierActionPanel> (bottom).
// ---------------------------------------------------------------------------

export interface CashierActionsState {
  detail: RedemptionDetail
  busy: null | 'approve' | 'cancel' | 'aml'
  error: string | null
  open: null | 'approve' | 'cancel'
  setOpen: (v: null | 'approve' | 'cancel') => void
  approveNote: string
  setApproveNote: (v: string) => void
  cancelNote: string
  setCancelNote: (v: string) => void
  amlNotes: string
  setAmlNotes: (v: string) => void
  isPending: boolean
  isAml: boolean
  cannotAct: boolean
  blockApproveForKyc: boolean
  approve: () => Promise<void>
  cancel: () => Promise<void>
  amlAction: (action: 'clear' | 'confirm_hold' | 'escalate') => Promise<void>
}

export function useCashierActions(detail: RedemptionDetail): CashierActionsState {
  const router = useRouter()
  const [busy, setBusy] = React.useState<null | 'approve' | 'cancel' | 'aml'>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState<null | 'approve' | 'cancel'>(null)
  const [approveNote, setApproveNote] = React.useState('')
  const [cancelNote, setCancelNote] = React.useState('')
  const [amlNotes, setAmlNotes] = React.useState('')

  // Whenever the dialog opens or closes, drop any stale error so we don't
  // surface yesterday's failure on today's action.
  React.useEffect(() => {
    setError(null)
  }, [open])

  // If the cashier switches to another row in the list, reset all
  // transient form state so the next selection starts clean.
  React.useEffect(() => {
    setOpen(null)
    setBusy(null)
    setError(null)
    setApproveNote('')
    setCancelNote('')
    setAmlNotes('')
  }, [detail.id])

  const approve = React.useCallback(async () => {
    setBusy('approve')
    setError(null)
    try {
      const res = await fetch(`/api/admin/redemptions/${detail.id}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: approveNote.trim() || null }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.code ?? body.error ?? `HTTP ${res.status}`)
      }
      setOpen(null)
      setApproveNote('')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }, [approveNote, detail.id, router])

  const cancel = React.useCallback(async () => {
    setBusy('cancel')
    setError(null)
    try {
      const res = await fetch(`/api/admin/redemptions/${detail.id}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: cancelNote.trim() || null }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.code ?? body.error ?? `HTTP ${res.status}`)
      }
      setOpen(null)
      setCancelNote('')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }, [cancelNote, detail.id, router])

  const amlAction = React.useCallback(
    async (action: 'clear' | 'confirm_hold' | 'escalate') => {
      setBusy('aml')
      setError(null)
      try {
        const res = await fetch(`/api/admin/redemptions/${detail.id}/aml-action`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action, notes: amlNotes || null }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.code ?? body.error ?? `HTTP ${res.status}`)
        }
        setAmlNotes('')
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(null)
      }
    },
    [amlNotes, detail.id, router],
  )

  const isAml = detail.status === 'aml_hold'
  const isPending = detail.status === 'pending_review' || detail.status === 'kyc_pending'
  const cannotAct = !isAml && !isPending
  const blockApproveForKyc = detail.status === 'kyc_pending'

  return {
    detail,
    busy,
    error,
    open,
    setOpen,
    approveNote,
    setApproveNote,
    cancelNote,
    setCancelNote,
    amlNotes,
    setAmlNotes,
    isPending,
    isAml,
    cannotAct,
    blockApproveForKyc,
    approve,
    cancel,
    amlAction,
  }
}

// ---------------------------------------------------------------------------
// Compact top buttons — render next to the amount in the detail header.
// Pending rows get Approve + Cancel; non-pending rows render nothing here
// (AML actions need the inline notes field and live at the bottom).
// ---------------------------------------------------------------------------

export function CashierQuickActions({ actions }: { actions: CashierActionsState }) {
  if (!actions.isPending) return null
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button
        type="button"
        size="sm"
        onClick={() => actions.setOpen('approve')}
        disabled={actions.busy !== null || actions.blockApproveForKyc}
        title={
          actions.blockApproveForKyc
            ? 'Player has not completed KYC; approval will refuse server-side.'
            : 'Approve and submit to Finix.'
        }
        className="bg-success/90 text-success-foreground hover:bg-success"
      >
        <CheckCircle2 className="mr-1 h-4 w-4" /> Approve
      </Button>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        onClick={() => actions.setOpen('cancel')}
        disabled={actions.busy !== null}
        title="Cancel and return SC to the player wallet."
      >
        <XCircle className="mr-1 h-4 w-4" /> Cancel + return SC
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bottom panel — context + AML controls + the two confirm dialogs.
//
// Pending status: just the SC-return reminder + the dialogs (the action
// buttons themselves now live in the header via CashierQuickActions).
//
// AML status: the inline notes input + three buttons + dialogs.
// ---------------------------------------------------------------------------

export function CashierActionPanel({ detail, actions: passed }: ActionPanelProps) {
  // Standalone fallback so callers can still mount this component without
  // wiring up the hook. Most callers (DetailPane) pass `actions` explicitly.
  // ESLint sees the hook call after a conditional, but the conditional is
  // on a prop that doesn't change for the life of the component instance,
  // so the rule-of-hooks contract holds.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const local = passed ?? useCashierActions(detail)

  return (
    <section className="space-y-3 rounded-lg border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Action context</h3>
        {!local.cannotAct ? (
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Each action asks for a second confirm
          </span>
        ) : null}
      </div>
      {local.cannotAct ? (
        <p className="text-xs text-muted-foreground">
          Status <code>{detail.status}</code> doesn&apos;t accept review actions.
        </p>
      ) : null}
      {local.error && !local.open ? (
        <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {local.error}
        </div>
      ) : null}

      {local.isPending ? (
        <p className="text-[11px] text-muted-foreground">
          Approve and Cancel are at the top of this pane, next to the amount. Cancel automatically
          credits{' '}
          <span className="font-mono text-foreground">{formatCoins(detail.amountSc)} SC</span> back
          to the player&apos;s wallet.
        </p>
      ) : null}

      {local.isAml ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            AML hold — manager+ only. Clearing returns the row to the pending review queue.
            Confirming keeps it locked. Escalating suspends the account and routes to legal.
          </p>
          <Input
            className="h-8 text-xs"
            placeholder="AML note (audit-logged)"
            value={local.amlNotes}
            onChange={(e) => local.setAmlNotes(e.target.value)}
            disabled={local.busy !== null}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void local.amlAction('clear')}
              disabled={local.busy !== null}
            >
              <ShieldAlert className="mr-1 h-4 w-4" /> Clear (false positive)
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void local.amlAction('confirm_hold')}
              disabled={local.busy !== null}
            >
              Confirm hold
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => void local.amlAction('escalate')}
              disabled={local.busy !== null}
            >
              Escalate to legal
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={local.open === 'approve'}
        onOpenChange={(v) => local.setOpen(v ? 'approve' : null)}
        tone="positive"
        title={`Approve $${formatCoins(detail.amountUsd)}?`}
        description={`This sends ${formatCoins(detail.amountSc)} SC ($${formatCoins(
          detail.amountUsd,
        )}) to Finix for ACH payout to ${detail.player.displayName ?? detail.player.email}. Approvals are final once Finix accepts the transfer.`}
        confirmLabel="Yes, approve and submit"
        cancelLabel="Cancel"
        busy={local.busy === 'approve'}
        error={local.open === 'approve' ? local.error : null}
        onConfirm={local.approve}
        bullets={[
          `Player: ${detail.player.displayName ?? detail.player.email} (KYC ${detail.player.kycLevel})`,
          `Method: ${detail.method.replace('_', ' ')}`,
          detail.paymentInstrument?.accountLast4
            ? `Bank: ${detail.paymentInstrument.bankName ?? '—'} ****${detail.paymentInstrument.accountLast4}`
            : null,
        ].filter((b): b is string => b !== null)}
      >
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">Approval note (optional, audit-logged)</span>
          <Input
            value={local.approveNote}
            onChange={(e) => local.setApproveNote(e.target.value)}
            placeholder="e.g. Verified bank account, third repeat redemption"
            className="h-8 text-xs"
            disabled={local.busy !== null}
          />
        </label>
      </ConfirmDialog>

      <ConfirmDialog
        open={local.open === 'cancel'}
        onOpenChange={(v) => local.setOpen(v ? 'cancel' : null)}
        tone="destructive"
        title={`Cancel $${formatCoins(detail.amountUsd)} redemption?`}
        description={`This will cancel the redemption and credit ${formatCoins(detail.amountSc)} SC back to ${detail.player.displayName ?? detail.player.email}'s wallet immediately. The player will keep their SC and can request a new redemption whenever they like.`}
        confirmLabel="Yes, cancel and return SC"
        cancelLabel="Keep waiting"
        busy={local.busy === 'cancel'}
        error={local.open === 'cancel' ? local.error : null}
        onConfirm={local.cancel}
        bullets={[
          `SC returned: ${formatCoins(detail.amountSc)} SC`,
          `USD-equivalent: ${formatUsd(detail.amountUsd)}`,
          `Goes back to: ${describeBuckets(detail)}`,
        ]}
      >
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">
            Cancel reason (optional, audit-logged + visible to player)
          </span>
          <Input
            value={local.cancelNote}
            onChange={(e) => local.setCancelNote(e.target.value)}
            placeholder="e.g. Duplicate request, player asked to cancel"
            className="h-8 text-xs"
            disabled={local.busy !== null}
          />
        </label>
      </ConfirmDialog>
    </section>
  )
}

function describeBuckets(detail: RedemptionDetail): string {
  if (!detail.drainPlan || detail.drainPlan.length === 0) return 'player SC wallet'
  return detail.drainPlan
    .map((step) => {
      const label =
        step.bucket === 'purchased'
          ? 'Purchased'
          : step.bucket === 'earned'
            ? 'Earned'
            : step.bucket === 'promo'
              ? 'Promo'
              : step.bucket === 'bonus'
                ? 'Bonus'
                : step.bucket
      return `${formatCoins(BigInt(step.amount))} ${label}`
    })
    .join(' + ')
}

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  tone: 'positive' | 'destructive'
  title: string
  description: string
  confirmLabel: string
  cancelLabel: string
  busy: boolean
  error: string | null
  onConfirm: () => void
  bullets?: string[]
  children?: React.ReactNode
}

function ConfirmDialog(props: ConfirmDialogProps) {
  const Icon = props.tone === 'destructive' ? AlertTriangle : CheckCircle2
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Icon
              className={`h-5 w-5 ${
                props.tone === 'destructive' ? 'text-destructive' : 'text-success'
              }`}
            />
            {props.title}
          </DialogTitle>
          <DialogDescription>{props.description}</DialogDescription>
        </DialogHeader>
        {props.bullets && props.bullets.length > 0 ? (
          <ul className="space-y-1 rounded-md border border-border/60 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
            {props.bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="mt-1 inline-block h-1 w-1 rounded-full bg-muted-foreground" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {props.children}
        {props.error ? (
          <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {props.error}
          </div>
        ) : null}
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => props.onOpenChange(false)}
            disabled={props.busy}
          >
            {props.cancelLabel}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={props.tone === 'destructive' ? 'destructive' : 'default'}
            onClick={() => props.onConfirm()}
            disabled={props.busy}
            className={
              props.tone === 'positive'
                ? 'bg-success/90 text-success-foreground hover:bg-success'
                : undefined
            }
          >
            {props.busy ? 'Working…' : props.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
