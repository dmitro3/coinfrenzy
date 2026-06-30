'use client'

import * as React from 'react'

import { cn } from '@coinfrenzy/ui/lib/utils'

// Game History controls — date range + SC/GC toggle. Mirrors the live
// coinfrenzy.com screen exactly. The SC/GC pill is a segmented gold
// toggle (active = gold gradient, inactive = dark with hover).

interface Row {
  id: string
  gameId: string
  gameName: string
  currency: 'SC' | 'GC'
  wager: string
  win: string
  startedAt: string
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function isoMinusDays(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

export function GameHistoryControls({ rows }: { rows: Row[] }) {
  const [currency, setCurrency] = React.useState<'SC' | 'GC'>('SC')
  const [from, setFrom] = React.useState(isoMinusDays(6))
  const [to, setTo] = React.useState(todayISO())

  const filtered = React.useMemo(() => {
    return rows.filter((r) => {
      if (r.currency !== currency) return false
      const day = r.startedAt.slice(0, 10)
      return day >= from && day <= to
    })
  }, [rows, currency, from, to])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <DateInput value={from} onChange={setFrom} ariaLabel="From date" />
          <DateInput value={to} onChange={setTo} ariaLabel="To date" />
        </div>
        <CurrencyToggle value={currency} onChange={setCurrency} />
      </div>

      <div className="cf-account-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="text-[11px] uppercase tracking-[0.12em] text-[var(--cf-gray-light)]">
              <tr className="border-b border-[var(--cf-border-default)]/40">
                <th className="px-4 py-3 text-left font-semibold">Game Id</th>
                <th className="px-4 py-3 text-left font-semibold">Date &amp; Time</th>
                <th className="px-4 py-3 text-left font-semibold">Game Name</th>
                <th className="px-4 py-3 text-right font-semibold">Stake</th>
                <th className="px-4 py-3 text-right font-semibold">Win</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-16 text-center text-sm text-[var(--cf-gray-light)]"
                  >
                    No {currency} rounds in this date range.
                  </td>
                </tr>
              ) : (
                filtered.map((r, i) => (
                  <tr
                    key={r.id}
                    className={cn(
                      'border-b border-[var(--cf-border-default)]/30 transition-colors duration-150 hover:bg-[var(--cf-gold-medium)]/5',
                      i % 2 === 0 ? 'bg-transparent' : 'bg-[var(--cf-bg-elevated)]/30',
                    )}
                  >
                    <td className='px-4 py-3 tabular-nums text-white [font-feature-settings:"tnum"_1]'>
                      {r.gameId}
                    </td>
                    <td className="px-4 py-3 text-[var(--cf-gray-light)]">
                      {new Date(r.startedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-white">{r.gameName}</td>
                    <td className='px-4 py-3 text-right tabular-nums text-white [font-feature-settings:"tnum"_1]'>
                      {r.wager}
                    </td>
                    <td className='px-4 py-3 text-right tabular-nums text-white [font-feature-settings:"tnum"_1]'>
                      {r.win}
                    </td>
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

function CurrencyToggle({
  value,
  onChange,
}: {
  value: 'SC' | 'GC'
  onChange: (v: 'SC' | 'GC') => void
}) {
  return (
    <div className="inline-flex h-9 rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] p-0.5">
      {(['SC', 'GC'] as const).map((c) => {
        const active = value === c
        return (
          <button
            key={c}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(c)}
            className={cn(
              'inline-flex h-full items-center justify-center rounded px-4 text-xs font-bold uppercase tracking-wider transition-all duration-200',
              active
                ? 'cf-gold-gradient text-[#1a1300] shadow-[0_2px_8px_-2px_rgba(245,208,102,0.5)]'
                : 'text-[var(--cf-gray-light)] hover:text-white',
            )}
          >
            {c === 'SC' ? 'Sweep Coin' : 'Gold Coin'}
          </button>
        )
      })}
    </div>
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
