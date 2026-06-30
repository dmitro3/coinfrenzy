import { randomUUID } from 'node:crypto'

import type { SendEmailInput, SendEmailResult, SendGridClient } from './types'

// Mock SendGrid per the founder's prompt-06 addendum:
//   "log emails to console (extending Prompt 5's stub)"
//
// We also keep an in-process recent-sends buffer so the admin Email Center
// page (prompt 09) can preview "what we would have sent" without a real
// SendGrid account.

interface RecentSend {
  id: string
  to: string
  subject: string
  category: string | null
  text: string
  sentAt: number
}

const RECENT: RecentSend[] = []
const MAX_RECENT = 50

export class MockSendGridClient implements SendGridClient {
  readonly mode = 'mock' as const

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const id = `msg_mock_${randomUUID().replace(/-/g, '').slice(0, 16)}`
    RECENT.unshift({
      id,
      to: input.to,
      subject: input.subject,
      category: input.category ?? null,
      text: input.text,
      sentAt: Date.now(),
    })
    if (RECENT.length > MAX_RECENT) RECENT.length = MAX_RECENT

    // eslint-disable-next-line no-console
    console.info('[sendgrid][mock]', {
      id,
      to: input.to,
      subject: input.subject,
      category: input.category,
      preview: input.text.slice(0, 200),
    })
    return { status: 'logged', provider: 'console', messageId: id }
  }
}

export function getMockSendGridRecent(): readonly RecentSend[] {
  return RECENT
}

export function _resetMockSendGridRecent(): void {
  RECENT.length = 0
}
