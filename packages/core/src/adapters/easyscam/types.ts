// docs/06 §11 — EasyScam adapter surface (poll-based, no webhooks).

export interface EasyScamEntry {
  externalId: string
  /** The email or phone we use to attribute the entry to a player. */
  identifier: string
  /** Postmark date — used to validate the 14-day window per the rules. */
  postmarkedAt: string
  /** Free-form note from EasyScam's review staff. */
  staffNote?: string | null
}

export interface EasyScamClient {
  fetchNewEntries(input: { sinceCursor?: string | null; limit?: number }): Promise<{
    entries: EasyScamEntry[]
    nextCursor: string | null
  }>
  readonly mode: 'mock' | 'real'
}
