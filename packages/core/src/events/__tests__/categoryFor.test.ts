import { describe, expect, it } from 'vitest'

import { categoryFor } from '../types'

// docs/11 §1 — categoryFor is the only mutable lookup in the closed event
// taxonomy. Every event must resolve to one of the documented categories.

describe('categoryFor', () => {
  it.each([
    ['player.signup', 'auth'],
    ['player.login', 'auth'],
    ['player.login_failed', 'auth'],
    ['player.password_reset', 'auth'],
    ['player.email_verified', 'auth'],
    ['player.phone_verified', 'auth'],
    ['player.kyc.started', 'kyc'],
    ['player.kyc.verified', 'kyc'],
    ['player.kyc.failed', 'kyc'],
    ['player.kyc.escalated', 'kyc'],
    ['player.purchase.initiated', 'commerce'],
    ['player.purchase.succeeded', 'commerce'],
    ['player.redemption.requested', 'commerce'],
    ['player.redemption.paid', 'commerce'],
    ['player.game.session_start', 'gameplay'],
    ['player.game.bet_placed', 'gameplay'],
    ['player.game.big_win', 'gameplay'],
    ['player.bonus.awarded', 'bonus'],
    ['player.bonus.expired', 'bonus'],
    ['player.tier.up', 'tier'],
    ['player.rg.deposit_limit_set', 'compliance'],
    ['player.suspended', 'compliance'],
    ['player.reactivated', 'compliance'],
    ['player.email.opened', 'crm'],
    ['player.sms.delivered', 'crm'],
    ['player.notification.read', 'crm'],
    ['player.referral.signup', 'crm'],
    ['admin.bonus_granted', 'admin'],
  ] as const)('maps %s -> %s', (name, expected) => {
    expect(categoryFor(name)).toBe(expected)
  })

  it('falls back to auth for unknown prefixes', () => {
    expect(categoryFor('something.unknown')).toBe('auth')
  })
})
