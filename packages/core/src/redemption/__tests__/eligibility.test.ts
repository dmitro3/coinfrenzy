import { describe, expect, it } from 'vitest'

import {
  computeRequiredKycLevel,
  isKycSoftDeny,
  isWithinAutoApproveThreshold,
} from '../eligibility'
import {
  AUTO_APPROVE_THRESHOLD_USD,
  EDD_CUMULATIVE_DEPOSIT_USD,
  EDD_REQUIRED_USD,
} from '../constants'
import type { EligibilityResult } from '../types'

// docs/07 §4 — pure-function eligibility helpers. The full
// `checkRedemptionEligibility` pipeline is exercised end-to-end in the
// redemption integration test (Testcontainers) — these tests pin the small
// decision rules that the rest of the pipeline composes.

describe('computeRequiredKycLevel', () => {
  it('returns 2 (standard) when amount + cumulative deposits are below EDD thresholds', () => {
    expect(
      computeRequiredKycLevel({
        cumulativeDepositUsd: EDD_CUMULATIVE_DEPOSIT_USD - 1n,
        amountUsd: EDD_REQUIRED_USD - 1n,
      }),
    ).toBe(2)
  })

  it('returns 3 (EDD) when single-request amount exceeds the EDD threshold', () => {
    expect(
      computeRequiredKycLevel({
        cumulativeDepositUsd: 0n,
        amountUsd: EDD_REQUIRED_USD + 1n,
      }),
    ).toBe(3)
  })

  it('returns 3 (EDD) when cumulative lifetime deposits exceed the EDD threshold', () => {
    expect(
      computeRequiredKycLevel({
        cumulativeDepositUsd: EDD_CUMULATIVE_DEPOSIT_USD + 1n,
        amountUsd: 0n,
      }),
    ).toBe(3)
  })

  it('does NOT escalate when amount is exactly equal to EDD threshold (strict greater-than)', () => {
    // Boundary check — docs/07 §4.1 uses ">", not ">=".
    expect(
      computeRequiredKycLevel({
        cumulativeDepositUsd: 0n,
        amountUsd: EDD_REQUIRED_USD,
      }),
    ).toBe(2)
  })
})

describe('isWithinAutoApproveThreshold', () => {
  it('approves at or below the threshold', () => {
    expect(isWithinAutoApproveThreshold(AUTO_APPROVE_THRESHOLD_USD)).toBe(true)
    expect(isWithinAutoApproveThreshold(AUTO_APPROVE_THRESHOLD_USD - 1n)).toBe(true)
    expect(isWithinAutoApproveThreshold(0n)).toBe(true)
  })

  it('declines above the threshold', () => {
    expect(isWithinAutoApproveThreshold(AUTO_APPROVE_THRESHOLD_USD + 1n)).toBe(false)
  })
})

describe('isKycSoftDeny', () => {
  it('is true only when allowed=true AND requiresKyc=true', () => {
    const softDeny: EligibilityResult = {
      allowed: true,
      requiresKyc: true,
      requiredKycLevel: 2,
      redeemable: 1n,
    }
    expect(isKycSoftDeny(softDeny)).toBe(true)
  })

  it('is false on a clean allow', () => {
    const allow: EligibilityResult = {
      allowed: true,
      requiresKyc: false,
      requiredKycLevel: 2,
      redeemable: 1n,
    }
    expect(isKycSoftDeny(allow)).toBe(false)
  })

  it('is false on a hard deny', () => {
    const deny: EligibilityResult = {
      allowed: false,
      code: 'REGISTERED_STATE_BLOCKED',
    }
    expect(isKycSoftDeny(deny)).toBe(false)
  })
})
