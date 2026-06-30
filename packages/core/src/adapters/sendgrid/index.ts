import { isMockEnabled } from '@coinfrenzy/config'

import { MockSendGridClient } from './client-mock'
import { RealSendGridClient } from './client-real'
import type { SendEmailInput, SendEmailResult, SendGridClient } from './types'

export function getSendGridClient(): SendGridClient {
  return isMockEnabled('sendgrid') ? new MockSendGridClient() : new RealSendGridClient()
}

export type { SendGridClient, SendEmailInput, SendEmailResult } from './types'

export {
  verifySendGridWebhook,
  signMockSendGridBody,
  extractSendGridEventType,
  extractSendGridIdempotencyKey,
} from './verify-webhook'

export { MockSendGridClient, getMockSendGridRecent, _resetMockSendGridRecent } from './client-mock'
export { RealSendGridClient } from './client-real'

// Legacy convenience export kept for prompt-05 callers. Internally delegates
// to the factory so behavior follows the env flag.
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  return getSendGridClient().sendEmail(input)
}
