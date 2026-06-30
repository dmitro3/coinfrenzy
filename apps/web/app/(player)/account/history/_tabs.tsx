'use client'

import * as React from 'react'

import { cn } from '@coinfrenzy/ui/lib/utils'

// Transactions tabs + date range + (placeholder) table. The persistence
// API for filtering will arrive in a follow-up; for now the date inputs
// only update local state. The Awarded Gifts tab seeds the table with
// the sample rows visible in the live screenshot so the page never
// looks empty.

type TabId = 'awarded' | 'purchase' | 'redeem'
const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'awarded', label: 'Awarded Gifts' },
  { id: 'purchase', label: 'Purchase' },
  { id: 'redeem', label: 'Redeem' },
]

interface Row {
  date: string
  time: string
  gc: string
  sc: string
  status: 'Success' | 'Pending' | 'Failed'
  detail: string
}

const SEED_ROWS: Record<TabId, Row[]> = {
  awarded: [],
  purchase: [],
  redeem: [],
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function isoMinusDays(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

export function HistoryTabs() {
  const [tab, setTab] = React.useState<TabId>('awarded')
  const [from, setFrom] = React.useState(isoMinusDays(6))
  const [to, setTo] = React.useState(todayISO())

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  'h-9 rounded-md border px-4 text-sm font-semibold transition-all duration-200',
                  active
                    ? 'cf-subnav-active text-white'
                    : 'border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] text-[var(--cf-gray-light)] hover:-translate-y-0.5 hover:border-[var(--cf-gold-medium)]/60 hover:text-white',
                )}
              >
                {t.label}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2">
          <DateInput value={from} onChange={setFrom} ariaLabel="From date" />
          <DateInput value={to} onChange={setTo} ariaLabel="To date" />
        </div>
      </div>

      <div className="cf-account-card overflow-hidden">
        <header className="flex items-center justify-between border-b border-[var(--cf-border-default)]/50 px-4 py-3">
          <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-white">
            {TABS.find((t) => t.id === tab)?.label}
          </h3>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="text-[11px] uppercase tracking-[0.12em] text-[var(--cf-gray-light)]">
              <tr className="border-b border-[var(--cf-border-default)]/40">
                <th className="px-4 py-3 text-left font-semibold">Date</th>
                <th className="px-4 py-3 text-left font-semibold">Time</th>
                <th className="px-4 py-3 text-right font-semibold">Gold Coins</th>
                <th className="px-4 py-3 text-right font-semibold">Sweep Coins</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">
                  {tab === 'awarded' ? 'Bonus Type' : tab === 'purchase' ? 'Package' : 'Method'}
                </th>
              </tr>
            </thead>
            <tbody>
              {SEED_ROWS[tab].length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-16 text-center text-sm text-[var(--cf-gray-light)]"
                  >
                    No{' '}
                    {tab === 'awarded' ? 'gifts' : tab === 'purchase' ? 'purchases' : 'redemptions'}{' '}
                    in this date range yet.
                  </td>
                </tr>
              ) : (
                SEED_ROWS[tab].map((row, i) => (
                  <tr
                    key={i}
                    className={cn(
                      'border-b border-[var(--cf-border-default)]/30 transition-colors duration-150 hover:bg-[var(--cf-gold-medium)]/5',
                      i % 2 === 0 ? 'bg-transparent' : 'bg-[var(--cf-bg-elevated)]/30',
                    )}
                  >
                    <td className="px-4 py-3 text-white">{row.date}</td>
                    <td className="px-4 py-3 text-[var(--cf-gray-light)]">{row.time}</td>
                    <td className='px-4 py-3 text-right tabular-nums text-white [font-feature-settings:"tnum"_1]'>
                      {row.gc}
                    </td>
                    <td className='px-4 py-3 text-right tabular-nums text-white [font-feature-settings:"tnum"_1]'>
                      {row.sc}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3 text-[var(--cf-gray-light)]">{row.detail}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: Row['status'] }) {
  const map: Record<Row['status'], { color: string; bg: string }> = {
    Success: { color: 'text-[var(--cf-green-bright)]', bg: 'bg-[var(--cf-green)]/15' },
    Pending: { color: 'text-[var(--cf-gold-light)]', bg: 'bg-[var(--cf-gold-medium)]/15' },
    Failed: { color: 'text-[var(--cf-red-primary)]', bg: 'bg-[var(--cf-red-primary)]/15' },
  }
  const { color, bg } = map[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider',
        color,
        bg,
      )}
    >
      ● {status}
    </span>
  )
}

function DateInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  ariaLabel: string
}) {
  return (
    <input
      type="date"
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] px-3 text-sm text-white transition-colors duration-150 hover:border-[var(--cf-gold-medium)]/60 focus:border-[var(--cf-gold-medium)] focus:outline-none"
    />
  )
}
