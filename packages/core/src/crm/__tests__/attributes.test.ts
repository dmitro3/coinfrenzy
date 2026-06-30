import { describe, expect, it } from 'vitest'

import {
  ATTRIBUTE_REGISTRY,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  getAttribute,
  getAttributesByCategory,
} from '../attributes'

// Sanity checks on the M3 attribute registry — every attribute must have
// the right metadata shape and no two share the same key.

describe('attribute registry', () => {
  it('declares more than 50 attributes', () => {
    expect(ATTRIBUTE_REGISTRY.length).toBeGreaterThan(50)
  })

  it('has unique keys', () => {
    const seen = new Set<string>()
    for (const def of ATTRIBUTE_REGISTRY) {
      expect(seen.has(def.key)).toBe(false)
      seen.add(def.key)
    }
  })

  it('every attribute has at least one operator', () => {
    for (const def of ATTRIBUTE_REGISTRY) {
      expect(def.operators.length).toBeGreaterThan(0)
    }
  })

  it('every attribute resolves via getAttribute()', () => {
    for (const def of ATTRIBUTE_REGISTRY) {
      const resolved = getAttribute(def.key)
      expect(resolved).not.toBeNull()
      expect(resolved!.key).toBe(def.key)
    }
  })

  it('every attribute belongs to a category in the public order', () => {
    for (const def of ATTRIBUTE_REGISTRY) {
      expect(CATEGORY_ORDER).toContain(def.category)
      expect(CATEGORY_LABELS[def.category]).toBeTruthy()
    }
  })

  it('groups attributes by category', () => {
    const grouped = getAttributesByCategory()
    let total = 0
    for (const c of CATEGORY_ORDER) {
      total += (grouped[c] ?? []).length
    }
    expect(total).toBe(ATTRIBUTE_REGISTRY.length)
  })

  it('boolean attributes only declare boolean operators', () => {
    for (const def of ATTRIBUTE_REGISTRY) {
      if (def.valueType === 'boolean') {
        for (const op of def.operators) {
          expect(['is_true', 'is_false']).toContain(op)
        }
      }
    }
  })

  it('predicate sources only attach to boolean valueType (or are picker types)', () => {
    for (const def of ATTRIBUTE_REGISTRY) {
      if (def.source.kind === 'predicate') {
        expect(def.valueType).toBe('boolean')
      }
      if (def.source.kind === 'predicate_param') {
        expect(['game', 'provider', 'category']).toContain(def.valueType)
      }
    }
  })

  it('returns null for unknown keys', () => {
    expect(getAttribute('definitely-not-a-real-attribute')).toBeNull()
  })
})
