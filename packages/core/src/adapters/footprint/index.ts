import { isMockEnabled } from '@coinfrenzy/config'

import { MockFootprintClient } from './client-mock'
import { RealFootprintClient } from './client-real'
import type { FootprintClient } from './types'

export function getFootprintClient(): FootprintClient {
  return isMockEnabled('footprint') ? new MockFootprintClient() : new RealFootprintClient()
}

export type { FootprintClient } from './types'
export type {
  FootprintCreateOnboardingInput,
  FootprintCreateOnboardingResult,
  FootprintGetUserResult,
  FootprintUserStatus,
} from './types'

export {
  verifyFootprintWebhook,
  signMockFootprintBody,
  extractFootprintEventType,
  extractFootprintIdempotencyKey,
} from './verify-webhook'

export {
  MockFootprintClient,
  triggerMockFootprintWebhook,
  _resetMockFootprintStore,
  _seedMockFootprintUser,
} from './client-mock'
export { RealFootprintClient } from './client-real'

// Legacy stub still referenced by prompt-05 callers. Kept as a thin wrapper
// so we don't have to update those routes in this same change.
export async function createOnboardingSession(input: { playerId: string; email: string }): Promise<{
  footprintUserId: string
  validationToken: string
  url: string
  stubbed: boolean
}> {
  const session = await getFootprintClient().createOnboardingSession({
    playerId: input.playerId,
    email: input.email,
  })
  return {
    footprintUserId: session.footprintUserId,
    validationToken: session.validationToken,
    url: session.url,
    stubbed: isMockEnabled('footprint'),
  }
}
