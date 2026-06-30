'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertOctagon,
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  Clock,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'

import { QuickInsights, type QuickInsight } from '@coinfrenzy/ui/admin'
import { Badge } from '@coinfrenzy/ui/primitives/badge'
import { Button } from '@coinfrenzy/ui/primitives/button'

import { formatCoins, formatCompactUsd, formatUsd, relativeTime } from '@/lib/format'

import type { RedemptionDetail, RedemptionListRow } from './_data'
import { CashierActionPanel, CashierQuickActions, useCashierActions } from './_action-panel'

export interface CashierSplitViewProps {
  title: string
  basePath: string
  list: RedemptionListRow[]
  detail: RedemptionDetail | null
  /** Tunes which actions surface in the right pane. */
  mode: 'pending' | 'approved' | 'cancelled' | 'aml'
  insights?: QuickInsight[]
}

// docs/08 §7.1 — Cashier split view. List on the left, detail on the right.
// SLA timer color-codes per docs/08 §7.1 (default 4h target).

const SLA_TARGET_HOURS = 4

export function CashierSplitView(props: CashierSplitViewProps) {
  const router = useRouter()

  return (
    <div className="flex h-full min-h-screen flex-col">
      <header className="border-b border-line-subtle bg-surface px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink-primary">{props.title}</h1>
            <p className="mt-1 text-xs text-ink-tertiary">
              {props.list.length} redemption{props.list.length === 1 ? '' : 's'}
              {props.mode === 'pending' ? ' awaiting review' : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.refresh()} type="button">
              Refresh
            </Button>
          </div>
        </div>
      </header>

      {props.insights && props.insights.length > 0 ? (
        <div className="border-b border-line-subtle bg-surface px-6 py-4">
          <QuickInsights insights={props.insights} />
        </div>
      ) : null}

      <div className="grid flex-1 grid-cols-12 overflow-hidden">
        <aside className="col-span-12 max-h-[calc(100vh-7rem)] overflow-y-auto border-r border-border/60 lg:col-span-5 xl:col-span-4">
          {props.list.length === 0 ? (
            <EmptyList mode={props.mode} />
          ) : (
            <ul className="divide-y divide-border/60">
              {props.list.map((row) => (
                <ListRow
                  key={row.id}
                  row={row}
                  basePath={props.basePath}
                  active={props.detail?.id === row.id}
                />
              ))}
            </ul>
          )}
        </aside>

        <section className="col-span-12 max-h-[calc(100vh-7rem)] overflow-y-auto px-6 py-5 lg:col-span-7 xl:col-span-8">
          {props.detail ? (
            <DetailPane detail={props.detail} mode={props.mode} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {props.mode === 'pending'
                ? 'No redemptions in the queue right now.'
                : 'Select a redemption from the list.'}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function EmptyList({ mode }: { mode: CashierSplitViewProps['mode'] }) {
  return (
    <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
      {mode === 'pending' ? 'Queue is empty — well done!' : 'No rows.'}
    </div>
  )
}

function ListRow({
  row,
  basePath,
  active,
}: {
  row: RedemptionListRow
  basePath: string
  active: boolean
}) {
  const sla = computeSlaState(row.requestedAt)
  return (
    <li>
      <Link
        href={`${basePath}?id=${row.id}`}
        className={`block px-4 py-3 transition-colors ${
          active ? 'bg-primary/10' : 'hover:bg-card/60'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {row.player.displayName ?? row.player.email}
          </span>
          <span className="font-mono text-sm text-foreground" data-numeric="true">
            {formatUsd(row.amountUsd)}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate">
            {row.player.state ?? '—'} · KYC {row.player.kycLevel}
          </span>
          <SlaBadge sla={sla} />
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px] uppercase tracking-wider">
          <StatusBadge status={row.status} />
          <span className="text-muted-foreground">{relativeTime(row.requestedAt)}</span>
        </div>
      </Link>
    </li>
  )
}

function DetailPane({
  detail,
  mode,
}: {
  detail: RedemptionDetail
  mode: CashierSplitViewProps['mode']
}) {
  const sla = computeSlaState(detail.requestedAt)
  // Pending/AML modes get the live action state. We always run the hook
  // (rules-of-hooks), but only render the top + bottom action surfaces
  // when the mode is one that actually accepts actions.
  const actions = useCashierActions(detail)
  const showActions = mode === 'pending' || mode === 'aml'
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              {formatUsd(detail.amountUsd)}
            </h2>
            <StatusBadge status={detail.status} />
            {sla.tier !== 'normal' ? <SlaBadge sla={sla} /> : null}
            {showActions ? <CashierQuickActions actions={actions} /> : null}
          </div>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {detail.player.displayName ?? detail.player.email}
            </span>{' '}
            · Redemption <code className="font-mono">{detail.id.slice(0, 8)}</code> ·{' '}
            {formatCoins(detail.amountSc)} SC · {detail.method.replace('_', ' ')}
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          Requested {relativeTime(detail.requestedAt)}
          <br />
          Player <code>{detail.player.id.slice(0, 8)}</code>
        </div>
      </div>

      <PlayerKpiStrip detail={detail} />

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="Player profile">
          <KvRow label="Email" value={detail.player.email} />
          <KvRow label="Display name" value={detail.player.displayName ?? '—'} />
          <KvRow label="State" value={detail.player.state ?? '—'} />
          <KvRow label="Account status" value={detail.player.status} />
          <KvRow label="KYC level" value={String(detail.player.kycLevel)} />
          <Link
            href={`/admin/players?id=${detail.player.id}`}
            className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Open profile <ArrowUpRight className="h-3 w-3" />
          </Link>
        </Card>

        <Card title="KYC + watchlist">
          <KvRow label="Footprint status" value={detail.kyc?.footprintStatus ?? 'none'} />
          <KvRow label="Watchlist status" value={detail.kyc?.watchlistLastStatus ?? '—'} />
          <KvRow
            label="Last AML check"
            value={
              detail.kyc?.watchlistLastCheckAt ? relativeTime(detail.kyc.watchlistLastCheckAt) : '—'
            }
          />
        </Card>

        <Card title="Wallet snapshot">
          {detail.walletSnapshot ? (
            <>
              <KvRow label="Total SC" value={`${formatCoins(detail.walletSnapshot.total)} SC`} />
              <KvRow
                label="Redeemable"
                value={`${formatCoins(detail.walletSnapshot.redeemable)} SC`}
              />
              <KvRow label="Purchased" value={formatCoins(detail.walletSnapshot.purchased)} />
              <KvRow label="Earned" value={formatCoins(detail.walletSnapshot.earned)} />
              <KvRow label="Promo (locked)" value={formatCoins(detail.walletSnapshot.promo)} />
              <KvRow label="Bonus (locked)" value={formatCoins(detail.walletSnapshot.bonus)} />
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No SC wallet for this player.</p>
          )}
        </Card>

        <Card title="Drain plan">
          {detail.drainPlan.length === 0 ? (
            <p className="text-xs text-muted-foreground">SC not yet locked.</p>
          ) : (
            detail.drainPlan.map((step, idx) => (
              <KvRow
                key={`${step.bucket}-${idx}`}
                label={step.bucket}
                value={`${formatCoins(BigInt(step.amount))} SC`}
              />
            ))
          )}
        </Card>

        <Card title="Payment method">
          {detail.paymentInstrument ? (
            <>
              <KvRow label="Bank" value={detail.paymentInstrument.bankName ?? '—'} />
              <KvRow
                label="Account"
                value={
                  detail.paymentInstrument.accountLast4
                    ? `****${detail.paymentInstrument.accountLast4}`
                    : '—'
                }
              />
              <KvRow
                label="Card"
                value={
                  detail.paymentInstrument.cardLast4
                    ? `${detail.paymentInstrument.cardBrand ?? 'Card'} ****${detail.paymentInstrument.cardLast4}`
                    : '—'
                }
              />
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No instrument linked.</p>
          )}
          <KvRow label="Finix transfer" value={detail.finixTransferId ?? '—'} />
        </Card>

        <Card title="Recent geo">
          {detail.geoSamples.length === 0 ? (
            <p className="text-xs text-muted-foreground">No geo history.</p>
          ) : (
            detail.geoSamples.map((g) => (
              <div key={g.id} className="text-xs text-muted-foreground">
                {g.state ?? '—'} · {g.country ?? '—'}
                {g.isProxy ? ' · proxy' : ''} — {relativeTime(g.createdAt)}
              </div>
            ))
          )}
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="Recent purchases (10)">
          {detail.recentPurchases.length === 0 ? (
            <p className="text-xs text-muted-foreground">No purchases on record.</p>
          ) : (
            detail.recentPurchases.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between text-xs text-muted-foreground"
              >
                <span>{relativeTime(p.createdAt)}</span>
                <span className="font-mono text-foreground" data-numeric="true">
                  {formatUsd(p.amountUsd)}
                </span>
                <span>{p.status}</span>
              </div>
            ))
          )}
        </Card>

        <Card title="Redemption history (20)">
          {detail.redemptionHistory.length === 0 ? (
            <p className="text-xs text-muted-foreground">No redemptions on record.</p>
          ) : (
            detail.redemptionHistory.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between text-xs text-muted-foreground"
              >
                <span>{relativeTime(r.createdAt)}</span>
                <span className="font-mono text-foreground" data-numeric="true">
                  {formatUsd(r.amountUsd)}
                </span>
                <StatusBadge status={r.status} small />
              </div>
            ))
          )}
        </Card>

        <Card title="Compliance flags (open)">
          {detail.complianceFlags.length === 0 ? (
            <p className="text-xs text-muted-foreground">No active flags.</p>
          ) : (
            detail.complianceFlags.map((f) => (
              <div key={f.id} className="text-xs">
                <Badge variant={severityVariant(f.severity)}>{f.flagType}</Badge>{' '}
                <span className="text-muted-foreground">{f.reason}</span>
              </div>
            ))
          )}
        </Card>

        {detail.rejectionReason ? (
          <Card title="Rejection">
            <KvRow label="Category" value={detail.rejectionCategory ?? '—'} />
            <KvRow label="Reason" value={detail.rejectionReason} />
            <KvRow
              label="Rejected at"
              value={detail.rejectedAt ? relativeTime(detail.rejectedAt) : '—'}
            />
          </Card>
        ) : null}
      </section>

      {showActions ? <CashierActionPanel detail={detail} actions={actions} /> : null}
    </div>
  )
}

// docs/08 §7.1 — the headline KPIs that operators want to see *before*
// they scroll. Spec from product: redemption amount, NGR (positive green /
// negative red), rolling-30d redeemed amount, last redeem, plus a couple
// of supporting numbers so the cashier can size up the player at a glance.
function PlayerKpiStrip({ detail }: { detail: RedemptionDetail }) {
  const kpi = detail.playerKpi
  // We use `netPositionUsd` (total_deposited_usd − total_redeemed_usd) as
  // the operator-facing "NGR" because the underlying `ngr_sc` rollup is
  // not wired to a real bet/win aggregation yet (apps/worker stubs it).
  // Positive => player has net-deposited (house up). Negative => player is
  // up on the house (we've paid out more than we've taken). Sign +
  // coloring follow that convention. Once the worker fills `ngr_sc` for
  // real, we can split into two tiles: "NGR (gaming)" + "Net cash".
  const ngrValue = kpi.netPositionUsd
  const ngrPositive = ngrValue >= 0n
  const ngrAbs = ngrPositive ? ngrValue : -ngrValue
  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <KpiTile
        label="This redemption"
        value={formatUsd(detail.amountUsd)}
        subtitle={`${formatCoins(detail.amountSc)} SC · ${detail.method.replace('_', ' ')}`}
        icon={<Wallet className="h-4 w-4" />}
        tone="neutral"
      />
      <KpiTile
        label="NGR (net cash)"
        value={`${ngrPositive ? '' : '−'}${formatUsd(ngrAbs)}`}
        subtitle={ngrPositive ? 'House net-positive on this player' : 'Player is up on the house'}
        icon={
          ngrPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />
        }
        tone={ngrPositive ? 'positive' : 'negative'}
        emphasis
      />
      <KpiTile
        label="Rolling 30d redeemed"
        value={formatUsd(kpi.redeemed30dUsd)}
        subtitle={`${formatCompactUsd(kpi.deposited30dUsd)} deposited · ${kpi.daysActive}d active`}
        icon={<ArrowDownRight className="h-4 w-4" />}
        tone={kpi.redeemed30dUsd > 0n ? 'attention' : 'neutral'}
      />
      <KpiTile
        label="Last redeem"
        value={kpi.lastRedeemAt ? relativeTime(kpi.lastRedeemAt) : '—'}
        subtitle={
          kpi.lastPaidRedeemAt
            ? `Last paid ${relativeTime(kpi.lastPaidRedeemAt)}`
            : 'No prior paid redemption'
        }
        icon={<CalendarClock className="h-4 w-4" />}
        tone="neutral"
      />
      <KpiTile
        label="Lifetime"
        value={`${formatCompactUsd(kpi.totalDepositedUsd)} in`}
        subtitle={`${formatCompactUsd(kpi.totalRedeemedUsd)} out · ${kpi.redemptionCount} paid · ${kpi.purchaseCount} buys`}
        icon={<ArrowUpRight className="h-4 w-4" />}
        tone="neutral"
      />
    </section>
  )
}

function KpiTile({
  label,
  value,
  subtitle,
  icon,
  tone,
  emphasis,
}: {
  label: string
  value: string
  subtitle?: string
  icon?: React.ReactNode
  tone: 'neutral' | 'positive' | 'negative' | 'attention'
  emphasis?: boolean
}) {
  const toneClass = (() => {
    switch (tone) {
      case 'positive':
        return 'border-success/40 bg-success/5'
      case 'negative':
        return 'border-destructive/40 bg-destructive/5'
      case 'attention':
        return 'border-warning/40 bg-warning/5'
      default:
        return 'border-border/60 bg-card'
    }
  })()
  const valueClass = (() => {
    switch (tone) {
      case 'positive':
        return 'text-success'
      case 'negative':
        return 'text-destructive'
      case 'attention':
        return 'text-warning'
      default:
        return 'text-foreground'
    }
  })()
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="truncate">{label}</span>
        {icon ? <span className={valueClass}>{icon}</span> : null}
      </div>
      <div
        className={`mt-1 ${emphasis ? 'text-xl' : 'text-lg'} font-semibold tracking-tight ${valueClass}`}
        data-numeric="true"
      >
        {value}
      </div>
      {subtitle ? (
        <div className="mt-1 truncate text-[11px] text-muted-foreground">{subtitle}</div>
      ) : null}
    </div>
  )
}

function KvRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground capitalize">{label}</span>
      <span className="text-right text-foreground" data-numeric="true">
        {value}
      </span>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 rounded-lg border border-border/60 bg-card p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function StatusBadge({ status, small }: { status: string; small?: boolean }) {
  const variant = (() => {
    switch (status) {
      case 'paid':
        return 'success' as const
      case 'rejected':
      case 'failed':
      case 'cancelled':
        return 'destructive' as const
      case 'aml_hold':
        return 'warning' as const
      case 'awaiting_webhook':
      case 'submitted':
      case 'approved':
        return 'info' as const
      default:
        return 'secondary' as const
    }
  })()
  return (
    <Badge variant={variant} className={small ? 'text-[10px]' : 'text-[10px]'}>
      {status.replace('_', ' ')}
    </Badge>
  )
}

interface SlaState {
  hours: number
  tier: 'normal' | 'amber' | 'red'
}

function computeSlaState(requestedAt: Date): SlaState {
  const ms = Date.now() - new Date(requestedAt).getTime()
  const hours = ms / 3_600_000
  if (hours >= SLA_TARGET_HOURS) return { hours, tier: 'red' }
  if (hours >= SLA_TARGET_HOURS * 0.75) return { hours, tier: 'amber' }
  return { hours, tier: 'normal' }
}

function SlaBadge({ sla }: { sla: SlaState }) {
  if (sla.tier === 'normal') return null
  const Icon = sla.tier === 'red' ? AlertOctagon : Clock
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        sla.tier === 'red' ? 'bg-destructive/15 text-destructive' : 'bg-warning/15 text-warning'
      }`}
    >
      <Icon className="h-3 w-3" />
      SLA {sla.hours.toFixed(1)}h
    </span>
  )
}

function severityVariant(severity: string): 'destructive' | 'warning' | 'secondary' {
  if (severity === 'block') return 'destructive'
  if (severity === 'warn') return 'warning'
  return 'secondary'
}
