import { randomUUID } from 'node:crypto'

import type { SendSmsInput, SendSmsResult, TwilioClient } from './types'

// Mock Twilio per the founder's prompt-06 addendum: "log SMS to console."

interface RecentSms {
  sid: string
  to: string
  body: string
  sentAt: number
}

const RECENT: RecentSms[] = []
const MAX_RECENT = 50

export class MockTwilioClient implements TwilioClient {
  readonly mode = 'mock' as const

  async sendSms(input: SendSmsInput): Promise<SendSmsResult> {
    const sid = `SM_mock_${randomUUID().replace(/-/g, '').slice(0, 24)}`
    RECENT.unshift({ sid, to: input.to, body: input.body, sentAt: Date.now() })
    if (RECENT.length > MAX_RECENT) RECENT.length = MAX_RECENT
    // eslint-disable-next-line no-console
    console.info('[twilio][mock]', { sid, to: input.to, body: input.body })
    return { status: 'logged', provider: 'console', messageSid: sid }
  }
}

export function getMockTwilioRecent(): readonly RecentSms[] {
  return RECENT
}

export function _resetMockTwilioRecent(): void {
  RECENT.length = 0
}
