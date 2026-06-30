// docs/05 §6 — Radar adapter surface.

export interface RadarGeoResult {
  ip: string
  country: string | null
  state: string | null
  city: string | null
  postalCode: string | null
  isProxy: boolean
  isVpn: boolean
  isMocked: boolean
  isInaccurate: boolean
  isCompromised?: boolean
  raw?: unknown
}

export interface RadarTrackInput {
  playerId: string
  ip?: string | null
  deviceId?: string | null
  userAgent?: string | null
  /** Free-form metadata; we set `action` so we can filter the Radar event feed. */
  metadata?: Record<string, string>
}

export interface RadarTrackResult {
  isProxy: boolean
  isMocked: boolean
  isCompromised: boolean
  isJumped: boolean
  isInaccurate: boolean
  raw?: unknown
}

export interface RadarClient {
  /** Returns the player state from request IP, or `state: null` if Radar
   *  cannot determine it. */
  geocodeIp(input: {
    ip: string | null | undefined
    fallbackState?: string | null
  }): Promise<RadarGeoResult>
  /** docs/05 §6.3 — track API for fraud signals. */
  track(input: RadarTrackInput): Promise<RadarTrackResult>
  readonly mode: 'mock' | 'real'
}
