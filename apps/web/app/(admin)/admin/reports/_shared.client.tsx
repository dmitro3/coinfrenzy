/**
 * Shared client-side formatters and date-range helpers for every Report.
 *
 * Money is stored in the DB as `numeric(20,4)` (minor units × 10,000). All
 * report rows we serialise across the wire pass the value as a base-10
 * string so we never lose precision through JSON.
 */

/** Format minor-unit bigint as a 2dp human number with thousand separators. */
export function formatMoney(value: bigint | string | number): string {
  const v = typeof value === 'bigint' ? value : BigInt(value)
  const major = v / 10000n
  const fraction = v % 10000n
  const sign = v < 0n ? '-' : ''
  const absMajor = major < 0n ? -major : major
  const absFraction = fraction < 0n ? -fraction : fraction
  const fractionPad = absFraction.toString().padStart(4, '0').slice(0, 2)
  return `${sign}${formatThousands(absMajor.toString())}.${fractionPad}`
}

export function formatThousands(s: string): string {
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export function formatPct(numerator: bigint, denominator: bigint): string {
  if (denominator === 0n) return '—'
  const ratio = (Number(numerator) / Number(denominator)) * 100
  return `${ratio.toFixed(2)}%`
}

/** Compact dollar formatting for insight tiles ($1.2M / $42.4K / $812). */
export function formatUsdCompact(value: bigint | string | number): string {
  const v = typeof value === 'bigint' ? value : BigInt(value)
  const major = Number(v / 10000n)
  if (Math.abs(major) >= 1_000_000) return `$${(major / 1_000_000).toFixed(1)}M`
  if (Math.abs(major) >= 10_000) return `$${(major / 1_000).toFixed(1)}K`
  return `$${formatThousands(major.toString())}`
}

export function formatScCompact(value: bigint | string | number): string {
  const v = typeof value === 'bigint' ? value : BigInt(value)
  const major = Number(v / 10000n)
  if (Math.abs(major) >= 1_000_000) return `${(major / 1_000_000).toFixed(1)}M SC`
  if (Math.abs(major) >= 10_000) return `${(major / 1_000).toFixed(1)}K SC`
  return `${formatThousands(major.toString())} SC`
}

/** ISO date helpers used by report filter UIs. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function defaultLast30Days(): { from: string; to: string } {
  const to = new Date()
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000)
  return { from: isoDate(from), to: isoDate(to) }
}

export type DateRange = { from: string; to: string }

export function parseDateRange(searchParams: Record<string, string | string[] | undefined>): {
  from: string
  to: string
} {
  const fallback = defaultLast30Days()
  const from = pickFirst(searchParams.from)
  const to = pickFirst(searchParams.to)
  return {
    from: validIsoDate(from) ? from : fallback.from,
    to: validIsoDate(to) ? to : fallback.to,
  }
}

function pickFirst(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? ''
  return v ?? ''
}

function validIsoDate(s: string): s is string {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

/**
 * Compute a date-range preset relative to today. Returns ISO yyyy-mm-dd
 * strings safe to drop straight into a search-params URL.
 */
export function presetRange(preset: ReportPreset): { from: string; to: string } {
  const today = new Date()
  const toIso = isoDate(today)
  switch (preset) {
    case '7d':
      return { from: isoDate(addDays(today, -7)), to: toIso }
    case '30d':
      return { from: isoDate(addDays(today, -30)), to: toIso }
    case '90d':
      return { from: isoDate(addDays(today, -90)), to: toIso }
    case '180d':
      return { from: isoDate(addDays(today, -180)), to: toIso }
    case '1y':
      return { from: isoDate(addDays(today, -365)), to: toIso }
    case 'mtd': {
      const d = new Date(today.getFullYear(), today.getMonth(), 1)
      return { from: isoDate(d), to: toIso }
    }
    case 'last_month': {
      const firstOfThis = new Date(today.getFullYear(), today.getMonth(), 1)
      const firstOfLast = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const lastOfLast = new Date(firstOfThis.getTime() - 24 * 3600 * 1000)
      return { from: isoDate(firstOfLast), to: isoDate(lastOfLast) }
    }
    case 'ytd':
      return { from: `${today.getFullYear()}-01-01`, to: toIso }
    case 'all':
      return { from: '2000-01-01', to: toIso }
    default:
      return defaultLast30Days()
  }
}

export type ReportPreset =
  | '7d'
  | '30d'
  | '90d'
  | '180d'
  | '1y'
  | 'mtd'
  | 'last_month'
  | 'ytd'
  | 'all'

export const PRESET_OPTIONS: { id: ReportPreset; label: string }[] = [
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: '90d', label: '90d' },
  { id: '180d', label: '180d' },
  { id: '1y', label: '1y' },
  { id: 'mtd', label: 'MTD' },
  { id: 'last_month', label: 'Last month' },
  { id: 'ytd', label: 'YTD' },
  { id: 'all', label: 'All time' },
]

function addDays(d: Date, days: number): Date {
  const next = new Date(d.getTime())
  next.setDate(next.getDate() + days)
  return next
}

/** Tiny helper so report pages don't all reimplement the same comparator. */
export function formatHumanRange(range: DateRange): string {
  return `${range.from} → ${range.to}`
}
