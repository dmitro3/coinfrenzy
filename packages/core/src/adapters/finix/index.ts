import { isMockEnabled } from '@coinfrenzy/config'

import { MockFinixClient } from './client-mock'
import { RealFinixClient } from './client-real'
import type { FinixClient } from './types'

// docs/02 §7 + docs/05 §3 — Finix adapter.
//
// The factory checks the USE_MOCK_FINIX flag at call time (NOT at import
// time) so the env can be flipped in tests without re-importing modules.
// Production behavior: USE_MOCK_FINIX=false in Doppler → RealFinixClient.

export function getFinixClient(): FinixClient {
  return isMockEnabled('finix') ? new MockFinixClient() : new RealFinixClient()
}

export type { FinixClient } from './types'
export type {
  FinixCreateTransferInput,
  FinixCreateTransferResult,
  FinixGetTransferResult,
  FinixCreatePayoutInput,
  FinixCreatePayoutResult,
} from './types'

export {
  verifyFinixWebhook,
  extractFinixEventType,
  extractFinixIdempotencyKey,
  signMockFinixBody,
} from './verify-webhook'

export {
  MockFinixClient,
  buildFinixTransferSucceededPayload,
  _resetMockFinixStore,
} from './client-mock'
export { RealFinixClient } from './client-real'
