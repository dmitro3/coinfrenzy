// docs/13 §3.2 — declarative transforms applied to Gamma CSV cells.
//
// Every entry in `migration_column_mappings.transform` selects one of
// the functions here by name. New transforms are added by:
//   1. Adding the function below.
//   2. Adding a row to migration_column_mappings via a seed migration.
//   3. Writing a unit test in transforms.test.ts.
//
// The transforms operate on a single cell string (the raw value from the
// CSV) plus an optional whole-row object for transforms that need
// cross-column context. They return `unknown` to keep the signature
// uniform; the caller knows the target column type and casts.

import { parseRsgFreetext, type RsgParseResult } from './transforms-rsg'

export type RowContext = Record<string, string>

export type TransformFn = (value: string, row: RowContext) => unknown

const PLAYER_STATUS_MAP: Record<string, string> = {
  active: 'active',
  'in-active': 'suspended',
  inactive: 'suspended',
  'internal-user': 'active',
  restrict: 'restricted',
  restricted: 'restricted',
}

const PAYMENT_METHOD_MAP: Record<string, string> = {
  BANK_ACCOUNT_FINIX: 'finix_ach',
  BANK_ACCOUNT: 'finix_ach',
  ACH: 'finix_ach',
  apt_debit: 'apt_debit',
  APT_DEBIT: 'apt_debit',
}

/**
 * Treats Gamma's "-" sentinel as missing. Used on Username, Name, Last
 * Login, IP Location, Recent Approved At — anywhere they substitute a
 * dash for null/empty.
 */
export function dashToNull(value: string): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  if (trimmed === '' || trimmed === '-') return null
  return trimmed
}

export function lower(value: string): string | null {
  const v = dashToNull(value)
  return v == null ? null : v.toLowerCase()
}

/**
 * Parses datetimes Gamma exports in MM/DD/YYYY or "MM/DD/YYYY HH:MM:SS"
 * format. Returns null for "-" / empty. Returns null (and the caller
 * may log) for unparseable inputs — never throws.
 */
export function parseDatetime(value: string): string | null {
  const v = dashToNull(value)
  if (v == null) return null

  // Try built-in Date first
  const direct = new Date(v)
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString()
  }

  // Try MM/DD/YYYY HH:MM AM/PM
  const matched = v.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?)?$/i,
  )
  if (matched) {
    const [, mm, dd, yyyy, hh, min, sec, ampm] = matched
    let hours = hh ? parseInt(hh, 10) : 0
    if (ampm) {
      const upper = ampm.toUpperCase()
      if (upper === 'PM' && hours !== 12) hours += 12
      if (upper === 'AM' && hours === 12) hours = 0
    }
    const d = new Date(
      Date.UTC(
        parseInt(yyyy, 10),
        parseInt(mm, 10) - 1,
        parseInt(dd, 10),
        hours,
        min ? parseInt(min, 10) : 0,
        sec ? parseInt(sec, 10) : 0,
      ),
    )
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }

  return null
}

/**
 * Parses money values. Returns a string (the table column is numeric so
 * the driver does the cast). Strips $ and commas; returns '0' for blank
 * / "-" / unparseable. Never throws.
 */
export function parseMoney(value: string): string {
  if (value == null) return '0'
  const v = value.trim()
  if (v === '' || v === '-') return '0'
  // Allow "$1,234.56" → "1234.56"
  const cleaned = v.replace(/[$,\s]/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return '0'
  return cleaned
}

/**
 * Lower-cases and maps Gamma status strings to our enum. Unknown values
 * default to 'active' but the row is also added to the review queue by
 * the caller (the caller checks the lower-cased input against our map
 * and reports unknowns separately).
 */
export function parseStatus(value: string): string {
  const v = dashToNull(value)
  if (v == null) return 'active'
  return PLAYER_STATUS_MAP[v.toLowerCase()] ?? 'active'
}

export function parseStatusKnown(value: string): boolean {
  const v = dashToNull(value)
  if (v == null) return true
  return v.toLowerCase() in PLAYER_STATUS_MAP
}

export function parseMethod(value: string): string {
  const v = dashToNull(value)
  if (v == null) return 'finix_ach'
  return PAYMENT_METHOD_MAP[v] ?? PAYMENT_METHOD_MAP[v.toUpperCase()] ?? 'finix_ach'
}

export function parseDisabled(value: string): boolean {
  const v = (value ?? '').toString().trim().toLowerCase()
  if (v === 'true' || v === '1' || v === 'yes' || v === 'y') return true
  return false
}

/** Pass-through, used by mapping rows that just need the raw value. */
export function asIs(value: string): string {
  return value
}

/** Always returns null — handy for source columns we ignore. */
export function alwaysNull(): null {
  return null
}

export function parseFreetextRsg(value: string): RsgParseResult {
  return parseRsgFreetext(value)
}

/** The registry the runtime importer reads. */
export const TRANSFORMS: Record<string, TransformFn> = {
  'as-is': asIs,
  dash_to_null: dashToNull,
  lower,
  parse_datetime: parseDatetime,
  parse_money: parseMoney,
  parse_status: parseStatus,
  parse_method: parseMethod,
  parse_disabled: parseDisabled,
  always_null: alwaysNull,
  // The freetext rsg parser doesn't fit the simple cell->cell shape; it
  // returns a richer object. Callers that need it call parseRsgFreetext
  // directly, but we register it here so unknown-transform errors
  // distinguish "unknown" from "structurally different".
  parse_freetext: parseFreetextRsg as TransformFn,
}

export type TransformName = keyof typeof TRANSFORMS

export function applyTransform(
  name: string | null | undefined,
  cell: string,
  row: RowContext,
): unknown {
  if (!name || name === '' || name === 'as-is') return cell
  const fn = TRANSFORMS[name]
  if (!fn) {
    throw new Error(`unknown transform: ${name}`)
  }
  return fn(cell, row)
}

export { parseRsgFreetext, type RsgParseResult } from './transforms-rsg'
