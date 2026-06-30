/**
 * api/_lib/reportPeriod.js
 *
 * THE single source of truth for parsing CoinFrenzy's `report_period` strings.
 *
 * As of 2026-04-21 CF can send the same 24-hour window in two interchangeable
 * shapes:
 *
 *   1. Compact:    "2026-04-20_14:00_to_2026-04-21_14:00"
 *   2. Full ISO:   "2026-04-20T14:00:00.000Z_to_2026-04-21T14:00:00.000Z"
 *
 * Plus the originally-documented legacy shapes:
 *
 *   3. Date-only range: "2026-03-17_to_2026-03-23"
 *   4. Month only:      "2026-03"   (also lives in `report_month`)
 *
 * Every dedup key in the codebase used to be the literal raw string. Two
 * rows for the same player covering the same window in DIFFERENT shapes
 * would silently double-count NGR everywhere — admin overview, payouts,
 * partner earnings, the canonical ledger.
 *
 * ALL aggregators (server AND client) MUST funnel period values through
 * `periodKey()` so two strings encoding the same window collapse to one.
 *
 * The browser side mirrors this logic inline in admin.html / partner.html.
 * If you change the parsing rules here, change them in both browser
 * mirrors too — search for `__periodKeyMirror__`.
 */

// _to_ separator. Tolerates whitespace / case in the raw string in case CF
// (or some future producer) emits "  _TO_  " by accident.
const TO_SEPARATOR_RE = /\s*_to_\s*/i;

// "YYYY-MM-DD_HH:MM" or "YYYY-MM-DD HH:MM" or "YYYY-MM-DDTHH:MM"
const COMPACT_DT_RE = /^(\d{4}-\d{2}-\d{2})[ _T](\d{1,2}):(\d{2})(?::(\d{2}))?$/;

// "YYYY-MM-DD"
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// "YYYY-MM"
const MONTH_RE = /^(\d{4})-(\d{2})$/;

// Anything Date.parse can swallow that ends with Z or +HH:MM offset.
// We don't validate strictly — we just hand it to Date.parse and check NaN.
function parseSide(raw) {
  if (raw == null) return NaN;
  const s = String(raw).trim();
  if (!s) return NaN;

  // Try ISO first (fast path for the new full-ISO shape CF sends).
  // Note CF has been observed to send "...000Z" without the dot — Date.parse
  // tolerates the malformed millisecond chunk on V8 / Node, so we don't
  // try to repair it here. If it ever comes back NaN, fall through.
  let ms = Date.parse(s);
  if (Number.isFinite(ms)) return ms;

  // Compact "YYYY-MM-DD_HH:MM[:SS]" — rebuild as ISO.
  const compact = s.match(COMPACT_DT_RE);
  if (compact) {
    const [, ymd, hh, mm, ss] = compact;
    const isoLike = ymd + 'T' + hh.padStart(2, '0') + ':' + mm + ':' + (ss || '00') + 'Z';
    ms = Date.parse(isoLike);
    if (Number.isFinite(ms)) return ms;
  }

  // Date-only — anchor to UTC midnight so the same date in any shape collapses.
  const dateOnly = s.match(DATE_ONLY_RE);
  if (dateOnly) {
    ms = Date.parse(dateOnly[0] + 'T00:00:00Z');
    if (Number.isFinite(ms)) return ms;
  }

  return NaN;
}

/**
 * Normalize a raw report_period (or report_month) into a structured object.
 *
 * @param {string|null|undefined} rawPeriod
 * @param {string|null|undefined} fallbackMonth Optional report_month to fall
 *   back on when rawPeriod is missing/unparseable.
 * @returns {{
 *   raw: string,
 *   shape: 'iso_8601_range' | 'compact_dt_range' | 'date_only_range' |
 *          'month_only' | 'unparseable' | 'empty',
 *   startMs: number | null,
 *   endMs: number | null,
 *   canonicalKey: string,
 *   monthKey: string,
 *   isValid: boolean
 * }}
 */
function normalizePeriod(rawPeriod, fallbackMonth) {
  const raw = rawPeriod == null ? '' : String(rawPeriod).trim();
  const fb = fallbackMonth == null ? '' : String(fallbackMonth).trim();

  if (!raw && !fb) {
    return {
      raw: '',
      shape: 'empty',
      startMs: null,
      endMs: null,
      canonicalKey: '',
      monthKey: '',
      isValid: false
    };
  }

  if (!raw && fb) {
    return normalizePeriod(fb, null);
  }

  if (TO_SEPARATOR_RE.test(raw)) {
    const parts = raw.split(TO_SEPARATOR_RE);
    if (parts.length === 2) {
      const start = parseSide(parts[0]);
      const end = parseSide(parts[1]);
      if (Number.isFinite(start) && Number.isFinite(end)) {
        const startSide = parts[0].trim();
        const isFullIso = /T\d{2}:\d{2}/.test(startSide) && /Z|[+-]\d{2}:?\d{2}$/.test(startSide);
        return {
          raw,
          shape: isFullIso ? 'iso_8601_range' : (
            COMPACT_DT_RE.test(startSide) ? 'compact_dt_range' : 'date_only_range'
          ),
          startMs: start,
          endMs: end,
          canonicalKey: start + '_' + end,
          monthKey: msToMonth(start),
          isValid: true
        };
      }
    }
  }

  // Single value — month or single date.
  if (MONTH_RE.test(raw)) {
    const m = raw.match(MONTH_RE);
    const startIso = raw + '-01T00:00:00Z';
    const start = Date.parse(startIso);
    const lastDay = new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10), 0)).getUTCDate();
    const endIso = raw + '-' + String(lastDay).padStart(2, '0') + 'T23:59:59Z';
    const end = Date.parse(endIso);
    return {
      raw,
      shape: 'month_only',
      startMs: start,
      endMs: end,
      canonicalKey: start + '_' + end,
      monthKey: raw,
      isValid: true
    };
  }

  if (DATE_ONLY_RE.test(raw)) {
    const start = Date.parse(raw + 'T00:00:00Z');
    const end = Date.parse(raw + 'T23:59:59Z');
    return {
      raw,
      shape: 'date_only_range',
      startMs: start,
      endMs: end,
      canonicalKey: start + '_' + end,
      monthKey: msToMonth(start),
      isValid: true
    };
  }

  // Last-ditch: hand the whole thing to Date.parse so things like a bare
  // ISO timestamp still work.
  const single = parseSide(raw);
  if (Number.isFinite(single)) {
    return {
      raw,
      shape: 'date_only_range',
      startMs: single,
      endMs: single,
      canonicalKey: single + '_' + single,
      monthKey: msToMonth(single),
      isValid: true
    };
  }

  // Unparseable. Fall back to the literal string for the dedup key so we
  // don't silently merge unrelated rows. Fallback month if available.
  return {
    raw,
    shape: 'unparseable',
    startMs: null,
    endMs: null,
    canonicalKey: 'raw:' + raw.toLowerCase(),
    monthKey: fb && MONTH_RE.test(fb) ? fb : '',
    isValid: false
  };
}

function msToMonth(ms) {
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

/**
 * Stable, format-independent dedup key. The same window in any shape
 * returns the same string.
 */
function periodKey(rawPeriod, fallbackMonth) {
  const n = normalizePeriod(rawPeriod, fallbackMonth);
  if (n.canonicalKey) return n.canonicalKey;
  if (fallbackMonth) return 'month:' + String(fallbackMonth).trim().toLowerCase();
  return '';
}

/**
 * Derive YYYY-MM from the period start so report_month works as a fallback
 * when only report_period is set (or vice versa).
 */
function derivedMonth(rawPeriod, fallbackMonth) {
  const n = normalizePeriod(rawPeriod, fallbackMonth);
  if (n.monthKey) return n.monthKey;
  if (fallbackMonth && MONTH_RE.test(String(fallbackMonth).trim())) {
    return String(fallbackMonth).trim();
  }
  return '';
}

module.exports = {
  normalizePeriod,
  periodKey,
  derivedMonth
};
