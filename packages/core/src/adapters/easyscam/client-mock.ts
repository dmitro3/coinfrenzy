import type { EasyScamClient, EasyScamEntry } from './types'

// Mock EasyScam per the founder's prompt-06 addendum:
//   "poll job runs but returns empty results"
//
// Tests can stash entries via `_seedMockEasyScamEntries` so we can prove
// the AMOE bonus path end-to-end without a live EasyScam connection.

let SEEDED: EasyScamEntry[] = []

export class MockEasyScamClient implements EasyScamClient {
  readonly mode = 'mock' as const

  async fetchNewEntries(input: {
    sinceCursor?: string | null
    limit?: number
  }): Promise<{ entries: EasyScamEntry[]; nextCursor: string | null }> {
    if (SEEDED.length === 0) {
      return { entries: [], nextCursor: null }
    }
    const limit = input.limit ?? 50
    const slice = SEEDED.slice(0, limit)
    SEEDED = SEEDED.slice(limit)
    return { entries: slice, nextCursor: SEEDED.length > 0 ? 'next' : null }
  }
}

export function _seedMockEasyScamEntries(entries: EasyScamEntry[]): void {
  SEEDED = entries
}

export function _resetMockEasyScamEntries(): void {
  SEEDED = []
}
