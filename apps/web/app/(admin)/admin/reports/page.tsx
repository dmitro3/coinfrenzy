import Link from 'next/link'
import {
  BarChart3,
  CalendarDays,
  Coins,
  FileSpreadsheet,
  HandCoins,
  ListChecks,
  Receipt,
  Repeat,
  ShoppingCart,
  Users,
} from 'lucide-react'

import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'

import { requireReportsAccess } from './_shared.server'

export const dynamic = 'force-dynamic'

interface ReportCard {
  href: string
  title: string
  description: string
  source: string
  icon: React.ComponentType<{ className?: string }>
  masterOnly?: boolean
}

const REPORTS: ReportCard[] = [
  {
    href: '/admin/reports/daily-kpis',
    title: 'Daily KPIs',
    description:
      'One row per day — DAU, GGR, NGR, deposits, redemptions, bonuses. The MERV-equivalent.',
    source: 'daily_operational_snapshots',
    icon: CalendarDays,
  },
  {
    href: '/admin/reports/purchase',
    title: 'Purchase Report',
    description:
      'Per-player lifetime stats — top buyers ranked by USD deposited with full wager / win / NGR.',
    source: 'player_lifetime_stats',
    icon: ShoppingCart,
  },
  {
    href: '/admin/reports/bonus',
    title: 'Bonus Report',
    description:
      'Per-bonus-type award totals — SC and GC awarded, completion / expiry / forfeit counts.',
    source: 'bonuses_awarded',
    icon: HandCoins,
  },
  {
    href: '/admin/reports/users-daily',
    title: 'Users Daily',
    description:
      'Signup-week cohorts — who is still active, who pays, and how much they have purchased.',
    source: 'players × player_lifetime_stats',
    icon: Users,
  },
  {
    href: '/admin/reports/redeem-rate',
    title: 'Redeem Rate',
    description:
      'Daily redemption rate (USD redeemed / USD purchased) — both per-day and lifetime cumulative.',
    source: 'daily_redemption_rate_snapshot',
    icon: Repeat,
  },
  {
    href: '/admin/reports/playthrough',
    title: 'Playthrough',
    description:
      'Per-bonus-type playthrough velocity — completion rate, expiry rate, average completion time.',
    source: 'bonuses_awarded',
    icon: ListChecks,
  },
  {
    href: '/admin/reports/affiliate',
    title: 'Affiliate Report',
    description:
      'Active affiliates ranked by lifetime NGR attributed — paid / pending / last payout.',
    source: 'affiliates × affiliate_payouts',
    icon: Coins,
  },
  {
    href: '/admin/reports/tax',
    title: '1099-MISC Tax Queue',
    description:
      'Players whose paid redemptions in a calendar year hit the $600 threshold. Master triggers generation + delivery.',
    source: 'tax_reports',
    icon: Receipt,
    masterOnly: true,
  },
  {
    href: '/admin/reports/custom-query',
    title: 'Custom Query',
    description:
      'Master-only escape hatch. Read-only Postgres against an allow-listed schema, 30 s timeout, 10,000-row cap.',
    source: 'allow-listed read-only schema',
    icon: FileSpreadsheet,
    masterOnly: true,
  },
]

export default async function ReportsIndexPage() {
  const session = await requireReportsAccess('/admin/reports')
  const role = session.payload.role
  const isMaster = role === 'master'

  return (
    <ListPageShell
      title="Reports"
      subtitle={`${REPORTS.length} report types`}
      breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Reports' }]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      insights={[
        {
          label: 'Date range',
          value: '7d → all time',
          delta: 'preset chips on every report',
          tone: 'neutral',
          icon: <CalendarDays className="h-3.5 w-3.5" />,
        },
        {
          label: 'Export',
          value: 'CSV',
          delta: 'one click on every report',
          tone: 'neutral',
          icon: <FileSpreadsheet className="h-3.5 w-3.5" />,
        },
        {
          label: 'Audit',
          value: '100%',
          delta: 'every download logged to audit_log + exports',
          tone: 'positive',
          icon: <ListChecks className="h-3.5 w-3.5" />,
        },
        {
          label: 'Permissions',
          value: role === 'master' ? 'Master' : role === 'manager' ? 'Manager+' : role,
          delta: isMaster ? 'including Custom Query' : 'Custom Query is master-only',
          tone: 'neutral',
          icon: <BarChart3 className="h-3.5 w-3.5" />,
        },
      ]}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.filter((r) => !r.masterOnly || isMaster).map((r) => {
          const Icon = r.icon
          return (
            <Link
              key={r.href}
              href={r.href}
              className="group flex flex-col gap-2 rounded-lg border border-line-subtle bg-surface p-5 transition-colors hover:border-line-default hover:bg-surface-hover"
            >
              <div className="flex items-center justify-between">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-elevated text-ink-secondary">
                  <Icon className="h-4 w-4" />
                </div>
                {r.masterOnly ? (
                  <span className="rounded-md border border-attention/30 bg-attention/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-attention">
                    Master only
                  </span>
                ) : null}
              </div>
              <div className="text-base font-semibold text-ink-primary">{r.title}</div>
              <p className="text-sm leading-snug text-ink-secondary">{r.description}</p>
              <div className="mt-auto pt-2 text-[11px] font-mono text-ink-tertiary">{r.source}</div>
            </Link>
          )
        })}
      </div>
    </ListPageShell>
  )
}
