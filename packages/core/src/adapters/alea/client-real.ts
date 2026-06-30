import { env } from '@coinfrenzy/config'

import type {
  AleaClient,
  AleaCreateSessionInput,
  AleaCreateSessionResult,
  AleaGameSummary,
  AleaLaunchGameInput,
  AleaListGamesInput,
  AleaListRoundsInput,
  AleaRoundSummary,
} from './types'
import { ALEA_PROVIDER_WITH_SEPARATE_ENVIRONMENT } from '../../apiconstants'

// docs/05 §5 — Alea REST surface. The base URL is set per-operator at
// `https://<operator-id>.aleaplay.com`; we read it from ALEA_API_BASE so a
// migration to a different operator id is one env change.

export class RealAleaClient implements AleaClient {
  readonly mode = 'real' as const

  async createSession(input: AleaCreateSessionInput): Promise<AleaCreateSessionResult> {
    const json = await this.request<{
      session_token: string
      play_url: string
    }>('POST', '/sessions', {
      casino_session_id: input.casinoSessionId,
      player_id: input.playerId,
      game_id: input.externalGameId,
      currency: input.currency,
      balance: Number(input.balanceMinor),
      locale: input.locale ?? 'en_US',
      return_url: input.returnUrl,
    })
    return { sessionToken: json.session_token, playUrl: json.play_url }
  }

  async launchGame(input: AleaLaunchGameInput): Promise<AleaCreateSessionResult> {
    // const json = await this.request<{
    //   session_token: string
    //   play_url: string
    // }>('POST', '/sessions', {
    //   casino_session_id: input.casinoSessionId,
    //   player_id: input.playerId,
    //   game_id: input.externalGameId,
    //   currency: input.currency,
    //   balance: Number(input.balanceMinor),
    //   locale: input.locale ?? 'en_US',
    //   return_url: input.returnUrl,
    // })

    const isProviderWithSeparateEnvironment = ALEA_PROVIDER_WITH_SEPARATE_ENVIRONMENT.includes(
      input.providerId,
    )
    // Use separate environment config for specific providers when using SC currency
    const environment_id =
      isProviderWithSeparateEnvironment && input.currency === 'SC'
        ? process.env.ALEA_CASINO_ENVIRONMENT_ID_2
        : process.env.ALEA_CASINO_ENVIRONMENT_ID_1

    const sessionId = input.casinoSessionId

    let gameUrl = `https://c21f969b5f03d33d-0.aleaplay.com/api/v1/games/${input.externalGameId}?casinoSessionId=${sessionId}&environmentId=${environment_id}&locale=en&device=${input.isMobile ? 'MOBILE' : 'DESKTOP'}&gameMode=${input.isMobile ? 'DEMO' : 'REAL'}&lobbyUrl=${input.returnUrl}&depositUrl=${input.returnUrl}`
    if (process.env.NODE_ENV === 'production') {
      gameUrl += `&isTest=true`
    }
    return { sessionToken: sessionId || '', playUrl: gameUrl || '' }
  }

  async listGames(input: AleaListGamesInput): Promise<AleaGameSummary[]> {
    const json = await this.request<{
      games: Array<{
        id: string
        slug: string
        display_name: string
        provider: string
        category: string
        thumbnail_url?: string
        banner_url?: string
        rtp?: number
        volatility?: string
      }>
    }>(
      'GET',
      input.mode === 'sandbox'
        ? `/gamesAvailable?limit=${input.limit ?? 200}`
        : `/games?limit=${input.limit ?? 500}`,
    )
    return json.games.map((g) => ({
      externalId: g.id,
      slug: g.slug,
      displayName: g.display_name,
      providerSlug: g.provider,
      category: g.category,
      thumbnailUrl: g.thumbnail_url ?? null,
      bannerUrl: g.banner_url ?? null,
      rtp: g.rtp ?? null,
      volatility: g.volatility ?? null,
    }))
  }

  async listRounds(input: AleaListRoundsInput): Promise<AleaRoundSummary[]> {
    // Alea's rounds endpoint pages with `cursor`. We exhaust the cursor
    // unless the caller passed a `limit`. Per-page size 200 is what
    // Alea's docs recommend for back-office tooling.
    const all: AleaRoundSummary[] = []
    let cursor: string | null = null
    const pageSize = 200
    const cap = input.limit ?? Number.MAX_SAFE_INTEGER
    while (all.length < cap) {
      const query: string[] = [
        `from=${encodeURIComponent(input.from.toISOString())}`,
        `to=${encodeURIComponent(input.to.toISOString())}`,
        `limit=${Math.min(pageSize, cap - all.length)}`,
      ]
      if (input.currency) query.push(`currency=${input.currency}`)
      if (cursor) query.push(`cursor=${encodeURIComponent(cursor)}`)
      const json = await this.request<{
        rounds: Array<{
          round_id: string
          session_id: string
          game_id: string
          player_id: string
          currency: 'GC' | 'SC'
          bet_amount: number
          win_amount: number
          status: string
          bet_at: string
          won_at: string | null
        }>
        next_cursor: string | null
      }>('GET', `/rounds?${query.join('&')}`)
      for (const r of json.rounds) {
        const status: AleaRoundSummary['status'] =
          r.status === 'refunded'
            ? 'refunded'
            : r.win_amount > 0 || r.won_at
              ? 'resolved'
              : 'bet_placed'
        all.push({
          externalRoundId: r.round_id,
          casinoSessionId: r.session_id,
          externalGameId: r.game_id,
          playerId: r.player_id,
          currency: r.currency,
          betAmountMinor: BigInt(Math.round(r.bet_amount)),
          winAmountMinor: BigInt(Math.round(r.win_amount)),
          status,
          betAt: new Date(r.bet_at),
          wonAt: r.won_at ? new Date(r.won_at) : null,
        })
        if (all.length >= cap) break
      }
      if (!json.next_cursor) break
      cursor = json.next_cursor
    }
    return all
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const e = env()
    if (!e.ALEA_API_BASE) throw new Error('ALEA_API_BASE is not set')
    if (!e.ALEA_API_KEY) throw new Error('ALEA_API_KEY is not set')
    const headers: Record<string, string> = {
      Authorization: `Bearer ${e.ALEA_API_KEY}`,
      Accept: 'application/json',
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json'

    const res = await fetch(`${e.ALEA_API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`alea_request_failed:${res.status}:${text.slice(0, 200)}`)
    return JSON.parse(text) as T
  }
}
