import { describe, expect, it } from 'vitest'

import { compile } from '../compiler'
import type { FilterTree } from '../filter-tree'

// Pure unit tests for the segment compiler (docs/11 §3.6). These verify that
// the SQL we generate is parameterised, joins the right rollup tables, and
// honours operator semantics.

const COUNT_OPTS = { mode: 'count' as const, excludeBlockedAndDeleted: false }
const FETCH_OPTS = { mode: 'fetch' as const, excludeBlockedAndDeleted: false }

describe('segment compiler', () => {
  it('compiles an empty AND tree to a benign WHERE clause', () => {
    const tree: FilterTree = { operator: 'AND', conditions: [] }
    const result = compile(tree, COUNT_OPTS)
    expect(result.sql).toContain('SELECT COUNT(DISTINCT p.id)')
    expect(result.sql).toContain('FROM players p')
    expect(result.params).toEqual([])
  })

  it('compiles a demographic state condition', () => {
    const tree: FilterTree = {
      operator: 'AND',
      conditions: [{ type: 'demographic', field: 'state', operator: '=', value: 'CA' }],
    }
    const result = compile(tree, COUNT_OPTS)
    expect(result.sql).toMatch(/p\.state = \$1/)
    expect(result.params).toEqual(['CA'])
  })

  it('joins tier_progress + tiers when filtering by tier_name', () => {
    const tree: FilterTree = {
      operator: 'AND',
      conditions: [{ type: 'demographic', field: 'tier_name', operator: '=', value: 'gold' }],
    }
    const result = compile(tree, COUNT_OPTS)
    expect(result.sql).toContain('LEFT JOIN tier_progress tp')
    expect(result.sql).toContain('LEFT JOIN tiers t')
    expect(result.sql).toMatch(/t\.slug = \$1/)
    expect(result.params).toEqual(['gold'])
  })

  it('joins lifetime_stats and uses comparison operators for behaviour fields', () => {
    const tree: FilterTree = {
      operator: 'AND',
      conditions: [{ type: 'behavior', field: 'total_deposited_usd', operator: '>=', value: 100 }],
    }
    const result = compile(tree, COUNT_OPTS)
    expect(result.sql).toContain('LEFT JOIN player_lifetime_stats pls')
    expect(result.sql).toMatch(/pls\.total_deposited_usd >= \$1/)
    expect(result.params).toEqual([100])
  })

  it('joins stats_30d for 30-day window fields', () => {
    const tree: FilterTree = {
      operator: 'AND',
      conditions: [{ type: 'behavior', field: 'wagered_sc_30d', operator: '>', value: 50 }],
    }
    const result = compile(tree, COUNT_OPTS)
    expect(result.sql).toContain('LEFT JOIN player_30d_stats p30')
    expect(result.sql).toMatch(/p30\.wagered_sc_30d > \$1/)
  })

  it('compiles AND of multiple conditions using parameter positions', () => {
    const tree: FilterTree = {
      operator: 'AND',
      conditions: [
        { type: 'demographic', field: 'tier_name', operator: '=', value: 'gold' },
        { type: 'behavior', field: 'last_7d_wagered', operator: '>', value: 100 },
      ],
    }
    const result = compile(tree, COUNT_OPTS)
    expect(result.params).toEqual(['gold', 100])
    expect(result.sql).toContain(' AND ')
    expect(result.sql).toMatch(/\$1/)
    expect(result.sql).toMatch(/\$2/)
  })

  it('compiles OR group with parens', () => {
    const tree: FilterTree = {
      operator: 'OR',
      conditions: [
        { type: 'demographic', field: 'state', operator: '=', value: 'CA' },
        { type: 'demographic', field: 'state', operator: '=', value: 'NY' },
      ],
    }
    const result = compile(tree, COUNT_OPTS)
    expect(result.sql).toContain(' OR ')
    expect(result.params).toEqual(['CA', 'NY'])
  })

  it('NOT inverts inner condition', () => {
    const tree: FilterTree = {
      operator: 'NOT',
      conditions: [{ type: 'demographic', field: 'state', operator: '=', value: 'CA' }],
    }
    const result = compile(tree, COUNT_OPTS)
    expect(result.sql).toMatch(/NOT \(/)
  })

  it('compiles between with two parameters', () => {
    const tree: FilterTree = {
      operator: 'AND',
      conditions: [
        { type: 'behavior', field: 'total_deposited_usd', operator: 'between', value: [50, 500] },
      ],
    }
    const result = compile(tree, COUNT_OPTS)
    expect(result.sql).toMatch(/BETWEEN \$1 AND \$2/)
    expect(result.params).toEqual([50, 500])
  })

  it('compiles in clause with placeholder list', () => {
    const tree: FilterTree = {
      operator: 'AND',
      conditions: [
        { type: 'demographic', field: 'state', operator: 'in', value: ['CA', 'NY', 'TX'] },
      ],
    }
    const result = compile(tree, COUNT_OPTS)
    expect(result.sql).toMatch(/IN \(\$1,\$2,\$3\)/)
    expect(result.params).toEqual(['CA', 'NY', 'TX'])
  })

  it('compiles bonus.has_active_bonus = true to EXISTS', () => {
    const tree: FilterTree = {
      operator: 'AND',
      conditions: [{ type: 'bonus', field: 'has_active_bonus', operator: '=', value: true }],
    }
    const result = compile(tree, COUNT_OPTS)
    expect(result.sql).toContain('EXISTS')
    expect(result.sql).toContain('bonuses_awarded')
  })

  it('compiles compliance.self_excluded with a temporal comparison', () => {
    const tree: FilterTree = {
      operator: 'AND',
      conditions: [{ type: 'compliance', field: 'self_excluded', operator: '=', value: true }],
    }
    const result = compile(tree, COUNT_OPTS)
    expect(result.sql).toMatch(/rg_self_excluded_until.*NOW\(\)/)
  })

  it('compiles within_last for behaviour timestamps', () => {
    const tree: FilterTree = {
      operator: 'AND',
      conditions: [
        {
          type: 'behavior',
          field: 'last_login_at',
          operator: 'within_last',
          value: 7,
          unit: 'days',
        },
      ],
    }
    const result = compile(tree, COUNT_OPTS)
    expect(result.sql).toMatch(/p30\.last_login_at >= NOW\(\) - \$1 \* INTERVAL '1 days'/)
    expect(result.params).toEqual([7])
  })

  it('adds baseline filters when excludeBlockedAndDeleted is true (default)', () => {
    const tree: FilterTree = { operator: 'AND', conditions: [] }
    const result = compile(tree, { mode: 'count' })
    expect(result.sql).toContain('p.deleted_at IS NULL')
    expect(result.sql).toContain("p.status = 'active'")
    expect(result.sql).toContain('p.is_internal_account = false')
  })

  it('omits baseline filters when excludeBlockedAndDeleted is false', () => {
    const tree: FilterTree = { operator: 'AND', conditions: [] }
    const result = compile(tree, { mode: 'count', excludeBlockedAndDeleted: false })
    expect(result.sql).not.toContain('p.deleted_at IS NULL')
  })

  it('emits SELECT p.id ORDER BY in fetch mode and applies LIMIT/OFFSET', () => {
    const tree: FilterTree = { operator: 'AND', conditions: [] }
    const result = compile(tree, { ...FETCH_OPTS, limit: 10, offset: 20 })
    expect(result.sql).toContain('SELECT p.id')
    expect(result.sql).toContain('ORDER BY p.id')
    expect(result.sql).toMatch(/LIMIT \$\d+/)
    expect(result.sql).toMatch(/OFFSET \$\d+/)
    expect(result.params.slice(-2)).toEqual([10, 20])
  })

  it('parameterises every literal — no string interpolation', () => {
    const tree: FilterTree = {
      operator: 'AND',
      conditions: [
        { type: 'demographic', field: 'state', operator: '=', value: "CA' OR 1=1 --" },
        { type: 'behavior', field: 'total_deposited_usd', operator: '>', value: 1234 },
      ],
    }
    const result = compile(tree, COUNT_OPTS)
    expect(result.sql).not.toContain('OR 1=1')
    expect(result.params).toEqual(["CA' OR 1=1 --", 1234])
  })
})
