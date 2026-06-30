import { describe, expect, it } from 'vitest'

import { compile } from '../compiler'
import type { FilterTree } from '../filter-tree'

const COUNT_OPTS = { mode: 'count' as const, excludeBlockedAndDeleted: false }
const FETCH_OPTS = { mode: 'fetch' as const, excludeBlockedAndDeleted: false }

// M3 — tests for the attribute-driven compiler path. These verify
// each operator family produces well-formed parameterised SQL and that
// the right joins are pulled in.

describe('attribute compiler', () => {
  it('compiles a simple equality on lifetime_spend_usd', () => {
    const tree: FilterTree = {
      operator: 'AND',
      conditions: [
        {
          type: 'attribute',
          attributeKey: 'lifetime_spend_usd',
          operator: '>',
          value: 1000,
        },
      ],
    }
    const r = compile(tree, COUNT_OPTS)
    expect(r.sql).toContain('LEFT JOIN player_lifetime_stats pls')
    expect(r.sql).toContain('pls.total_deposited_usd > $1::numeric')
    expect(r.params).toEqual([1000])
  })

  it('compiles a string contains operator with ILIKE escaping', () => {
    const tree: FilterTree = {
      operator: 'AND',
      conditions: [
        {
          type: 'attribute',
          attributeKey: 'email',
          operator: 'contains',
          value: 'gmail',
        },
      ],
    }
    const r = compile(tree, COUNT_OPTS)
    expect(r.sql).toMatch(/p\.email ILIKE \$1 ESCAPE/)
    expect(r.params).toEqual(['%gmail%'])
  })

  it('compiles a between operator with two params', () => {
    const tree: FilterTree = {
      operator: 'AND',
      conditions: [
        {
          type: 'attribute',
          attributeKey: 'lifetime_spend_usd',
          operator: 'between',
          value: [100, 500],
        },
      ],
    }
    const r = compile(tree, COUNT_OPTS)
    expect(r.sql).toContain('BETWEEN $1::numeric AND $2::numeric')
    expect(r.params).toEqual([100, 500])
  })

  it('compiles in_list with positional placeholders', () => {
    const tree: FilterTree = {
      operator: 'AND',
      conditions: [
        {
          type: 'attribute',
          attributeKey: 'signup_state',
          operator: 'in_list',
          value: ['FL', 'TX', 'NY'],
        },
      ],
    }
    const r = compile(tree, COUNT_OPTS)
    expect(r.sql).toContain('IN ($1,$2,$3)')
    expect(r.params).toEqual(['FL', 'TX', 'NY'])
  })

  it('compiles a boolean predicate (is_whale) without a parameter', () => {
    const tree: FilterTree = {
      operator: 'AND',
      conditions: [{ type: 'attribute', attributeKey: 'is_whale', operator: 'is_true' }],
    }
    const r = compile(tree, COUNT_OPTS)
    expect(r.sql).toContain('LEFT JOIN player_lifetime_stats pls')
    expect(r.sql).toContain('pls.total_deposited_usd > 10000')
    expect(r.params).toEqual([])
  })

  it('compiles is_false by negating the predicate', () => {
    const tree: FilterTree = {
      operator: 'AND',
      conditions: [{ type: 'attribute', attributeKey: 'is_whale', operator: 'is_false' }],
    }
    const r = compile(tree, COUNT_OPTS)
    expect(r.sql).toContain('NOT (')
    expect(r.params).toEqual([])
  })

  it('compiles a parameterized picker attribute (played_game)', () => {
    const gameId = '00000000-0000-0000-0000-000000000001'
    const tree: FilterTree = {
      operator: 'AND',
      conditions: [
        {
          type: 'attribute',
          attributeKey: 'played_game',
          operator: 'is_true',
          value: gameId,
        },
      ],
    }
    const r = compile(tree, COUNT_OPTS)
    expect(r.sql).toContain('EXISTS (SELECT 1 FROM player_game_stats pgs')
    expect(r.sql).toContain('pgs.game_id = $1::uuid')
    expect(r.params).toEqual([gameId])
  })

  it('compiles in_last_n_days into a relative interval', () => {
    const tree: FilterTree = {
      operator: 'AND',
      conditions: [
        {
          type: 'attribute',
          attributeKey: 'last_login_at',
          operator: 'in_last_n_days',
          value: 30,
        },
      ],
    }
    const r = compile(tree, COUNT_OPTS)
    expect(r.sql).toContain('NOW() - $1 * INTERVAL')
    expect(r.params).toEqual([30])
  })

  it('compiles is_set into IS NOT NULL', () => {
    const tree: FilterTree = {
      operator: 'AND',
      conditions: [{ type: 'attribute', attributeKey: 'kyc_verified_at', operator: 'is_set' }],
    }
    const r = compile(tree, COUNT_OPTS)
    expect(r.sql).toContain('p.kyc_verified_at IS NOT NULL')
  })

  it('handles nested AND/OR/NOT groups', () => {
    const tree: FilterTree = {
      operator: 'AND',
      conditions: [
        { type: 'attribute', attributeKey: 'is_whale', operator: 'is_true' },
        {
          operator: 'OR',
          conditions: [
            { type: 'attribute', attributeKey: 'signup_state', operator: '=', value: 'FL' },
            { type: 'attribute', attributeKey: 'signup_state', operator: '=', value: 'TX' },
          ],
        },
        {
          operator: 'NOT',
          conditions: [
            { type: 'attribute', attributeKey: 'self_exclusion_status', operator: 'is_true' },
          ],
        },
      ],
    }
    const r = compile(tree, COUNT_OPTS)
    expect(r.sql).toContain(' AND ')
    expect(r.sql).toContain(' OR ')
    expect(r.sql).toContain('NOT (')
  })

  it('returns FALSE for unknown attribute keys (fail-closed)', () => {
    const tree: FilterTree = {
      operator: 'AND',
      conditions: [
        { type: 'attribute', attributeKey: 'definitely_not_real', operator: '=', value: 1 },
      ],
    }
    const r = compile(tree, COUNT_OPTS)
    expect(r.sql).toContain('FALSE')
  })

  it('honours pagination when fetching ids', () => {
    const tree: FilterTree = { operator: 'AND', conditions: [] }
    const r = compile(tree, { ...FETCH_OPTS, limit: 10, offset: 20 })
    expect(r.sql).toContain('LIMIT $1')
    expect(r.sql).toContain('OFFSET $2')
    expect(r.params).toEqual([10, 20])
  })
})
