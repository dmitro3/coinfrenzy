import type { RadarClient, RadarGeoResult, RadarTrackInput, RadarTrackResult } from './types'

// Mock Radar per the founder's prompt-06 addendum:
//   "geo lookup returns the player's state from their signup record; no
//    fraud flags"
//
// We don't have a player_id at IP-geocode time during signup (the player
// row doesn't exist yet), so the caller passes `fallbackState` from the
// signup form. Track calls always return clean signals.

export class MockRadarClient implements RadarClient {
  readonly mode = 'mock' as const

  async geocodeIp(input: {
    ip: string | null | undefined
    fallbackState?: string | null
  }): Promise<RadarGeoResult> {
    return {
      ip: input.ip ?? '0.0.0.0',
      country: 'US',
      state: input.fallbackState ?? null,
      city: null,
      postalCode: null,
      isProxy: false,
      isVpn: false,
      isMocked: false,
      isInaccurate: false,
    }
  }

  async track(_input: RadarTrackInput): Promise<RadarTrackResult> {
    return {
      isProxy: false,
      isMocked: false,
      isCompromised: false,
      isJumped: false,
      isInaccurate: false,
    }
  }
}
