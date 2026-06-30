import { env } from '@coinfrenzy/config'

import type { SendSmsInput, SendSmsResult, TwilioClient } from './types'

// docs/05 §7.2 — Twilio /Messages.json via HTTP basic auth.

export class RealTwilioClient implements TwilioClient {
  readonly mode = 'real' as const

  async sendSms(input: SendSmsInput): Promise<SendSmsResult> {
    const e = env()
    if (!e.TWILIO_ACCOUNT_SID || !e.TWILIO_AUTH_TOKEN) {
      return { status: 'failed', provider: 'twilio', messageSid: null }
    }
    if (!e.TWILIO_FROM_NUMBER) {
      return { status: 'failed', provider: 'twilio', messageSid: null }
    }
    const auth = Buffer.from(`${e.TWILIO_ACCOUNT_SID}:${e.TWILIO_AUTH_TOKEN}`).toString('base64')

    const body = new URLSearchParams({
      To: input.to,
      Body: input.body,
      From: e.TWILIO_FROM_NUMBER,
    })
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
        e.TWILIO_ACCOUNT_SID,
      )}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      },
    )
    if (!res.ok) {
      return { status: 'failed', provider: 'twilio', messageSid: null }
    }
    const json = (await res.json()) as { sid?: string }
    return { status: 'sent', provider: 'twilio', messageSid: json.sid ?? null }
  }
}
