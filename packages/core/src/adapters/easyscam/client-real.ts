import { env } from '@coinfrenzy/config'

import type { EasyScamClient, EasyScamEntry } from './types'

export class RealEasyScamClient implements EasyScamClient {
  readonly mode = 'real' as const

  async fetchNewEntries(input: {
    sinceCursor?: string | null
    limit?: number
  }): Promise<{ entries: EasyScamEntry[]; nextCursor: string | null }> {
    const e = env()
    if (!e.EASYSCAM_API_BASE || !e.EASYSCAM_API_KEY) {
      throw new Error('EASYSCAM credentials not configured')
    }
    const params = new URLSearchParams()
    if (input.sinceCursor) params.set('cursor', input.sinceCursor)
    params.set('limit', String(input.limit ?? 50))

    const res = await fetch(`${e.EASYSCAM_API_BASE}/entries?${params.toString()}`, {
      headers: { Authorization: `Bearer ${e.EASYSCAM_API_KEY}` },
    })
    if (!res.ok) throw new Error(`easyscam_request_failed:${res.status}`)
    const json = (await res.json()) as {
      entries: Array<{
        id: string
        identifier: string
        postmarked_at: string
        staff_note?: string
      }>
      next_cursor?: string
    }
    return {
      entries: json.entries.map((row) => ({
        externalId: row.id,
        identifier: row.identifier,
        postmarkedAt: row.postmarked_at,
        staffNote: row.staff_note ?? null,
      })),
      nextCursor: json.next_cursor ?? null,
    }
  }
}
