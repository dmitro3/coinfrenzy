import { createHmac, timingSafeEqual } from 'node:crypto'

import { env, isMockEnabled } from '@coinfrenzy/config'

import type { VerifyResult } from '../../webhooks/types'

// docs/05 §7.1 — SendGrid event webhook signature. SendGrid uses ECDSA
// over secp256k1 in their `X-Twilio-Email-Event-Webhook-Signature` header
// for new accounts; older accounts can also fall back to an HMAC-SHA256
// scheme. We implement HMAC-SHA256 over `${timestamp}.${rawBody}` to keep
// the verifier dep-free, with the assumption that the operator will
// configure the legacy HMAC mode in the SendGrid dashboard. Real prod
// rollout should swap to ECDSA before going live.

const MOCK_PREFIX = 'mock'

export async function verifySendGridWebhook(
  rawBody: string,
  headers: Record<string, string>,
): Promise<VerifyResult> {
  const signature =
    headers['x-twilio-email-event-webhook-signature'] ?? headers['x-sendgrid-signature']
  const timestamp =
    headers['x-twilio-email-event-webhook-timestamp'] ?? headers['x-sendgrid-timestamp']
  if (!signature || !timestamp) return { ok: false, error: 'missing_headers' }

  const signedPayload = `${timestamp}.${rawBody}`

  if (isMockEnabled('sendgrid') && signature.startsWith(`${MOCK_PREFIX}=`)) {
    const provided = signature.slice(MOCK_PREFIX.length + 1)
    const expected = createHmac('sha256', mockSecret()).update(signedPayload).digest('hex')
    return constantTime(provided, expected)
      ? { ok: true }
      : { ok: false, error: 'mock_signature_mismatch' }
  }

  const secret = env().SENDGRID_WEBHOOK_SECRET
  if (!secret) return { ok: false, error: 'webhook_secret_unset' }
  const expected = createHmac('sha256', secret).update(signedPayload).digest('hex')
  return constantTime(signature, expected)
    ? { ok: true }
    : { ok: false, error: 'signature_mismatch' }
}

export function signMockSendGridBody(rawBody: string): { signature: string; timestamp: string } {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signedPayload = `${timestamp}.${rawBody}`
  const sig = createHmac('sha256', mockSecret()).update(signedPayload).digest('hex')
  return { signature: `${MOCK_PREFIX}=${sig}`, timestamp }
}

export function extractSendGridIdempotencyKey(rawBody: string): string {
  // SendGrid posts an ARRAY of events per request. Use the first `sg_event_id`
  // (or fall back to hashing the body) so we treat the batch as one delivery.
  const events = JSON.parse(rawBody) as Array<{ sg_event_id?: string }>
  if (Array.isArray(events) && events[0]?.sg_event_id) return events[0].sg_event_id
  return createHmac('sha256', 'sendgrid_event_dedupe').update(rawBody).digest('hex').slice(0, 32)
}

export function extractSendGridEventType(): string {
  return 'sendgrid.event_batch'
}

function mockSecret(): string {
  return 'coinfrenzy-mock-sendgrid-secret'
}

function constantTime(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  } catch {
    return false
  }
}
