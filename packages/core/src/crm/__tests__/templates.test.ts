import { describe, expect, it } from 'vitest'

import { renderPlaintextTemplate, renderTemplate, type RenderContext } from '../templates'

// Pure unit tests for the template renderer (docs/11 §6.1). The rendering
// helpers are pure: given a context, produce a string. We test the helpers
// + the variable substitution + the safety net for malformed templates.

const sampleCtx: RenderContext = {
  player: {
    email: 'jane@example.com',
    username: 'janed',
    displayName: 'Jane Doe',
    firstName: 'Jane',
    lastName: 'Doe',
    state: 'CA',
    tierName: 'Gold',
    tierProgressPct: 75,
    balanceSc: '12.50',
    balanceGc: '5000.00',
    lastLoginRelative: 'yesterday',
    signupDateFriendly: 'June 1, 2024',
  },
  campaign: { ctaUrl: 'https://example.test/cta', promoCode: 'SAVE10' },
  unsubscribeUrl: 'https://example.test/unsubscribe?t=abc',
}

describe('renderTemplate (HTML)', () => {
  it('substitutes player variables', () => {
    const html = renderTemplate(
      '<p>Hi {{player.displayName}}, your tier is {{player.tierName}}.</p>',
      sampleCtx,
    )
    expect(html).toBe('<p>Hi Jane Doe, your tier is Gold.</p>')
  })

  it('substitutes campaign and unsubscribe variables', () => {
    const html = renderTemplate(
      '<a href="{{campaign.ctaUrl}}">Claim {{campaign.promoCode}}</a> <a href="{{unsubscribeUrl}}">x</a>',
      sampleCtx,
    )
    expect(html).toContain('href="https://example.test/cta"')
    expect(html).toContain('SAVE10')
    // Handlebars HTML-escapes `=` to `&#x3D;` inside attribute values; both
    // forms decode identically in the rendered email so we accept either.
    expect(html).toMatch(/href="https:\/\/example\.test\/unsubscribe\?t(=|&#x3D;)abc"/)
  })

  it('html-escapes player values to defend against injection', () => {
    const ctx: RenderContext = {
      ...sampleCtx,
      player: { ...sampleCtx.player, displayName: '<script>alert(1)</script>' },
    }
    const html = renderTemplate('<p>{{player.displayName}}</p>', ctx)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('supports the upper / lower / default helpers', () => {
    const html = renderTemplate(
      '{{upper player.tierName}} {{lower player.tierName}} {{default player.middleName "n/a"}}',
      sampleCtx,
    )
    expect(html).toContain('GOLD')
    expect(html).toContain('gold')
    expect(html).toContain('n/a')
  })

  it('returns the template + an error annotation on parse failure', () => {
    const html = renderTemplate('{{player.tierName', sampleCtx)
    expect(html).toContain('[render_error:')
  })
})

describe('renderPlaintextTemplate (text)', () => {
  it('does not escape special characters', () => {
    const ctx: RenderContext = {
      ...sampleCtx,
      player: { ...sampleCtx.player, displayName: 'A & B <C>' },
    }
    const text = renderPlaintextTemplate('Hi {{player.displayName}}', ctx)
    expect(text).toBe('Hi A & B <C>')
  })

  it('substitutes the same variables as the HTML renderer', () => {
    const text = renderPlaintextTemplate(
      'Hi {{player.displayName}} — code {{campaign.promoCode}}',
      sampleCtx,
    )
    expect(text).toBe('Hi Jane Doe — code SAVE10')
  })
})
