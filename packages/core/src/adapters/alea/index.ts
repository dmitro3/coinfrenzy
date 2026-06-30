import { isMockEnabled } from '@coinfrenzy/config'

import { MockAleaClient } from './client-mock'
import { RealAleaClient } from './client-real'
import type { AleaClient } from './types'

export function getAleaClient(): AleaClient {
  return isMockEnabled('alea') ? new MockAleaClient() : new RealAleaClient()
}

export type { AleaClient, AleaCreateSessionInput, AleaCreateSessionResult } from './types'
export type { AleaGameSummary, AleaListGamesInput } from './types'
export type { AleaListRoundsInput, AleaRoundSummary } from './types'

export {
  verifyAleaWebhook,
  verifyAleaDigestSignature,
  signMockAleaBody,
  extractAleaEventType,
  extractAleaIdempotencyKey,
} from './verify-webhook'

export {
  MockAleaClient,
  fireMockAleaRound,
  _MOCK_ALEA_GAMES,
  _stageMockAleaRounds,
  _resetMockAleaRounds,
} from './client-mock'
export type { FireMockRoundInput, FireMockRoundResult } from './client-mock'
export { RealAleaClient } from './client-real'
