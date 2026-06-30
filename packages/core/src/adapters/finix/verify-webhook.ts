import { createHmac, timingSafeEqual } from 'node:crypto'

import { env, isMockEnabled } from '@coinfrenzy/config'

import type { VerifyResult } from '../../webhooks/types'

// docs/05 §3.2 — HMAC-SHA256 over the raw body, hex-encoded, in the
// `finix-signature` (or legacy `x-finix-signature`) header.

const MOCK_SIGNATURE = 'mock'

export async function verifyFinixWebhook(
  rawBody: string,
  headers: Record<string, string>,
): Promise<VerifyResult> {
  const signature = headers['finix-signature'] ?? headers['x-finix-signature']
  if (!signature) return { ok: false, error: 'missing_signature_header' }

  // Mock mode: only accept signatures of the form `mock=<hmac>` signed with
  // a fixed shared secret so the mock-vendor pages can loop back through
  // the real receiver code path. Real Finix events would not match this
  // prefix, so even in mock mode an attacker can't impersonate a real
  // Finix event.
  if (isMockEnabled('finix') && signature.startsWith(`${MOCK_SIGNATURE}=`)) {
    const expected = createHmac('sha256', mockSecret()).update(rawBody).digest('hex')
    const provided = signature.slice(MOCK_SIGNATURE.length + 1)
    return timingSafeCompare(provided, expected)
      ? { ok: true }
      : { ok: false, error: 'mock_signature_mismatch' }
  }

  const secret = env().FINIX_WEBHOOK_SECRET
  if (!secret) return { ok: false, error: 'webhook_secret_unset' }

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  return timingSafeCompare(signature, expected)
    ? { ok: true }
    : { ok: false, error: 'signature_mismatch' }
}

export function signMockFinixBody(rawBody: string): string {
  const sig = createHmac('sha256', mockSecret()).update(rawBody).digest('hex')
  return `${MOCK_SIGNATURE}=${sig}`
}

export function extractFinixIdempotencyKey(rawBody: string): string {
  const body = JSON.parse(rawBody) as { id?: string }
  if (!body.id) throw new Error('finix_event_missing_id')
  return body.id
}

export function extractFinixEventType(rawBody: string): string {
  const body = JSON.parse(rawBody) as { type?: string }
  return body.type ?? 'unknown'
}

function mockSecret(): string {
  // Stable per-process so mock pages and the receiver agree. We deliberately
  // keep this short + obviously-mock so it never accidentally validates a
  // real signed payload in production.
  return 'coinfrenzy-mock-finix-secret'
}

function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  } catch {
    return false
  }
}
