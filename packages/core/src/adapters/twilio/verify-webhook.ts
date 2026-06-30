import { createHmac, timingSafeEqual } from 'node:crypto'

import { env, isMockEnabled } from '@coinfrenzy/config'

import type { VerifyResult } from '../../webhooks/types'

// docs/05 §7.2 — Twilio webhook signature. Twilio actually uses HMAC-SHA1
// over `${full-url}${sortedFormFields}` in `X-Twilio-Signature`. We
// implement that signature scheme. The `url` argument is provided by the
// route handler.

const MOCK_PREFIX = 'mock'

export async function verifyTwilioWebhook(
  rawBody: string,
  headers: Record<string, string>,
  ctx: { url: string },
): Promise<VerifyResult> {
  const signature = headers['x-twilio-signature']
  if (!signature) return { ok: false, error: 'missing_signature_header' }

  // Mock branch — sign over the body alone so the test helper doesn't have
  // to know the exact URL the route resolves to.
  if (isMockEnabled('twilio') && signature.startsWith(`${MOCK_PREFIX}=`)) {
    const provided = signature.slice(MOCK_PREFIX.length + 1)
    const expected = createHmac('sha256', mockSecret()).update(rawBody).digest('hex')
    return constantTime(provided, expected)
      ? { ok: true }
      : { ok: false, error: 'mock_signature_mismatch' }
  }

  const e = env()
  const secret = e.TWILIO_AUTH_TOKEN ?? e.TWILIO_WEBHOOK_SECRET
  if (!secret) return { ok: false, error: 'webhook_secret_unset' }

  const params = new URLSearchParams(rawBody)
  const sorted: string[] = []
  for (const [key, value] of [...params.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    sorted.push(`${key}${value}`)
  }
  const signedPayload = `${ctx.url}${sorted.join('')}`
  // Twilio uses HMAC-SHA1 + base64 — match it.
  const expected = createHmac('sha1', secret).update(signedPayload).digest('base64')
  return constantTimeBase64(signature, expected)
    ? { ok: true }
    : { ok: false, error: 'signature_mismatch' }
}

export function signMockTwilioBody(rawBody: string): string {
  const sig = createHmac('sha256', mockSecret()).update(rawBody).digest('hex')
  return `${MOCK_PREFIX}=${sig}`
}

export function extractTwilioIdempotencyKey(rawBody: string): string {
  // Twilio inbound posts as `application/x-www-form-urlencoded`. The
  // `MessageSid` parameter is the dedupe key. For status webhooks we use
  // `SmsSid` as a fallback.
  const params = new URLSearchParams(rawBody)
  return params.get('MessageSid') ?? params.get('SmsSid') ?? `twilio_${Date.now()}`
}

export function extractTwilioEventType(rawBody: string): string {
  const params = new URLSearchParams(rawBody)
  if (params.get('Body') != null) return 'twilio.inbound'
  if (params.get('MessageStatus') != null) return `twilio.status.${params.get('MessageStatus')}`
  return 'twilio.unknown'
}

function mockSecret(): string {
  return 'coinfrenzy-mock-twilio-secret'
}

function constantTime(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  } catch {
    return false
  }
}

function constantTimeBase64(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}
