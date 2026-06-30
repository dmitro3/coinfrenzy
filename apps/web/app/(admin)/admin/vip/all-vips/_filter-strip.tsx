'use client'

import { useRouter, useSearchParams } from 'next/navigation'

import type { AdminVipListFilters } from '../_data'

type Options = readonly [string, string][]

const STATUS: Options = [
  ['all', 'All statuses'],
  ['candidate', 'Candidate'],
  ['vip', 'VIP'],
  ['high_roller', 'High Roller'],
]

const HOST: Options = [
  ['all', 'Any host'],
  ['unassigned', 'Unassigned'],
]

const ACTIVITY: Options = [
  ['all', 'Any activity'],
  ['active7d', 'Active 7d'],
  ['dormant30d', 'Dormant 30d+'],
]

const KYC: Options = [
  ['all', 'Any KYC'],
  ['0', 'Level 0'],
  ['1', 'Level 1'],
  ['2', 'Level 2'],
  ['3', 'Level 3'],
]

export function FilterStrip({ filters }: { filters: AdminVipListFilters }) {
  const router = useRouter()
  const params = useSearchParams()

  function update(key: string, value: string) {
    const next = new URLSearchParams(Array.from(params?.entries() ?? []))
    if (!value || value === 'all') {
      next.delete(key)
    } else {
      next.set(key, value)
    }
    router.push(`?${next.toString()}`)
  }

  return (
    <div className="flex flex-wrap gap-3 text-sm">
      <Select
        label="Status"
        value={filters.status ?? 'all'}
        options={STATUS}
        onChange={(v) => update('status', v)}
      />
      <Select
        label="Host"
        value={filters.hostId ?? 'all'}
        options={HOST}
        onChange={(v) => update('host', v)}
      />
      <Select
        label="Activity"
        value={filters.activity ?? 'all'}
        options={ACTIVITY}
        onChange={(v) => update('activity', v)}
      />
      <Select
        label="KYC"
        value={filters.kycLevel ?? 'all'}
        options={KYC}
        onChange={(v) => update('kyc', v)}
      />
    </div>
  )
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Options
  onChange: (value: string) => void
}) {
  return (
    <label className="inline-flex items-center gap-2 rounded-md border border-line-subtle bg-surface px-3 py-1.5">
      <span className="text-xs font-medium uppercase tracking-wider text-ink-tertiary">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-xs text-ink-primary focus:outline-none"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  )
}
