import { describe, expect, it } from 'vitest'

import {
  evaluateRedemptionRules,
  type RedemptionEvaluationContext,
  type RedemptionRule,
} from '../redemption-rules'

// $1 in our minor-unit money scale = 10_000n.
const DOLLAR = 10_000n

function makeRule(overrides: Partial<RedemptionRule> = {}): RedemptionRule {
  const now = new Date('2026-05-18T00:00:00Z')
  return {
    id: 'rule-1',
    title: 'test',
    description: null,
    priority: 100,
    isActive: true,
    action: 'auto_approve',
    maxAmountUsd: null,
    minAmountUsd: null,
    requiredKycLevels: [],
    blockedStates: [],
    requirePriorPaidRedemption: false,
    completionHours: 0,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    ...overrides,
  }
}

function makeCtx(
  overrides: Partial<RedemptionEvaluationContext> = {},
): RedemptionEvaluationContext {
  return {
    amountUsd: 100n * DOLLAR,
    kycLevel: 4,
    state: 'NY',
    priorPaidRedemptionCount: 1,
    ...overrides,
  }
}

describe('evaluateRedemptionRules', () => {
  it('returns pending_review with no matched rule when the rule list is empty', () => {
    expect(evaluateRedemptionRules([], makeCtx())).toEqual({
      matchedRule: null,
      action: 'pending_review',
    })
  })

  it('matches a rule whose max-amount covers the request', () => {
    const rule = makeRule({ maxAmountUsd: 500n * DOLLAR })
    const result = evaluateRedemptionRules([rule], makeCtx({ amountUsd: 100n * DOLLAR }))
    expect(result.matchedRule?.id).toBe('rule-1')
    expect(result.action).toBe('auto_approve')
  })

  it('skips a rule whose max-amount is below the request', () => {
    const rule = makeRule({ maxAmountUsd: 50n * DOLLAR })
    const result = evaluateRedemptionRules([rule], makeCtx({ amountUsd: 100n * DOLLAR }))
    expect(result.action).toBe('pending_review')
  })

  it('respects required KYC levels', () => {
    const rule = makeRule({ requiredKycLevels: [4, 5] })
    expect(evaluateRedemptionRules([rule], makeCtx({ kycLevel: 3 })).action).toBe('pending_review')
    expect(evaluateRedemptionRules([rule], makeCtx({ kycLevel: 4 })).action).toBe('auto_approve')
    expect(evaluateRedemptionRules([rule], makeCtx({ kycLevel: 5 })).action).toBe('auto_approve')
  })

  it('blocks players from disallowed states', () => {
    const rule = makeRule({ blockedStates: ['WA', 'MI'] })
    expect(evaluateRedemptionRules([rule], makeCtx({ state: 'WA' })).action).toBe('pending_review')
    expect(evaluateRedemptionRules([rule], makeCtx({ state: 'NY' })).action).toBe('auto_approve')
  })

  it('requires a prior paid redemption when configured', () => {
    const rule = makeRule({ requirePriorPaidRedemption: true })
    expect(evaluateRedemptionRules([rule], makeCtx({ priorPaidRedemptionCount: 0 })).action).toBe(
      'pending_review',
    )
    expect(evaluateRedemptionRules([rule], makeCtx({ priorPaidRedemptionCount: 3 })).action).toBe(
      'auto_approve',
    )
  })

  it('honours priority order — first matching rule wins', () => {
    const reviewFirst = makeRule({
      id: 'review',
      priority: 50,
      action: 'route_to_review',
      maxAmountUsd: 1000n * DOLLAR,
    })
    const autoSecond = makeRule({
      id: 'auto',
      priority: 100,
      action: 'auto_approve',
      maxAmountUsd: 1000n * DOLLAR,
    })
    const result = evaluateRedemptionRules([reviewFirst, autoSecond], makeCtx())
    expect(result.matchedRule?.id).toBe('review')
    expect(result.action).toBe('route_to_review')
  })

  it('skips inactive and archived rules', () => {
    const inactive = makeRule({ id: 'a', isActive: false, maxAmountUsd: 1000n * DOLLAR })
    const archived = makeRule({
      id: 'b',
      archivedAt: new Date('2026-01-01T00:00:00Z'),
      maxAmountUsd: 1000n * DOLLAR,
    })
    expect(evaluateRedemptionRules([inactive, archived], makeCtx()).action).toBe('pending_review')
  })

  it('matches the operator default rule ($500 / KYC 4-5 / prior paid)', () => {
    const rule = makeRule({
      title: '$500 or less instant',
      maxAmountUsd: 500n * DOLLAR,
      requiredKycLevels: [4, 5],
      requirePriorPaidRedemption: true,
    })

    // Happy path.
    expect(
      evaluateRedemptionRules(
        [rule],
        makeCtx({ amountUsd: 250n * DOLLAR, kycLevel: 4, priorPaidRedemptionCount: 2 }),
      ).action,
    ).toBe('auto_approve')

    // Above $500 — review.
    expect(
      evaluateRedemptionRules(
        [rule],
        makeCtx({ amountUsd: 600n * DOLLAR, kycLevel: 5, priorPaidRedemptionCount: 2 }),
      ).action,
    ).toBe('pending_review')

    // KYC L2 — review.
    expect(
      evaluateRedemptionRules(
        [rule],
        makeCtx({ amountUsd: 100n * DOLLAR, kycLevel: 2, priorPaidRedemptionCount: 2 }),
      ).action,
    ).toBe('pending_review')

    // First redemption — review.
    expect(
      evaluateRedemptionRules(
        [rule],
        makeCtx({ amountUsd: 100n * DOLLAR, kycLevel: 4, priorPaidRedemptionCount: 0 }),
      ).action,
    ).toBe('pending_review')
  })
})
