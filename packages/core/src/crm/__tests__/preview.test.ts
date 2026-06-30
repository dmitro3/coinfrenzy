import { describe, expect, it } from 'vitest'

import { extractVariables, renderPreview, TEMPLATE_VARIABLES } from '../preview'
import type { ExtendedPlayerContext } from '../preview'

const player: ExtendedPlayerContext = {
  id: 'player-1',
  email: 'jane@example.com',
  username: 'jane99',
  displayName: 'Jane',
  firstName: 'Jane',
  lastName: 'Doe',
  fullName: 'Jane Doe',
  phone: null,
  state: 'FL',
  signupState: 'FL',
  country: 'US',
  signupCountry: 'US',
  kycLevel: 2,
  marketingConsent: true,
  smsConsent: true,
  registeredAt: '2025-01-01T00:00:00Z',
  signupDateFriendly: 'January 1, 2025',
  lastLoginAt: '2026-05-10T00:00:00Z',
  lastLoginRelative: '4 days ago',
  firstPurchaseAt: '2025-01-15T00:00:00Z',
  lastPurchaseAt: '2026-04-20T00:00:00Z',
  lifetimeSpendUsd: '247.50',
  lifetimeRedeemedUsd: '120.00',
  lifetimeNetPositionUsd: '127.50',
  lifetimePurchaseCount: 5,
  lifetimeRedemptionCount: 1,
  lifetimeBetCount: 412,
  lifetimeScWagered: '1240.00',
  lifetimeScWon: '1100.00',
  tierName: 'Gold',
  tierLevel: 4,
  tierProgressPct: 67,
  balanceSc: '125.40',
  balanceGc: '2400.00',
  balanceScPurchased: '50.00',
  balanceScBonus: '25.40',
  activeBonusCount: 1,
  unsubscribedEmail: false,
}

describe('variable preview engine', () => {
  it('extracts variables from a template', () => {
    const tpl = 'Hi {{ player.firstName }}, your balance is ${{ player.balanceSc }}.'
    expect(extractVariables(tpl).sort()).toEqual(['player.balanceSc', 'player.firstName'].sort())
  })

  it('renders simple substitutions for SMS', () => {
    const r = renderPreview('Hi {{player.firstName}}!', player, { channel: 'sms' })
    expect(r.rendered).toBe('Hi Jane!')
    expect(r.variablesFound).toContain('player.firstName')
    expect(r.variablesMissing).toEqual([])
  })

  it('renders nested paths', () => {
    const r = renderPreview('Tier: {{player.tierName}} ({{player.tierLevel}})', player, {
      channel: 'sms',
    })
    expect(r.rendered).toBe('Tier: Gold (4)')
  })

  it('flags variables missing for the player', () => {
    const r = renderPreview('Hello {{player.middleName}}!', player, { channel: 'email' })
    expect(r.variablesMissing).toContain('player.middleName')
    expect(r.warnings.length).toBeGreaterThan(0)
  })

  it('reports SMS segment count for long messages', () => {
    const long = 'a'.repeat(170)
    const r = renderPreview(long, player, { channel: 'sms' })
    expect(r.metrics.smsSegments).toBe(2)
  })

  it('produces a non-zero spam score for spammy email content', () => {
    const html = `<html><body><p>FREE MONEY!!!! CLICK HERE NOW!!! ACT NOW URGENT GUARANTEE!</p></body></html>`
    const r = renderPreview(html, player, { channel: 'email', noEscape: true })
    expect(r.metrics.spamScore).toBeGreaterThan(0)
  })

  it('produces a low/zero score for clean copy', () => {
    const r = renderPreview('Hi {{player.firstName}}, here is your weekly summary.', player, {
      channel: 'email',
      noEscape: true,
    })
    expect(r.metrics.spamScore ?? 0).toBeLessThan(5)
  })

  it('exposes a non-empty TEMPLATE_VARIABLES catalog', () => {
    expect(TEMPLATE_VARIABLES.length).toBeGreaterThan(5)
    for (const v of TEMPLATE_VARIABLES) {
      expect(v.key).toMatch(/[\w.]+/)
      expect(v.label).toBeTruthy()
    }
  })

  it('survives malformed templates (does not throw)', () => {
    const r = renderPreview('{{ not a real handlebars expression', player, { channel: 'sms' })
    expect(typeof r.rendered).toBe('string')
  })
})
