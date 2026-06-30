import type { CoinCurrency } from '@coinfrenzy/config'

// docs/05 §5 — Alea adapter surface.

export interface AleaCreateSessionInput {
  /** Our game_sessions.id — Alea echoes this on every round webhook. */
  casinoSessionId: string
  playerId: string
  /** Alea's externalId for the game. Stored on games.external_id. */
  externalGameId: string
  currency: CoinCurrency
  /** Player balance in minor units (used by some games for over-bet preview). */
  balanceMinor: bigint
  locale?: string
  returnUrl?: string
}

export interface AleaCreateSessionResult {
  /** Session token Alea returns; we store it on game_sessions.alea_session_token. */
  sessionToken: string
  /** URL to load in an iframe; some Alea games inject this directly. */
  playUrl: string
}

export interface AleaListGamesInput {
  /** Sandbox mode returns only `gamesAvailable` per founder's notes. */
  mode: 'sandbox' | 'production'
  limit?: number
}

export interface AleaGameSummary {
  externalId: string
  slug: string
  displayName: string
  providerSlug: string
  providerDisplayName?: string
  category: string
  thumbnailUrl: string | null
  bannerUrl: string | null
  rtp: number | null
  volatility: string | null
  /** Currency availability. Defaults: true / true. SC-restricted games (e.g.
   *  some operator-specific Sweeps rooms) set the corresponding flag to false. */
  availableInGc?: boolean
  availableInSc?: boolean
  isFeatured?: boolean
  isNew?: boolean
}

// docs/04 §7.2 — round-history pull for the nightly reconciliation cron.
//
// Alea exposes a "rounds" endpoint that returns every round (bet, win, or
// refund) within a [from, to] window. We surface only the fields we need
// to diff against game_rounds. The real adapter pages internally; the
// caller sees a flat list.
export interface AleaListRoundsInput {
  /** Inclusive lower bound, UTC. */
  from: Date
  /** Exclusive upper bound, UTC. */
  to: Date
  /** Optional currency filter — defaults to both. */
  currency?: 'GC' | 'SC'
  /** Optional cap for tests / sampling. */
  limit?: number
}

export interface AleaRoundSummary {
  externalRoundId: string
  casinoSessionId: string
  externalGameId: string
  /** Alea's player id — equal to our players.id since we use uuid stably. */
  playerId: string
  currency: 'GC' | 'SC'
  /** Minor units. */
  betAmountMinor: bigint
  /** Minor units. 0 if the round resolved as a loss. */
  winAmountMinor: bigint
  /** Alea's status code, mapped to our domain set. */
  status: 'bet_placed' | 'resolved' | 'refunded'
  betAt: Date
  wonAt: Date | null
}

export interface AleaLaunchGameInput {
  casinoSessionId: string
  providerId: string
  playerId: string
  externalGameId: string
  isMobile: boolean
  currency: CoinCurrency
  balanceMinor: bigint
  locale?: string
  returnUrl?: string
}

export interface AleaClient {
  createSession(input: AleaCreateSessionInput): Promise<AleaCreateSessionResult>
  launchGame(input: AleaLaunchGameInput): Promise<AleaCreateSessionResult>
  listGames(input: AleaListGamesInput): Promise<AleaGameSummary[]>
  /** docs/04 §7.2 — used by the nightly reconciliation cron. */
  listRounds(input: AleaListRoundsInput): Promise<AleaRoundSummary[]>
  readonly mode: 'mock' | 'real'
}
