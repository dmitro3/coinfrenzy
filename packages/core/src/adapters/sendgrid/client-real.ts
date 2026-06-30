import { env } from '@coinfrenzy/config'

import type { SendEmailInput, SendEmailResult, SendGridClient } from './types'

// docs/11 §4 — Real SendGrid send. Uses v3 /mail/send. Returns the
// `X-Message-Id` header on success.

export class RealSendGridClient implements SendGridClient {
  readonly mode = 'real' as const

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const e = env()
    if (!e.SENDGRID_API_KEY || !e.SENDGRID_FROM_EMAIL) {
      return { status: 'failed', provider: 'sendgrid', messageId: null }
    }

    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${e.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: input.to }] }],
        from: { email: e.SENDGRID_FROM_EMAIL, name: 'CoinFrenzy' },
        subject: input.subject,
        content: [
          { type: 'text/plain', value: input.text },
          ...(input.html ? [{ type: 'text/html', value: input.html }] : []),
        ],
        categories: input.category ? [input.category] : undefined,
        custom_args: input.metadata,
      }),
    })

    if (!res.ok) {
      await res.text().catch(() => '')
      return { status: 'failed', provider: 'sendgrid', messageId: null }
    }
    return { status: 'sent', provider: 'sendgrid', messageId: res.headers.get('x-message-id') }
  }
}
