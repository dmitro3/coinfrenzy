// docs/05 §7.2 — Twilio adapter surface.

export interface SendSmsInput {
  to: string
  body: string
  /** Optional template id — recorded in crm_message_log. */
  templateId?: string
}

export interface SendSmsResult {
  status: 'sent' | 'logged' | 'failed'
  provider: 'twilio' | 'console'
  messageSid: string | null
}

export interface TwilioClient {
  sendSms(input: SendSmsInput): Promise<SendSmsResult>
  readonly mode: 'mock' | 'real'
}
