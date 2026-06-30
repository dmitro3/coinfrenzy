import { isMockEnabled } from '@coinfrenzy/config'

import { MockRadarClient } from './client-mock'
import { RealRadarClient } from './client-real'
import type { RadarClient, RadarGeoResult } from './types'

export function getRadarClient(): RadarClient {
  return isMockEnabled('radar') ? new MockRadarClient() : new RealRadarClient()
}

export type { RadarClient, RadarGeoResult, RadarTrackInput, RadarTrackResult } from './types'
export { MockRadarClient } from './client-mock'
export { RealRadarClient } from './client-real'

// Legacy shim — `resolveIp` was the prompt-05 stub. Internally it now
// delegates to the real adapter factory but still returns the shape the
// signup route expects (with `stubbed` flag).
export async function resolveIp(
  ip: string | null | undefined,
): Promise<RadarGeoResult & { stubbed: boolean }> {
  const client = getRadarClient()
  const result = await client.geocodeIp({ ip, fallbackState: null })
  return { ...result, stubbed: client.mode === 'mock' }
}
