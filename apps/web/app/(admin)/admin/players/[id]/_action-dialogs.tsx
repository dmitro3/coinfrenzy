'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  EyeOff,
  KeyRound,
  Mail,
  MoreHorizontal,
  PenSquare,
  RotateCcw,
  ScrollText,
  ShieldCheck,
  ShieldOff,
  StickyNote,
  Trash2,
  UserCog,
  Zap,
} from 'lucide-react'

import { Button } from '@coinfrenzy/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@coinfrenzy/ui/primitives/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@coinfrenzy/ui/primitives/dropdown-menu'
import { Input } from '@coinfrenzy/ui/primitives/input'
import { Label } from '@coinfrenzy/ui/primitives/label'

import type { MessageTemplateRow } from './_data'

interface PlayerEditableSnapshot {
  email: string
  username: string | null
  displayName: string | null
  firstName: string | null
  lastName: string | null
  phone: string | null
  state: string | null
  emailConsent: boolean
  smsConsent: boolean
  kycLevel: number
  stealthLocked: boolean
}

interface ActionDialogsProps {
  playerId: string
  playerEmail: string
  playerHasPhone: boolean
  currentStatus: string
  /** Snapshot of editable fields for the Edit Account / KYC dialogs. */
  editable: PlayerEditableSnapshot
  canManage: boolean
  canMaster: boolean
  emailTemplates: MessageTemplateRow[]
  smsTemplates: MessageTemplateRow[]
  /**
   * Visual style. `bar` renders a horizontal action row (used in the
   * player detail header), `stack` renders a vertical column (legacy
   * sidebar layout).
   */
  variant?: 'bar' | 'stack'
}

type DialogKind =
  | null
  | 'suspend'
  | 'reactivate'
  | 'reset-2fa'
  | 'send-funds'
  | 'send-message'
  | 'add-note'
  | 'revoke-sessions'
  | 'edit-account'
  | 'set-kyc'
  | 'password-reset'
  | 'stealth-lock'
  | 'wipe'

export function ActionDialogs({
  playerId,
  playerEmail,
  playerHasPhone,
  currentStatus,
  editable,
  canManage,
  canMaster,
  emailTemplates,
  smsTemplates,
  variant = 'bar',
}: ActionDialogsProps) {
  const [open, setOpen] = React.useState<DialogKind>(null)
  const router = useRouter()

  function close() {
    setOpen(null)
  }
  function onSuccess() {
    close()
    router.refresh()
  }

  function viewAuditFiltered() {
    router.push(`/admin/audit?resource_kind=player&resource_id=${playerId}`)
  }

  // The action-bar variant is the only one in active use (player detail).
  // The legacy `stack` variant in the previous implementation was unused
  // dead code; keeping the prop only to avoid breaking the call site if
  // anyone wires it back in later.
  if (variant === 'stack') {
    return (
      <SharedDialogs
        playerId={playerId}
        playerEmail={playerEmail}
        playerHasPhone={playerHasPhone}
        editable={editable}
        emailTemplates={emailTemplates}
        smsTemplates={smsTemplates}
        open={open}
        setOpen={setOpen}
        close={close}
        onSuccess={onSuccess}
      />
    )
  }

  return (
    <>
      <ActionBarRow
        currentStatus={currentStatus}
        stealthLocked={editable.stealthLocked}
        canManage={canManage}
        canMaster={canMaster}
        onOpen={setOpen}
        onViewAudit={viewAuditFiltered}
      />
      <SharedDialogs
        playerId={playerId}
        playerEmail={playerEmail}
        playerHasPhone={playerHasPhone}
        editable={editable}
        emailTemplates={emailTemplates}
        smsTemplates={smsTemplates}
        open={open}
        setOpen={setOpen}
        close={close}
        onSuccess={onSuccess}
      />
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Header bar with quick action buttons                                        */
/* -------------------------------------------------------------------------- */

function ActionBarRow({
  currentStatus,
  stealthLocked,
  canManage,
  canMaster,
  onOpen,
  onViewAudit,
}: {
  currentStatus: string
  stealthLocked: boolean
  canManage: boolean
  canMaster: boolean
  onOpen: (kind: DialogKind) => void
  onViewAudit: () => void
}) {
  const isActive = currentStatus === 'active'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ActionButton
        icon={<Zap className="h-4 w-4" />}
        label="Send Funds"
        onClick={() => onOpen('send-funds')}
        disabled={!canMaster}
        title={canMaster ? 'Credit or debit SC, GC, or both in one go' : 'Master role required'}
      />
      <ActionButton
        icon={<Mail className="h-4 w-4" />}
        label="Send Message"
        onClick={() => onOpen('send-message')}
      />
      <ActionButton
        icon={<UserCog className="h-4 w-4" />}
        label="Edit Account"
        onClick={() => onOpen('edit-account')}
        disabled={!canManage}
      />
      <ActionButton
        icon={<StickyNote className="h-4 w-4" />}
        label="Add Note"
        onClick={() => onOpen('add-note')}
        disabled={!canManage}
      />
      {isActive ? (
        <ActionButton
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Suspend"
          onClick={() => onOpen('suspend')}
          disabled={!canManage}
          tone="critical"
        />
      ) : (
        <ActionButton
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Reactivate"
          onClick={() => onOpen('reactivate')}
          disabled={!canManage}
        />
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-subtle bg-surface px-2.5 text-sm font-medium text-ink-secondary transition-colors hover:border-line-default hover:text-ink-primary"
            aria-label="More actions"
          >
            <MoreHorizontal className="h-4 w-4" />
            More
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Access &amp; recovery</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={!canManage}
            onSelect={() => onOpen('password-reset')}
            className="gap-2"
          >
            <KeyRound className="h-4 w-4" />
            Send password reset link
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canManage}
            onSelect={() => onOpen('reset-2fa')}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Reset 2FA
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canManage}
            onSelect={() => onOpen('revoke-sessions')}
            className="gap-2"
          >
            <ShieldOff className="h-4 w-4" />
            Revoke all sessions
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Compliance</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={!canManage}
            onSelect={() => onOpen('set-kyc')}
            className="gap-2"
          >
            <ShieldCheck className="h-4 w-4" />
            Override KYC level
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Restricted</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={!canManage}
            onSelect={() => onOpen('stealth-lock')}
            className="gap-2 text-critical focus:text-critical"
          >
            <EyeOff className="h-4 w-4" />
            {stealthLocked ? 'Unlock stealth lock' : 'Stealth-lock account'}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canMaster}
            onSelect={() => onOpen('wipe')}
            className="gap-2 text-critical focus:text-critical"
          >
            <Trash2 className="h-4 w-4" />
            Wipe &amp; close account
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onViewAudit} className="gap-2">
            <ScrollText className="h-4 w-4" />
            View audit log
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled,
  title,
  tone,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  title?: string
  tone?: 'critical'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md border bg-surface px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        tone === 'critical'
          ? 'border-line-subtle text-critical hover:border-critical/40 hover:bg-critical/5'
          : 'border-line-subtle text-ink-secondary hover:border-line-default hover:text-brand'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function SharedDialogs(props: {
  playerId: string
  playerEmail: string
  playerHasPhone: boolean
  editable: PlayerEditableSnapshot
  emailTemplates: MessageTemplateRow[]
  smsTemplates: MessageTemplateRow[]
  open: DialogKind
  setOpen: (k: DialogKind) => void
  close: () => void
  onSuccess: () => void
}) {
  const {
    playerId,
    playerEmail,
    playerHasPhone,
    editable,
    emailTemplates,
    smsTemplates,
    open,
    close,
  } = props
  const onSuccess = props.onSuccess
  return (
    <>
      <SuspendDialog
        open={open === 'suspend'}
        onOpenChange={(v) => (v ? props.setOpen('suspend') : close())}
        playerId={playerId}
        onSuccess={onSuccess}
      />
      <ReactivateDialog
        open={open === 'reactivate'}
        onOpenChange={(v) => (v ? props.setOpen('reactivate') : close())}
        playerId={playerId}
        onSuccess={onSuccess}
      />
      <Reset2FADialog
        open={open === 'reset-2fa'}
        onOpenChange={(v) => (v ? props.setOpen('reset-2fa') : close())}
        playerId={playerId}
        onSuccess={onSuccess}
      />
      <SendFundsDialog
        open={open === 'send-funds'}
        onOpenChange={(v) => (v ? props.setOpen('send-funds') : close())}
        playerId={playerId}
        onSuccess={onSuccess}
      />
      <SendMessageDialog
        open={open === 'send-message'}
        onOpenChange={(v) => (v ? props.setOpen('send-message') : close())}
        playerId={playerId}
        playerEmail={playerEmail}
        playerHasPhone={playerHasPhone}
        emailTemplates={emailTemplates}
        smsTemplates={smsTemplates}
        onSuccess={onSuccess}
      />
      <AddNoteDialog
        open={open === 'add-note'}
        onOpenChange={(v) => (v ? props.setOpen('add-note') : close())}
        playerId={playerId}
        onSuccess={onSuccess}
      />
      <RevokeSessionsDialog
        open={open === 'revoke-sessions'}
        onOpenChange={(v) => (v ? props.setOpen('revoke-sessions') : close())}
        playerId={playerId}
        onSuccess={onSuccess}
      />
      <EditAccountDialog
        open={open === 'edit-account'}
        onOpenChange={(v) => (v ? props.setOpen('edit-account') : close())}
        playerId={playerId}
        snapshot={editable}
        onSuccess={onSuccess}
      />
      <SetKycDialog
        open={open === 'set-kyc'}
        onOpenChange={(v) => (v ? props.setOpen('set-kyc') : close())}
        playerId={playerId}
        currentLevel={editable.kycLevel}
        onSuccess={onSuccess}
      />
      <PasswordResetDialog
        open={open === 'password-reset'}
        onOpenChange={(v) => (v ? props.setOpen('password-reset') : close())}
        playerId={playerId}
        playerEmail={playerEmail}
        onSuccess={onSuccess}
      />
      <StealthLockDialog
        open={open === 'stealth-lock'}
        onOpenChange={(v) => (v ? props.setOpen('stealth-lock') : close())}
        playerId={playerId}
        currentlyLocked={editable.stealthLocked}
        onSuccess={onSuccess}
      />
      <WipeAccountDialog
        open={open === 'wipe'}
        onOpenChange={(v) => (v ? props.setOpen('wipe') : close())}
        playerId={playerId}
        playerEmail={playerEmail}
        onSuccess={onSuccess}
      />
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Individual dialogs                                                          */
/* -------------------------------------------------------------------------- */

function SuspendDialog(props: {
  open: boolean
  onOpenChange: (v: boolean) => void
  playerId: string
  onSuccess: () => void
}) {
  const [reason, setReason] = React.useState('')
  const [duration, setDuration] = React.useState<string>('168')
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  async function submit() {
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/players/${props.playerId}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason,
          durationHours: duration === 'permanent' ? null : Number(duration),
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? `Failed (${res.status})`)
      }
      setReason('')
      props.onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suspend player</DialogTitle>
          <DialogDescription>
            The player sees a branded &ldquo;your account is suspended&rdquo; message at login. To
            lock without telling them, use Stealth-lock from the More menu instead.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="suspend-reason">Reason</Label>
            <textarea
              id="suspend-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              minLength={2}
              maxLength={500}
              placeholder="Why this player is being suspended (visible in audit log)"
              className="w-full rounded-md border border-line-default bg-base px-3 py-2 text-md text-ink-primary placeholder:text-ink-tertiary focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="suspend-duration">Duration</Label>
            <select
              id="suspend-duration"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="h-9 rounded-md border border-line-default bg-base px-3 text-sm text-ink-primary focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
            >
              <option value="24">24 hours</option>
              <option value="168">7 days</option>
              <option value="720">30 days</option>
              <option value="permanent">Permanent</option>
            </select>
          </div>
          {error ? <p className="text-sm text-critical">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit} disabled={submitting || reason.length < 2}>
            {submitting ? 'Suspending…' : 'Suspend player'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReactivateDialog(props: {
  open: boolean
  onOpenChange: (v: boolean) => void
  playerId: string
  onSuccess: () => void
}) {
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  async function submit() {
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/players/${props.playerId}/reactivate`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      props.onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reactivate player</DialogTitle>
          <DialogDescription>
            The player will be able to log in again immediately.
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-critical">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? 'Reactivating…' : 'Reactivate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Reset2FADialog(props: {
  open: boolean
  onOpenChange: (v: boolean) => void
  playerId: string
  onSuccess: () => void
}) {
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  async function submit() {
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/players/${props.playerId}/reset-2fa`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      props.onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset 2FA</DialogTitle>
          <DialogDescription>
            The player&apos;s TOTP enrollment will be removed. They&apos;ll be prompted to re-enroll
            on their next login. Use only after verifying the player&apos;s identity.
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-critical">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit} disabled={submitting}>
            {submitting ? 'Resetting…' : 'Reset 2FA'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */
/* Send Funds — unified replacement for Send Bonus + Adjust Balance            */
/* -------------------------------------------------------------------------- */

type FundsBucket = 'bonus' | 'purchased' | 'promo' | 'earned'
type FundsDirection = 'credit' | 'debit'

function SendFundsDialog(props: {
  open: boolean
  onOpenChange: (v: boolean) => void
  playerId: string
  onSuccess: () => void
}) {
  const [direction, setDirection] = React.useState<FundsDirection>('credit')
  const [scAmount, setScAmount] = React.useState('')
  const [gcAmount, setGcAmount] = React.useState('')
  const [scBucket, setScBucket] = React.useState<FundsBucket>('bonus')
  const [gcBucket, setGcBucket] = React.useState<FundsBucket>('bonus')
  const [reason, setReason] = React.useState('')
  const [reasonCategory, setReasonCategory] = React.useState('manual_grant')
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (props.open) {
      setDirection('credit')
      setScAmount('')
      setGcAmount('')
      setScBucket('bonus')
      setGcBucket('bonus')
      setReason('')
      setReasonCategory('manual_grant')
      setError(null)
    }
  }, [props.open])

  function parseMinor(amount: string): bigint | null {
    if (!amount) return null
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) return null
    return BigInt(Math.round(n * 10_000))
  }

  const scMinor = parseMinor(scAmount)
  const gcMinor = parseMinor(gcAmount)
  const canSubmit = (scMinor !== null || gcMinor !== null) && reason.length >= 2 && !submitting

  async function postOne(currency: 'SC' | 'GC', bucket: FundsBucket, amount: bigint) {
    const res = await fetch(`/api/admin/players/${props.playerId}/adjust-balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currency,
        subBucket: bucket,
        direction,
        amountMinor: amount.toString(),
        reason,
        reasonCategory,
      }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      throw new Error(body?.error ?? `Failed ${currency} write (${res.status})`)
    }
  }

  async function submit() {
    setError(null)
    if (!scMinor && !gcMinor) {
      setError('Enter an SC amount, a GC amount, or both.')
      return
    }
    setSubmitting(true)
    try {
      if (scMinor) await postOne('SC', scBucket, scMinor)
      if (gcMinor) await postOne('GC', gcBucket, gcMinor)
      props.onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-attention" />
            Send funds
          </DialogTitle>
          <DialogDescription>
            One action covers manual bonuses, comps, error corrections, and claw-backs. Fill in SC,
            GC, or both — each side writes its own ledger pair via core.ledger.write. Master role
            only.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Direction</Label>
            <div className="grid grid-cols-2 gap-2">
              <DirectionButton
                active={direction === 'credit'}
                tone="positive"
                onClick={() => setDirection('credit')}
              >
                Credit (grant to player)
              </DirectionButton>
              <DirectionButton
                active={direction === 'debit'}
                tone="critical"
                onClick={() => setDirection('debit')}
              >
                Debit (claw back)
              </DirectionButton>
            </div>
          </div>

          <CurrencyRow
            label="SC amount"
            amount={scAmount}
            onAmountChange={setScAmount}
            bucket={scBucket}
            onBucketChange={setScBucket}
          />
          <CurrencyRow
            label="GC amount"
            amount={gcAmount}
            onAmountChange={setGcAmount}
            bucket={gcBucket}
            onBucketChange={setGcBucket}
          />

          <div className="flex flex-col gap-1.5">
            <Label>Reason category</Label>
            <select
              value={reasonCategory}
              onChange={(e) => setReasonCategory(e.target.value)}
              className="h-9 rounded-md border border-line-default bg-base px-3 text-sm text-ink-primary"
            >
              <option value="manual_grant">Manual grant</option>
              <option value="goodwill">Goodwill</option>
              <option value="comp">Comp</option>
              <option value="dispute">Dispute resolution</option>
              <option value="error_correction">Error correction</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="funds-reason">Reason (free text)</Label>
            <textarea
              id="funds-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              minLength={2}
              maxLength={2000}
              placeholder="Required — stored on the ledger entry's metadata + audit log"
              className="w-full rounded-md border border-line-default bg-base px-3 py-2 text-md text-ink-primary placeholder:text-ink-tertiary focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
            />
          </div>

          {error ? <p className="text-sm text-critical">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {submitting
              ? 'Writing ledger…'
              : direction === 'credit'
                ? 'Credit player'
                : 'Debit player'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DirectionButton({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean
  tone: 'positive' | 'critical'
  onClick: () => void
  children: React.ReactNode
}) {
  const activeCls =
    tone === 'positive'
      ? 'border-positive/40 bg-positive/10 text-positive'
      : 'border-critical/40 bg-critical/10 text-critical'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 rounded-md border px-3 text-sm font-medium transition-colors ${
        active
          ? activeCls
          : 'border-line-subtle bg-surface text-ink-secondary hover:border-line-default hover:text-ink-primary'
      }`}
    >
      {children}
    </button>
  )
}

function CurrencyRow({
  label,
  amount,
  onAmountChange,
  bucket,
  onBucketChange,
}: {
  label: string
  amount: string
  onAmountChange: (v: string) => void
  bucket: FundsBucket
  onBucketChange: (v: FundsBucket) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="grid grid-cols-[1fr_140px] gap-2">
        <Input
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00 (leave blank to skip)"
        />
        <select
          value={bucket}
          onChange={(e) => onBucketChange(e.target.value as FundsBucket)}
          className="h-9 rounded-md border border-line-default bg-base px-2 text-sm text-ink-primary"
        >
          <option value="bonus">→ Bonus</option>
          <option value="promo">→ Promo</option>
          <option value="earned">→ Earned</option>
          <option value="purchased">→ Purchased</option>
        </select>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Send Message — unchanged                                                    */
/* -------------------------------------------------------------------------- */

function SendMessageDialog(props: {
  open: boolean
  onOpenChange: (v: boolean) => void
  playerId: string
  playerEmail: string
  playerHasPhone: boolean
  emailTemplates: MessageTemplateRow[]
  smsTemplates: MessageTemplateRow[]
  onSuccess: () => void
}) {
  const [channel, setChannel] = React.useState<'email' | 'sms' | 'in_app'>('email')
  const [templateSlug, setTemplateSlug] = React.useState<string>('')
  const [subjectOverride, setSubjectOverride] = React.useState('')
  const [bodyOverride, setBodyOverride] = React.useState('')
  const [testFirst, setTestFirst] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [done, setDone] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (props.open) {
      setChannel('email')
      setTemplateSlug('')
      setSubjectOverride('')
      setBodyOverride('')
      setTestFirst(false)
      setError(null)
      setDone(null)
    }
  }, [props.open])

  const templates =
    channel === 'sms' ? props.smsTemplates : channel === 'email' ? props.emailTemplates : []

  const canSubmit =
    templateSlug.length > 0 && !(channel === 'sms' && !props.playerHasPhone) && !submitting

  async function submit(asTest: boolean) {
    setError(null)
    setDone(null)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/players/${props.playerId}/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          templateSlug,
          subject: subjectOverride || undefined,
          body: bodyOverride || undefined,
          testSendToSelf: asTest,
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? `Failed (${res.status})`)
      }
      if (asTest) {
        setDone('Test queued — check your own inbox before sending to the player.')
      } else {
        props.onSuccess()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send message</DialogTitle>
          <DialogDescription>
            Pick a CRM template and channel, optionally override the subject or body, then queue the
            send.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Channel</Label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: 'email', label: 'Email', disabled: false },
                  { id: 'sms', label: 'SMS', disabled: !props.playerHasPhone },
                  { id: 'in_app', label: 'In-app', disabled: false },
                ] as const
              ).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setChannel(c.id)
                    setTemplateSlug('')
                  }}
                  disabled={c.disabled}
                  className={`inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    channel === c.id
                      ? 'border-brand bg-brand/10 text-brand'
                      : 'border-line-subtle bg-surface text-ink-secondary hover:border-line-default hover:text-ink-primary'
                  }`}
                  title={c.disabled ? 'Player has no phone on file' : undefined}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="msg-template">Template</Label>
            {channel === 'in_app' ? (
              <Input
                id="msg-template"
                value={templateSlug}
                onChange={(e) => setTemplateSlug(e.target.value)}
                placeholder="In-app notification slug (e.g. manual_one_off)"
              />
            ) : (
              <select
                id="msg-template"
                value={templateSlug}
                onChange={(e) => setTemplateSlug(e.target.value)}
                className="h-9 rounded-md border border-line-default bg-base px-3 text-sm text-ink-primary"
              >
                <option value="">Pick a template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.slug}>
                    {t.displayName}
                    {t.category ? ` · ${t.category}` : ''}
                  </option>
                ))}
              </select>
            )}
            {channel === 'email' ? (
              <p className="text-xs text-ink-tertiary">
                Sending to <span className="text-ink-primary">{props.playerEmail}</span>
              </p>
            ) : null}
            {channel === 'sms' && !props.playerHasPhone ? (
              <p className="text-xs text-critical">Player has no phone number on file.</p>
            ) : null}
          </div>

          {channel !== 'in_app' ? (
            <details className="rounded-md border border-line-subtle bg-base p-3">
              <summary className="cursor-pointer text-sm font-medium text-ink-secondary">
                <PenSquare className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
                Override subject / body
              </summary>
              <div className="mt-3 flex flex-col gap-3">
                {channel === 'email' ? (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="msg-subject">Subject (override)</Label>
                    <Input
                      id="msg-subject"
                      value={subjectOverride}
                      onChange={(e) => setSubjectOverride(e.target.value)}
                      placeholder="Optional — overrides the template's subject"
                    />
                  </div>
                ) : null}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="msg-body">Body (override)</Label>
                  <textarea
                    id="msg-body"
                    value={bodyOverride}
                    onChange={(e) => setBodyOverride(e.target.value)}
                    rows={4}
                    placeholder="Optional — overrides the template body"
                    className="w-full rounded-md border border-line-default bg-base px-3 py-2 text-md text-ink-primary placeholder:text-ink-tertiary focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
                  />
                </div>
              </div>
            </details>
          ) : null}

          <label className="flex items-center gap-2 text-sm text-ink-secondary">
            <input
              type="checkbox"
              checked={testFirst}
              onChange={(e) => setTestFirst(e.target.checked)}
              className="h-4 w-4 rounded border-line-default text-brand focus:ring-brand"
            />
            Send a test to me first before sending to the player
          </label>

          {error ? <p className="text-sm text-critical">{error}</p> : null}
          {done ? <p className="text-sm text-positive">{done}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          {testFirst ? (
            <Button onClick={() => submit(true)} disabled={!canSubmit}>
              {submitting ? 'Queueing…' : 'Send test to me'}
            </Button>
          ) : (
            <Button onClick={() => submit(false)} disabled={!canSubmit}>
              {submitting ? 'Queueing…' : 'Send to player'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AddNoteDialog(props: {
  open: boolean
  onOpenChange: (v: boolean) => void
  playerId: string
  onSuccess: () => void
}) {
  const [note, setNote] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  async function submit() {
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/players/${props.playerId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      })
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      setNote('')
      props.onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add internal note</DialogTitle>
          <DialogDescription>Notes are append-only and visible to all admins.</DialogDescription>
        </DialogHeader>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={5}
          minLength={1}
          maxLength={4000}
          placeholder="Note text — supports plain text only."
          className="w-full rounded-md border border-line-default bg-base px-3 py-2 text-md text-ink-primary placeholder:text-ink-tertiary focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
        />
        {error ? <p className="text-sm text-critical">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || note.length === 0}>
            {submitting ? 'Saving…' : 'Save note'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RevokeSessionsDialog(props: {
  open: boolean
  onOpenChange: (v: boolean) => void
  playerId: string
  onSuccess: () => void
}) {
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  async function submit() {
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/players/${props.playerId}/revoke-sessions`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      props.onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke all sessions</DialogTitle>
          <DialogDescription>
            Every active login on every device will be invalidated. The player keeps their password
            and can sign back in — use Stealth-lock instead if you want to prevent re-login.
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-critical">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit} disabled={submitting}>
            {submitting ? 'Revoking…' : 'Revoke sessions'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */
/* Edit Account                                                                */
/* -------------------------------------------------------------------------- */

function EditAccountDialog(props: {
  open: boolean
  onOpenChange: (v: boolean) => void
  playerId: string
  snapshot: PlayerEditableSnapshot
  onSuccess: () => void
}) {
  const [email, setEmail] = React.useState(props.snapshot.email)
  const [username, setUsername] = React.useState(props.snapshot.username ?? '')
  const [displayName, setDisplayName] = React.useState(props.snapshot.displayName ?? '')
  const [firstName, setFirstName] = React.useState(props.snapshot.firstName ?? '')
  const [lastName, setLastName] = React.useState(props.snapshot.lastName ?? '')
  const [phone, setPhone] = React.useState(props.snapshot.phone ?? '')
  const [state, setState] = React.useState(props.snapshot.state ?? '')
  const [emailConsent, setEmailConsent] = React.useState(props.snapshot.emailConsent)
  const [smsConsent, setSmsConsent] = React.useState(props.snapshot.smsConsent)
  const [reason, setReason] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (props.open) {
      setEmail(props.snapshot.email)
      setUsername(props.snapshot.username ?? '')
      setDisplayName(props.snapshot.displayName ?? '')
      setFirstName(props.snapshot.firstName ?? '')
      setLastName(props.snapshot.lastName ?? '')
      setPhone(props.snapshot.phone ?? '')
      setState(props.snapshot.state ?? '')
      setEmailConsent(props.snapshot.emailConsent)
      setSmsConsent(props.snapshot.smsConsent)
      setReason('')
      setError(null)
    }
  }, [props.open, props.snapshot])

  function diff() {
    const payload: Record<string, unknown> = { reason }
    if (email !== props.snapshot.email) payload.email = email
    if ((username || null) !== props.snapshot.username) payload.username = username || null
    if ((displayName || null) !== props.snapshot.displayName)
      payload.displayName = displayName || null
    if ((firstName || null) !== props.snapshot.firstName) payload.firstName = firstName || null
    if ((lastName || null) !== props.snapshot.lastName) payload.lastName = lastName || null
    if ((phone || null) !== props.snapshot.phone) payload.phone = phone || null
    if ((state || null) !== props.snapshot.state) payload.state = state.toUpperCase() || null
    if (emailConsent !== props.snapshot.emailConsent) payload.emailConsent = emailConsent
    if (smsConsent !== props.snapshot.smsConsent) payload.smsConsent = smsConsent
    return payload
  }

  async function submit() {
    setError(null)
    const payload = diff()
    if (Object.keys(payload).length <= 1) {
      setError('Nothing changed.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/players/${props.playerId}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? `Failed (${res.status})`)
      }
      props.onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit account</DialogTitle>
          <DialogDescription>
            Update player profile fields. Email changes also update the auth_user row so the player
            can still log in. All changes are audited.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Email" colSpan>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          </Field>
          <Field label="Username">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} />
          </Field>
          <Field label="Display name">
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
          <Field label="First name">
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Field label="Last name">
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </Field>
          <Field label="Phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1…" />
          </Field>
          <Field label="State (2-letter)">
            <Input
              value={state}
              onChange={(e) => setState(e.target.value.toUpperCase())}
              maxLength={2}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm text-ink-secondary">
            <input
              type="checkbox"
              checked={emailConsent}
              onChange={(e) => setEmailConsent(e.target.checked)}
              className="h-4 w-4 rounded border-line-default text-brand focus:ring-brand"
            />
            Email opt-in
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-secondary">
            <input
              type="checkbox"
              checked={smsConsent}
              onChange={(e) => setSmsConsent(e.target.checked)}
              className="h-4 w-4 rounded border-line-default text-brand focus:ring-brand"
            />
            SMS opt-in
          </label>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-reason">Reason (required, audited)</Label>
          <textarea
            id="edit-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Why these fields are being changed"
            className="w-full rounded-md border border-line-default bg-base px-3 py-2 text-md text-ink-primary placeholder:text-ink-tertiary focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
          />
        </div>

        {error ? <p className="text-sm text-critical">{error}</p> : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || reason.length < 2}>
            {submitting ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  colSpan,
  children,
}: {
  label: string
  colSpan?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${colSpan ? 'col-span-2' : ''}`}>
      <Label>{label}</Label>
      {children}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Set KYC                                                                     */
/* -------------------------------------------------------------------------- */

function SetKycDialog(props: {
  open: boolean
  onOpenChange: (v: boolean) => void
  playerId: string
  currentLevel: number
  onSuccess: () => void
}) {
  const [level, setLevel] = React.useState(props.currentLevel)
  const [reason, setReason] = React.useState('')
  const [markVerified, setMarkVerified] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (props.open) {
      setLevel(props.currentLevel)
      setReason('')
      setMarkVerified(true)
      setError(null)
    }
  }, [props.open, props.currentLevel])

  async function submit() {
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/players/${props.playerId}/kyc-level`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kycLevel: level, reason, markVerified }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? `Failed (${res.status})`)
      }
      props.onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Override KYC level</DialogTitle>
          <DialogDescription>
            Promotes or demotes the player&apos;s KYC tier directly. Use after an out-of-band
            identity check (manual document review, cashier escalation, etc.). Promoting to L2/L3
            unlocks redemption and requires the master role.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Target level</Label>
            <div className="grid grid-cols-4 gap-2">
              {[0, 1, 2, 3].map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setLevel(lvl)}
                  className={`h-9 rounded-md border text-sm font-medium transition-colors ${
                    level === lvl
                      ? 'border-brand bg-brand/10 text-brand'
                      : 'border-line-subtle bg-surface text-ink-secondary hover:border-line-default hover:text-ink-primary'
                  }`}
                >
                  L{lvl}
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-tertiary">
              L0 = unverified · L1 = email + phone · L2 = ID verified · L3 = enhanced due diligence
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm text-ink-secondary">
            <input
              type="checkbox"
              checked={markVerified}
              onChange={(e) => setMarkVerified(e.target.checked)}
              className="h-4 w-4 rounded border-line-default text-brand focus:ring-brand"
            />
            Stamp <code className="rounded bg-base px-1 text-xs">kyc_verified_at</code> with today
          </label>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="kyc-reason">Reason (audited)</Label>
            <textarea
              id="kyc-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Required — explain why you are overriding the tier"
              className="w-full rounded-md border border-line-default bg-base px-3 py-2 text-md text-ink-primary placeholder:text-ink-tertiary focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
            />
          </div>

          {error ? <p className="text-sm text-critical">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || reason.length < 2 || level === props.currentLevel}
          >
            {submitting ? 'Saving…' : 'Apply override'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */
/* Password reset                                                              */
/* -------------------------------------------------------------------------- */

function PasswordResetDialog(props: {
  open: boolean
  onOpenChange: (v: boolean) => void
  playerId: string
  playerEmail: string
  onSuccess: () => void
}) {
  const [reason, setReason] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [sent, setSent] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (props.open) {
      setReason('')
      setError(null)
      setSent(null)
    }
  }, [props.open])

  async function submit() {
    setError(null)
    setSent(null)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/players/${props.playerId}/password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? `Failed (${res.status})`)
      }
      const json = (await res.json()) as { sentTo?: string }
      setSent(json.sentTo ?? props.playerEmail)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send password reset link</DialogTitle>
          <DialogDescription>
            Triggers the standard reset-password email to{' '}
            <span className="text-ink-primary">{props.playerEmail}</span>. The link expires in 1
            hour. You never see the token; this is the same flow as &quot;Forgot password&quot; on
            the player login page.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pr-reason">Reason</Label>
          <textarea
            id="pr-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="e.g. player called support, said they can't reset themselves"
            className="w-full rounded-md border border-line-default bg-base px-3 py-2 text-md text-ink-primary placeholder:text-ink-tertiary focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
          />
        </div>

        {error ? <p className="text-sm text-critical">{error}</p> : null}
        {sent ? <p className="text-sm text-positive">Reset link emailed to {sent}.</p> : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            {sent ? 'Close' : 'Cancel'}
          </Button>
          {sent ? null : (
            <Button onClick={submit} disabled={submitting || reason.length < 2}>
              {submitting ? 'Sending…' : 'Send reset link'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */
/* Stealth lock                                                                */
/* -------------------------------------------------------------------------- */

function StealthLockDialog(props: {
  open: boolean
  onOpenChange: (v: boolean) => void
  playerId: string
  currentlyLocked: boolean
  onSuccess: () => void
}) {
  const [reason, setReason] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (props.open) {
      setReason('')
      setError(null)
    }
  }, [props.open])

  async function submit() {
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/players/${props.playerId}/stealth-lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: props.currentlyLocked ? 'unlock' : 'lock',
          reason,
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? `Failed (${res.status})`)
      }
      props.onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {props.currentlyLocked ? 'Release stealth lock' : 'Stealth-lock account'}
          </DialogTitle>
          <DialogDescription>
            {props.currentlyLocked ? (
              <>The player will be able to log in again on their next attempt.</>
            ) : (
              <>
                Every active session is revoked and all future logins silently fail with an
                &quot;invalid email or password&quot; message. The player isn&apos;t told they were
                locked. Use for suspected fraud or collusion where you want to observe before
                warning.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sl-reason">Reason (audited)</Label>
          <textarea
            id="sl-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-line-default bg-base px-3 py-2 text-md text-ink-primary placeholder:text-ink-tertiary focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
          />
        </div>

        {error ? <p className="text-sm text-critical">{error}</p> : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit} disabled={submitting || reason.length < 2}>
            {submitting
              ? 'Saving…'
              : props.currentlyLocked
                ? 'Release lock'
                : 'Engage stealth lock'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */
/* Wipe & close                                                                */
/* -------------------------------------------------------------------------- */

function WipeAccountDialog(props: {
  open: boolean
  onOpenChange: (v: boolean) => void
  playerId: string
  playerEmail: string
  onSuccess: () => void
}) {
  const [reason, setReason] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (props.open) {
      setReason('')
      setConfirm('')
      setError(null)
    }
  }, [props.open])

  async function submit() {
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/players/${props.playerId}/wipe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, confirm }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? `Failed (${res.status})`)
      }
      props.onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-critical">
            <Trash2 className="h-4 w-4" /> Wipe &amp; close account
          </DialogTitle>
          <DialogDescription>
            Anonymises all PII (email, name, phone, address) and closes the account. Ledger entries,
            redemptions, and audit history remain intact — required for sweepstakes recordkeeping.
            The action is irreversible. Master role only.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="rounded-md border border-critical/30 bg-critical/5 p-3 text-xs text-critical">
            Will overwrite <span className="font-mono">{props.playerEmail}</span> with a
            <span className="font-mono"> deleted+…@deleted.coinfrenzy.invalid </span>
            tombstone, drop all sessions, and set status to{' '}
            <span className="font-mono">closed</span>.
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wipe-reason">Reason (audited, min 10 chars)</Label>
            <textarea
              id="wipe-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. GDPR erasure request received via support ticket #1234"
              className="w-full rounded-md border border-line-default bg-base px-3 py-2 text-md text-ink-primary placeholder:text-ink-tertiary focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wipe-confirm">
              Type <span className="font-mono text-critical">DELETE</span> to confirm
            </Label>
            <Input
              id="wipe-confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="DELETE"
            />
          </div>

          {error ? <p className="text-sm text-critical">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={submitting || reason.length < 10 || confirm !== 'DELETE'}
          >
            {submitting ? 'Wiping…' : 'Wipe & close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
