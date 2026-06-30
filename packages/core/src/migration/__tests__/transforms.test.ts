import { describe, expect, it } from 'vitest'

import {
  applyTransform,
  dashToNull,
  lower,
  parseDatetime,
  parseDisabled,
  parseMethod,
  parseMoney,
  parseStatus,
  parseStatusKnown,
} from '../transforms'
import { parseRsgFreetext } from '../transforms-rsg'

describe('dashToNull', () => {
  it('returns null for "-"', () => expect(dashToNull('-')).toBeNull())
  it('returns null for empty', () => expect(dashToNull('')).toBeNull())
  it('returns null for whitespace only', () => expect(dashToNull('  ')).toBeNull())
  it('trims and returns non-empty', () => expect(dashToNull('  hi  ')).toBe('hi'))
})

describe('lower', () => {
  it('lowercases non-empty', () => expect(lower('FOO@Bar.COM')).toBe('foo@bar.com'))
  it('returns null for "-"', () => expect(lower('-')).toBeNull())
})

describe('parseDatetime', () => {
  it('parses MM/DD/YYYY', () => {
    const r = parseDatetime('05/19/2026')
    expect(r).toBeTruthy()
    expect(r?.startsWith('2026-05-19')).toBe(true)
  })

  it('parses MM/DD/YYYY HH:MM:SS AM/PM', () => {
    const r = parseDatetime('05/19/2026 05:41:00 PM')
    expect(r).toBeTruthy()
  })

  it('returns null for "-"', () => expect(parseDatetime('-')).toBeNull())
  it('returns null for garbage', () => expect(parseDatetime('zzz')).toBeNull())
})

describe('parseMoney', () => {
  it('strips dollar signs and commas', () => expect(parseMoney('$1,234.56')).toBe('1234.56'))
  it('returns 0 for blank', () => expect(parseMoney('')).toBe('0'))
  it('returns 0 for dash', () => expect(parseMoney('-')).toBe('0'))
  it('returns 0 for unparseable', () => expect(parseMoney('abc')).toBe('0'))
  it('preserves negatives', () => expect(parseMoney('-12.34')).toBe('-12.34'))
})

describe('parseStatus', () => {
  it('maps Active', () => expect(parseStatus('Active')).toBe('active'))
  it('maps In-Active to suspended', () => expect(parseStatus('In-Active')).toBe('suspended'))
  it('maps Restrict to restricted', () => expect(parseStatus('Restrict')).toBe('restricted'))
  it('defaults to active for unknown', () => expect(parseStatus('Whatever')).toBe('active'))
  it('reports known/unknown via parseStatusKnown', () => {
    expect(parseStatusKnown('Active')).toBe(true)
    expect(parseStatusKnown('Whatever')).toBe(false)
  })
})

describe('parseMethod', () => {
  it('maps BANK_ACCOUNT_FINIX', () => expect(parseMethod('BANK_ACCOUNT_FINIX')).toBe('finix_ach'))
  it('maps legacy BANK_ACCOUNT', () => expect(parseMethod('BANK_ACCOUNT')).toBe('finix_ach'))
  it('defaults to finix_ach', () => expect(parseMethod('NEW_METHOD')).toBe('finix_ach'))
})

describe('parseDisabled', () => {
  it('true for "true"', () => expect(parseDisabled('true')).toBe(true))
  it('true for boolean-as-string variants', () => {
    expect(parseDisabled('1')).toBe(true)
    expect(parseDisabled('yes')).toBe(true)
  })
  it('false for false-ish', () => {
    expect(parseDisabled('false')).toBe(false)
    expect(parseDisabled('0')).toBe(false)
    expect(parseDisabled('')).toBe(false)
  })
})

describe('applyTransform', () => {
  it('passes through unknown values via as-is', () => {
    expect(applyTransform('as-is', 'hello', {})).toBe('hello')
  })
  it('throws on unknown transform', () => {
    expect(() => applyTransform('not_a_real_transform', 'x', {})).toThrow()
  })
  it('treats null name as identity', () => {
    expect(applyTransform(null, 'kept', {})).toBe('kept')
  })
})

describe('parseRsgFreetext', () => {
  it('empty for blank', () => {
    expect(parseRsgFreetext('').kind).toBe('empty')
    expect(parseRsgFreetext('  ').kind).toBe('empty')
    expect(parseRsgFreetext('-').kind).toBe('empty')
  })

  it('detects self-exclusion', () => {
    const r = parseRsgFreetext('User is self excluded')
    expect(r.kind).toBe('self_exclusion')
  })

  it('detects time break with date', () => {
    const r = parseRsgFreetext('user is on time break untill May 12th 2026 at 05:41 PM')
    expect(r.kind).toBe('rg_time_break')
    if (r.kind === 'rg_time_break') {
      expect(r.expiresAt).toBeTruthy()
      expect(r.expiresAt?.startsWith('2026-05-12')).toBe(true)
    }
  })

  it('flags unknown patterns', () => {
    const r = parseRsgFreetext('mystery text')
    expect(r.kind).toBe('unknown')
  })
})
