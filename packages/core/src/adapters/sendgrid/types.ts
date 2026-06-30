// docs/05 §7.1 + docs/11 §4 — SendGrid adapter surface.

export interface SendEmailInput {
  to: string
  subject: string
  text: string
  html?: string
  category?: string
  /** Used by the marketing surface to bind a row in crm_message_log. */
  templateId?: string
  unsubscribeUrl?: string
  /** Test-only — passed through unchanged. */
  metadata?: Record<string, unknown>
}

export interface SendEmailResult {
  status: 'sent' | 'logged' | 'failed'
  provider: 'sendgrid' | 'console'
  messageId: string | null
}

export interface SendGridClient {
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>
  readonly mode: 'mock' | 'real'
}
