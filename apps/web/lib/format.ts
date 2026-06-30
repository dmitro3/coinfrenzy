// Money formatting for the player surface. Money is bigint in minor units
// (1 major = 10_000 minor — see packages/db/src/schema/_shared.ts). The
// player-facing display always renders in major units with two decimals
// for SC/GC; USD likewise.

const SCALE = 10_000n

/**
 * Format a money value as `12,345.67`.
 *
 * Accepts:
 *   - bigint (minor units, e.g. `123456n` → `12.35`)
 *   - integer-string (minor units, e.g. `'123456'` → `12.35`)
 *   - decimal-string (major.minor as it comes back from postgres
 *     `numeric(20,4)`, e.g. `'5135.0000'` → `5,135.00`)
 */
export function formatCoins(value: string | bigint): string {
  const big = typeof value === 'bigint' ? value : decimalStringToMinorBigint(value)
  const negative = big < 0n
  const abs = negative ? -big : big
  const major = abs / SCALE
  const minor = abs % SCALE
  const minorTwo = (minor * 100n + SCALE / 2n) / SCALE
  return `${negative ? '-' : ''}${formatInt(major)}.${minorTwo.toString().padStart(2, '0')}`
}

function decimalStringToMinorBigint(value: string): bigint {
  if (!value) return 0n
  const trimmed = value.trim()
  if (trimmed === '' || trimmed === '0') return 0n
  // Already an integer string (no decimal) — assume minor units.
  if (!trimmed.includes('.')) return BigInt(trimmed)
  // Decimal string, e.g. '5135.0000' (numeric(20,4) from postgres) — convert
  // to minor units by padding/truncating the fractional part to 4 digits.
  const negative = trimmed.startsWith('-')
  const abs = negative ? trimmed.slice(1) : trimmed
  const [majorStr = '0', fracStr = ''] = abs.split('.')
  const fracPadded = fracStr.padEnd(4, '0').slice(0, 4)
  const total = BigInt(majorStr) * SCALE + BigInt(fracPadded || '0')
  return negative ? -total : total
}

export function formatUsd(value: string | bigint): string {
  return `$${formatCoins(value)}`
}

function formatInt(n: bigint): string {
  const s = n.toString()
  let out = ''
  let count = 0
  for (let i = s.length - 1; i >= 0; i--) {
    out = s[i] + out
    count++
    if (count % 3 === 0 && i > 0) out = ',' + out
  }
  return out
}

/**
 * Compact money formatter. Large values collapse to K/M/B suffixes so the
 * number always fits inside a fixed-width stat tile, regardless of player
 * lifetime spend. The full value remains available via `formatCoins` for
 * tooltips / aria-labels so we never hide precision from the admin.
 *
 *  1,234.56     → 1,234.56     (no compaction below 10k)
 *  12,345.67    → 12.3K
 *  1,234,567.89 → 1.23M
 *  1.5e9        → 1.50B
 *
 * Always returns at most ~6 visible characters (sign + 4 digits + suffix).
 */
export function formatCompactCoins(value: string | bigint): string {
  const big = typeof value === 'bigint' ? value : decimalStringToMinorBigint(value)
  const negative = big < 0n
  const abs = negative ? -big : big
  const major = abs / SCALE

  const sign = negative ? '-' : ''

  if (major < 10_000n) {
    return `${sign}${formatCoins(abs)}`
  }
  if (major < 1_000_000n) {
    const tenths = (major * 10n) / 1_000n
    const whole = tenths / 10n
    const frac = tenths % 10n
    return `${sign}${whole}.${frac}K`
  }
  if (major < 1_000_000_000n) {
    const hundredths = (major * 100n) / 1_000_000n
    const whole = hundredths / 100n
    const frac = hundredths % 100n
    return `${sign}${whole}.${frac.toString().padStart(2, '0')}M`
  }
  const hundredths = (major * 100n) / 1_000_000_000n
  const whole = hundredths / 100n
  const frac = hundredths % 100n
  return `${sign}${whole}.${frac.toString().padStart(2, '0')}B`
}

export function formatCompactUsd(value: string | bigint): string {
  return `$${formatCompactCoins(value)}`
}

/**
 * Format an integer count compactly (game plays, bet counts, etc.).
 *  999     → "999"
 *  12,345  → "12.3K"
 *  3.4e6   → "3.4M"
 */
export function formatCompactInt(n: number | bigint): string {
  const big = typeof n === 'bigint' ? n : BigInt(Math.max(0, Math.floor(n)))
  if (big < 1_000n) return big.toString()
  if (big < 1_000_000n) {
    const tenths = (big * 10n) / 1_000n
    return `${tenths / 10n}.${tenths % 10n}K`
  }
  if (big < 1_000_000_000n) {
    const tenths = (big * 10n) / 1_000_000n
    return `${tenths / 10n}.${tenths % 10n}M`
  }
  const tenths = (big * 10n) / 1_000_000_000n
  return `${tenths / 10n}.${tenths % 10n}B`
}

/**
 * Short relative-time formatter for "last activity" cells.
 *   < 1m   → "just now"
 *   < 1h   → "Nm ago"
 *   < 1d   → "Nh ago"
 *   < 30d  → "Nd ago"
 *   else   → localized date string
 */
export function relativeTime(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value)
  const ms = Date.now() - date.getTime()
  if (!Number.isFinite(ms)) return '—'
  if (ms < 0) return 'in the future'
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return date.toLocaleDateString()
}
