import { env } from '@coinfrenzy/config'

import type { RadarClient, RadarGeoResult, RadarTrackInput, RadarTrackResult } from './types'

// docs/05 §6.2-§6.3 — Radar REST endpoints. Auth via the secret key (server
// side); the publishable key is for the browser SDK and is intentionally
// unused here.

const RADAR_API_BASE = 'https://api.radar.io'

export class RealRadarClient implements RadarClient {
  readonly mode = 'real' as const

  async geocodeIp(input: {
    ip: string | null | undefined
    fallbackState?: string | null
  }): Promise<RadarGeoResult> {
    const ip = input.ip ?? '0.0.0.0'
    const e = env()
    if (!e.RADAR_API_KEY) {
      // Degraded mode: don't block all signups when Radar key isn't set.
      return {
        ip,
        country: null,
        state: input.fallbackState ?? null,
        city: null,
        postalCode: null,
        isProxy: false,
        isVpn: false,
        isMocked: false,
        isInaccurate: false,
      }
    }
    try {
      const res = await fetch(`${RADAR_API_BASE}/v1/geocode/ip?ip=${encodeURIComponent(ip)}`, {
        headers: { Authorization: e.RADAR_API_KEY },
      })
      if (!res.ok) throw new Error(`radar_status_${res.status}`)
      const json = (await res.json()) as {
        address?: { stateCode?: string; countryCode?: string; city?: string; postalCode?: string }
        proxy?: boolean
        ip?: { proxy?: boolean }
      }
      return {
        ip,
        country: json.address?.countryCode ?? null,
        state: json.address?.stateCode ?? null,
        city: json.address?.city ?? null,
        postalCode: json.address?.postalCode ?? null,
        isProxy: Boolean(json.proxy ?? json.ip?.proxy),
        isVpn: false,
        isMocked: false,
        isInaccurate: false,
        raw: json,
      }
    } catch (e) {
      console.warn('[radar] geocode failed, degraded fallback', {
        ip,
        error: e instanceof Error ? e.message : String(e),
      })
      return {
        ip,
        country: null,
        state: input.fallbackState ?? null,
        city: null,
        postalCode: null,
        isProxy: false,
        isVpn: false,
        isMocked: false,
        isInaccurate: false,
      }
    }
  }

  async track(input: RadarTrackInput): Promise<RadarTrackResult> {
    const e = env()
    if (!e.RADAR_API_KEY) {
      return {
        isProxy: false,
        isMocked: false,
        isCompromised: false,
        isJumped: false,
        isInaccurate: false,
      }
    }
    const res = await fetch(`${RADAR_API_BASE}/v1/track`, {
      method: 'POST',
      headers: { Authorization: e.RADAR_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: input.playerId,
        deviceId: input.deviceId ?? undefined,
        ip: input.ip ?? undefined,
        userAgent: input.userAgent ?? undefined,
        metadata: input.metadata ?? undefined,
      }),
    })
    if (!res.ok) {
      return {
        isProxy: false,
        isMocked: false,
        isCompromised: false,
        isJumped: false,
        isInaccurate: false,
      }
    }
    const json = (await res.json()) as { fraud?: Record<string, boolean> }
    const f = json.fraud ?? {}
    return {
      isProxy: Boolean(f.proxy),
      isMocked: Boolean(f.mocked),
      isCompromised: Boolean(f.compromised),
      isJumped: Boolean(f.jumped),
      isInaccurate: Boolean(f.inaccurate),
      raw: json,
    }
  }
}
