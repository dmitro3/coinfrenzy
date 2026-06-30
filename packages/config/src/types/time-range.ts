// Dashboard time-range definitions shared between UI controls and server-side
// data fetchers. All bounds use UTC and are inclusive of `from`, exclusive of
// `to` to keep half-open windows composable for SQL `>= from AND < to`.

export const DASHBOARD_RANGE_PRESETS = [
  'today',
  'yesterday',
  'last_7_days',
  'last_30_days',
  'this_week',
  'this_month',
  'last_month',
  'this_quarter',
  'last_quarter',
  'year_to_date',
  'last_year',
  'last_12_months',
  'all_time',
] as const

export type DashboardRangePreset = (typeof DASHBOARD_RANGE_PRESETS)[number]

export type DashboardRangeKind = DashboardRangePreset | 'custom'

export type DashboardRange =
  | { kind: 'today' }
  | { kind: 'yesterday' }
  | { kind: 'last_7_days' }
  | { kind: 'last_30_days' }
  | { kind: 'this_week' }
  | { kind: 'this_month' }
  | { kind: 'last_month' }
  | { kind: 'this_quarter' }
  | { kind: 'last_quarter' }
  | { kind: 'year_to_date' }
  | { kind: 'last_year' }
  | { kind: 'last_12_months' }
  | { kind: 'all_time' }
  | { kind: 'custom'; fromIso: string; toIso: string }

export interface RangeBounds {
  /** Inclusive start (UTC). */
  from: Date
  /** Exclusive end (UTC). */
  to: Date
  /** Length of range in whole calendar days, used for label decoration. */
  days: number
  /** Human-readable label, e.g. "Today" or "Last 7 days". */
  label: string
}

export interface DashboardRangeBundle {
  /** The current period requested by the user. */
  current: RangeBounds
  /** The matching previous-period window (same length, immediately before). */
  previous: RangeBounds
  /**
   * Sparkline window — last 7 calendar days anchored to the END of the
   * current window. Used for the "7-day" tiles that should still be 7 days
   * even when a longer range is selected.
   */
  sparkline: RangeBounds
}

export const PRESET_LABELS: Record<DashboardRangePreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  last_7_days: 'Last 7 days',
  last_30_days: 'Last 30 days',
  this_week: 'This week',
  this_month: 'This month',
  last_month: 'Last month',
  this_quarter: 'This quarter',
  last_quarter: 'Last quarter',
  year_to_date: 'Year to date',
  last_year: 'Last year',
  last_12_months: 'Last 12 months',
  all_time: 'All time',
}

/**
 * Earliest date used by the `all_time` preset. Set to the platform launch
 * date — older than any real data so the resolved window covers everything.
 */
export const ALL_TIME_ANCHOR = new Date(Date.UTC(2025, 0, 1))

export const MAX_CUSTOM_RANGE_DAYS = 365

/**
 * Parse a `range`/`from`/`to` triple from URL search params into a
 * `DashboardRange`. Returns the default `today` preset if the params are
 * missing or invalid.
 */
export function parseDashboardRange(
  params: { range?: string | null; from?: string | null; to?: string | null } | URLSearchParams,
): DashboardRange {
  const range = isURLSearchParams(params) ? params.get('range') : (params.range ?? null)
  const fromRaw = isURLSearchParams(params) ? params.get('from') : (params.from ?? null)
  const toRaw = isURLSearchParams(params) ? params.get('to') : (params.to ?? null)

  if (range === 'custom') {
    if (!fromRaw || !toRaw) return { kind: 'today' }
    const from = parseIsoDate(fromRaw)
    const to = parseIsoDate(toRaw)
    if (!from || !to) return { kind: 'today' }
    if (from >= to) return { kind: 'today' }
    const diffDays = Math.ceil((to.getTime() - from.getTime()) / 86_400_000)
    if (diffDays > MAX_CUSTOM_RANGE_DAYS) return { kind: 'today' }
    return { kind: 'custom', fromIso: toIsoDate(from), toIso: toIsoDate(to) }
  }

  if (range && (DASHBOARD_RANGE_PRESETS as readonly string[]).includes(range)) {
    return { kind: range as DashboardRangePreset }
  }
  return { kind: 'today' }
}

/**
 * Resolve a `DashboardRange` into concrete UTC bounds + the matching previous
 * period and 7-day sparkline window. `now` is injected for testability.
 */
export function resolveDashboardRange(
  range: DashboardRange,
  now: Date = new Date(),
): DashboardRangeBundle {
  const current = bounds(range, now)
  const lengthMs = current.to.getTime() - current.from.getTime()
  const previous: RangeBounds = {
    from: new Date(current.from.getTime() - lengthMs),
    to: new Date(current.from.getTime()),
    days: current.days,
    label: `prev ${current.label.toLowerCase()}`,
  }
  const sparkEnd = current.to
  const sparkStart = new Date(sparkEnd.getTime() - 7 * 86_400_000)
  const sparkline: RangeBounds = {
    from: sparkStart,
    to: sparkEnd,
    days: 7,
    label: '7d trend',
  }
  return { current, previous, sparkline }
}

/**
 * Convert a `DashboardRange` back to URL search params for round-tripping.
 */
export function rangeToSearchParams(range: DashboardRange): Record<string, string> {
  if (range.kind === 'custom') {
    return { range: 'custom', from: range.fromIso, to: range.toIso }
  }
  return { range: range.kind }
}

/**
 * Build the suffix used on "N-day" tile labels, e.g. "30-Day GGR" when the
 * current range spans 30 days.
 */
export function rangeTileSuffix(bundle: DashboardRangeBundle): string {
  return `${bundle.current.days}-Day`
}

/* -------------------------------------------------------------------------- */
/* Internals                                                                   */
/* -------------------------------------------------------------------------- */

function isURLSearchParams(value: unknown): value is URLSearchParams {
  return typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams
}

function bounds(range: DashboardRange, now: Date): RangeBounds {
  const todayStart = utcStartOfDay(now)
  const tomorrowStart = addDays(todayStart, 1)

  if (range.kind === 'today') {
    return { from: todayStart, to: tomorrowStart, days: 1, label: 'Today' }
  }
  if (range.kind === 'yesterday') {
    return {
      from: addDays(todayStart, -1),
      to: todayStart,
      days: 1,
      label: 'Yesterday',
    }
  }
  if (range.kind === 'last_7_days') {
    return {
      from: addDays(todayStart, -6),
      to: tomorrowStart,
      days: 7,
      label: 'Last 7 days',
    }
  }
  if (range.kind === 'last_30_days') {
    return {
      from: addDays(todayStart, -29),
      to: tomorrowStart,
      days: 30,
      label: 'Last 30 days',
    }
  }
  if (range.kind === 'this_week') {
    const dow = todayStart.getUTCDay()
    const offsetToMonday = dow === 0 ? 6 : dow - 1
    const weekStart = addDays(todayStart, -offsetToMonday)
    return {
      from: weekStart,
      to: tomorrowStart,
      days: Math.max(1, daysBetween(weekStart, tomorrowStart)),
      label: 'This week',
    }
  }
  if (range.kind === 'this_month') {
    const monthStart = utcStartOfMonth(now)
    return {
      from: monthStart,
      to: tomorrowStart,
      days: Math.max(1, daysBetween(monthStart, tomorrowStart)),
      label: 'This month',
    }
  }
  if (range.kind === 'last_month') {
    const thisMonthStart = utcStartOfMonth(now)
    const lastMonthStart = utcAddMonths(thisMonthStart, -1)
    return {
      from: lastMonthStart,
      to: thisMonthStart,
      days: Math.max(1, daysBetween(lastMonthStart, thisMonthStart)),
      label: 'Last month',
    }
  }
  if (range.kind === 'this_quarter') {
    const start = utcStartOfQuarter(now)
    return {
      from: start,
      to: tomorrowStart,
      days: Math.max(1, daysBetween(start, tomorrowStart)),
      label: 'This quarter',
    }
  }
  if (range.kind === 'last_quarter') {
    const thisQuarterStart = utcStartOfQuarter(now)
    const lastQuarterStart = utcAddMonths(thisQuarterStart, -3)
    return {
      from: lastQuarterStart,
      to: thisQuarterStart,
      days: Math.max(1, daysBetween(lastQuarterStart, thisQuarterStart)),
      label: 'Last quarter',
    }
  }
  if (range.kind === 'year_to_date') {
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
    return {
      from: yearStart,
      to: tomorrowStart,
      days: Math.max(1, daysBetween(yearStart, tomorrowStart)),
      label: 'Year to date',
    }
  }
  if (range.kind === 'last_year') {
    const thisYearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
    const lastYearStart = new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1))
    return {
      from: lastYearStart,
      to: thisYearStart,
      days: Math.max(1, daysBetween(lastYearStart, thisYearStart)),
      label: 'Last year',
    }
  }
  if (range.kind === 'last_12_months') {
    const start = utcAddMonths(todayStart, -12)
    return {
      from: start,
      to: tomorrowStart,
      days: Math.max(1, daysBetween(start, tomorrowStart)),
      label: 'Last 12 months',
    }
  }
  if (range.kind === 'all_time') {
    return {
      from: ALL_TIME_ANCHOR,
      to: tomorrowStart,
      days: Math.max(1, daysBetween(ALL_TIME_ANCHOR, tomorrowStart)),
      label: 'All time',
    }
  }
  if (range.kind === 'custom') {
    const from = new Date(range.fromIso)
    // The custom `to` is treated as inclusive in the URL (a date the user
    // picked), so we extend by one day to make the SQL window half-open.
    const to = addDays(new Date(range.toIso), 1)
    return {
      from,
      to,
      days: Math.max(1, daysBetween(from, to)),
      label: `${formatShortDate(from)} – ${formatShortDate(addDays(to, -1))}`,
    }
  }

  const exhaustive: never = range
  throw new Error(`Unknown dashboard range: ${JSON.stringify(exhaustive)}`)
}

function utcStartOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function utcStartOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

function utcStartOfQuarter(d: Date): Date {
  const q = Math.floor(d.getUTCMonth() / 3)
  return new Date(Date.UTC(d.getUTCFullYear(), q * 3, 1))
}

function utcAddMonths(d: Date, months: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()))
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000)
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

function parseIsoDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const y = Number(m[1])
  const mm = Number(m[2])
  const dd = Number(m[3])
  if (!Number.isInteger(y) || !Number.isInteger(mm) || !Number.isInteger(dd)) return null
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null
  return new Date(Date.UTC(y, mm - 1, dd))
}

export function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear().toString().padStart(4, '0')
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0')
  const dd = d.getUTCDate().toString().padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}
