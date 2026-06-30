import { describe, expect, it } from 'vitest'

import { formatUsDateOfBirth, parseUsDateOfBirth, validatePersonalDetails } from '../player-profile'

describe('parseUsDateOfBirth', () => {
  it('parses MM/DD/YYYY into ISO date', () => {
    expect(parseUsDateOfBirth('03/15/1990')).toBe('1990-03-15')
  })

  it('rejects invalid calendar dates', () => {
    expect(parseUsDateOfBirth('02/31/1990')).toBeNull()
  })
})

describe('formatUsDateOfBirth', () => {
  it('formats ISO date for the legacy input', () => {
    expect(formatUsDateOfBirth('1990-03-15')).toBe('03/15/1990')
  })
})

describe('validatePersonalDetails', () => {
  const valid = {
    firstName: 'Harvey',
    lastName: 'Specter',
    dateOfBirth: '01/23/1985',
    gender: 'Male' as const,
    addressLine1: '601 Lexington Ave',
    city: 'New York',
    postalCode: '10022',
    state: 'NY',
  }

  it('accepts a complete valid payload', () => {
    const result = validatePersonalDetails(valid)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.dateOfBirthIso).toBe('1985-01-23')
    }
  })

  it('rejects players under 18', () => {
    const result = validatePersonalDetails({
      ...valid,
      dateOfBirth: '01/01/2020',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid_input')
      if (result.error.kind === 'invalid_input') {
        expect(result.error.field).toBe('dateOfBirth')
      }
    }
  })

  it('rejects invalid state codes', () => {
    const result = validatePersonalDetails({
      ...valid,
      state: 'New York',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid_input')
      if (result.error.kind === 'invalid_input') {
        expect(result.error.field).toBe('state')
      }
    }
  })
})
