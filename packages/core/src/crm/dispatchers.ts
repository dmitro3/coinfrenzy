// docs/11 §4.4 — provider dispatchers (SendGrid, Twilio, in-app).
//
// The campaign sender + flow runner both call these. We isolate the
// vendor SDK initialisation here so the rest of the codebase stays
// vendor-neutral and tests can swap with a `null` dispatcher.

import { env } from '@coinfrenzy/config'

export interface EmailSendInput {
  to: string
  from: string
  replyTo?: string | null
  subject: string
  html: string
  text?: string | null
  trackingId?: string
}

export interface SmsSendInput {
  to: string
  body: string
  from?: string
  trackingId?: string
}

export interface DispatchResult {
  ok: boolean
  providerMessageId?: string
  error?: string
}

type SendGridLib = {
  setApiKey: (k: string) => void
  send: (m: unknown) => Promise<unknown>
}

type TwilioCtor = (sid: string, token: string) => TwilioClient
type TwilioClient = {
  messages: {
    create: (input: { to: string; from: string; body: string }) => Promise<{ sid: string }>
  }
}

let sendGridClient: { send: (msg: unknown) => Promise<unknown> } | null = null
let sendGridReady = false

async function getSendGrid(): Promise<{ send: (msg: unknown) => Promise<unknown> } | null> {
  if (sendGridReady) return sendGridClient
  sendGridReady = true
  const key = env().SENDGRID_API_KEY
  if (!key) return null
  const mod = (await import('@sendgrid/mail')) as unknown as { default?: SendGridLib } & SendGridLib
  const lib = (mod.default ?? mod) as SendGridLib
  lib.setApiKey(key)
  sendGridClient = { send: lib.send.bind(lib) }
  return sendGridClient
}

let twilioClient: TwilioClient | null = null
let twilioReady = false

async function getTwilio(): Promise<TwilioClient | null> {
  if (twilioReady) return twilioClient
  twilioReady = true
  const e = env()
  if (!e.TWILIO_ACCOUNT_SID || !e.TWILIO_AUTH_TOKEN) return null
  const mod = (await import('twilio')) as unknown as { default?: TwilioCtor } & {
    (sid: string, token: string): TwilioClient
  }
  const ctor = (mod.default ?? mod) as TwilioCtor
  twilioClient = ctor(e.TWILIO_ACCOUNT_SID, e.TWILIO_AUTH_TOKEN)
  return twilioClient
}

export async function dispatchEmail(input: EmailSendInput): Promise<DispatchResult> {
  const client = await getSendGrid()
  if (!client) {
    // No-op in dev/test — return a fake id so the caller still tracks state.
    return { ok: true, providerMessageId: `dev-${Date.now()}` }
  }
  try {
    type SendResponse = Array<{ headers?: Record<string, string> }>
    const response = (await client.send({
      to: input.to,
      from: input.from,
      replyTo: input.replyTo ?? undefined,
      subject: input.subject,
      html: input.html,
      text: input.text ?? undefined,
      customArgs: input.trackingId ? { tracking_id: input.trackingId } : undefined,
    })) as SendResponse
    const messageId = response[0]?.headers?.['x-message-id']
    return { ok: true, providerMessageId: messageId }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function dispatchSms(input: SmsSendInput): Promise<DispatchResult> {
  const client = await getTwilio()
  if (!client) {
    return { ok: true, providerMessageId: `dev-${Date.now()}` }
  }
  try {
    const from = input.from ?? env().TWILIO_FROM_NUMBER ?? ''
    if (!from) return { ok: false, error: 'twilio_from_number_unset' }
    const msg = await client.messages.create({
      to: input.to,
      from,
      body: input.body,
    })
    return { ok: true, providerMessageId: msg.sid }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
