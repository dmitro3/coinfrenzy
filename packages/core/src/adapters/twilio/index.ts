import { isMockEnabled } from '@coinfrenzy/config'

import { MockTwilioClient } from './client-mock'
import { RealTwilioClient } from './client-real'
import type { TwilioClient } from './types'

export function getTwilioClient(): TwilioClient {
  return isMockEnabled('twilio') ? new MockTwilioClient() : new RealTwilioClient()
}

export type { TwilioClient, SendSmsInput, SendSmsResult } from './types'

export {
  verifyTwilioWebhook,
  signMockTwilioBody,
  extractTwilioEventType,
  extractTwilioIdempotencyKey,
} from './verify-webhook'

export { MockTwilioClient, getMockTwilioRecent, _resetMockTwilioRecent } from './client-mock'
export { RealTwilioClient } from './client-real'
