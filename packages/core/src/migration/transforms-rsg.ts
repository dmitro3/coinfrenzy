// docs/13 §4.3 — the rsg freetext parser.
//
// Gamma's players_data.csv `rsg` column is freetext describing
// responsible-gaming status. Two patterns observed in current data:
//   "user is on time break untill May 12th 2026 at 05:41 PM"
//   "User is self excluded"
//   ""  (empty)
//
// Any unrecognized non-empty text is returned as an 'unknown' result so
// the orchestrator can add it to migration_review_queue for human
// resolution. We do NOT silently drop unrecognized values.

export type RsgParseResult =
  | {
      kind: 'empty'
    }
  | {
      kind: 'self_exclusion'
      reason: string
      expiresAt: string | null
      source: string
    }
  | {
      kind: 'rg_time_break'
      reason: string
      expiresAt: string | null
      source: string
    }
  | {
      kind: 'unknown'
      reason: string
      source: string
    }

const DATE_REGEX =
  /until[l]?\s+([A-Za-z]+\s+\d+(?:st|nd|rd|th)?(?:[\s,]+\d{4})?)(?:\s+at\s+(\d{1,2}:\d{2}\s*(?:AM|PM)?))?/i

export function parseRsgFreetext(text: string | null | undefined): RsgParseResult {
  if (text == null) return { kind: 'empty' }
  const trimmed = String(text).trim()
  if (trimmed === '' || trimmed === '-') return { kind: 'empty' }

  const lower = trimmed.toLowerCase()
  const source = trimmed

  // Self-exclusion (permanent unless qualified by a date)
  if (lower.includes('self excluded') || lower.includes('self-excluded')) {
    const expiresAt = extractExpiry(trimmed)
    return {
      kind: 'self_exclusion',
      reason: 'Migrated from Gamma — self-exclusion',
      expiresAt,
      source,
    }
  }

  // Time-break / cool-off period — preserve the date so we don't
  // re-enable the player before Gamma would have.
  if (
    lower.includes('time break') ||
    lower.includes('timebreak') ||
    lower.includes('cool off') ||
    lower.includes('cooling off')
  ) {
    const expiresAt = extractExpiry(trimmed)
    return {
      kind: 'rg_time_break',
      reason: 'Migrated from Gamma — time break',
      expiresAt,
      source,
    }
  }

  return {
    kind: 'unknown',
    reason: 'Unrecognized rsg text from Gamma — manual review required',
    source,
  }
}

function extractExpiry(text: string): string | null {
  const match = text.match(DATE_REGEX)
  if (!match) return null

  let dateStr = match[1].replace(/(st|nd|rd|th)/gi, '').trim()
  // Add the current year if it's missing
  if (!/\d{4}/.test(dateStr)) {
    const year = new Date().getUTCFullYear()
    dateStr += ` ${year}`
  }
  const timeStr = (match[2] ?? '11:59 PM').trim()

  // Compose into something Date can parse universally
  const combined = `${dateStr} ${timeStr} UTC`
  const direct = new Date(combined)
  if (!Number.isNaN(direct.getTime())) return direct.toISOString()

  // Fallback to ISO-ish layout
  const ymd = new Date(`${dateStr} ${timeStr}`)
  if (!Number.isNaN(ymd.getTime())) return ymd.toISOString()
  return null
}
