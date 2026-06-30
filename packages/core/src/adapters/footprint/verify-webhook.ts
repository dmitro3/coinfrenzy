import { createHmac, timingSafeEqual } from 'node:crypto'

import { env, isMockEnabled } from '@coinfrenzy/config'

import type { VerifyResult } from '../../webhooks/types'

// docs/05 §4.2 — Footprint signs via Svix. Svix uses HMAC-SHA256 with a
// base64-encoded shared secret over `${svix-id}.${svix-timestamp}.${body}`,
// and supports rotation by sending multiple `v1,<sig>` pairs in
// `svix-signature` separated by spaces. We implement the verifier inline
// (no `svix` npm dep) to keep the adapter surface flat.

const MOCK_PREFIX = 'mock'

export async function verifyFootprintWebhook(
  rawBody: string,
  headers: Record<string, string>,
): Promise<VerifyResult> {
  const svixId = headers['svix-id']
  const svixTimestamp = headers['svix-timestamp']
  const svixSignature = headers['svix-signature']

  if (!svixId || !svixTimestamp || !svixSignature) {
    return { ok: false, error: 'missing_svix_headers' }
  }

  // Replay protection — reject events older than 5 minutes.
  const ts = Number.parseInt(svixTimestamp, 10)
  if (!Number.isFinite(ts)) return { ok: false, error: 'invalid_timestamp' }
  const skewMs = Math.abs(Date.now() - ts * 1000)
  if (skewMs > 5 * 60 * 1000) return { ok: false, error: 'stale_timestamp' }

  const signedPayload = `${svixId}.${svixTimestamp}.${rawBody}`

  if (isMockEnabled('footprint') && svixSignature.startsWith(`${MOCK_PREFIX},`)) {
    const provided = svixSignature.split(',')[1] ?? ''
    const expected = createHmac('sha256', mockSecret()).update(signedPayload).digest('base64')
    return constantTimeStringEq(provided, expected)
      ? { ok: true }
      : { ok: false, error: 'mock_signature_mismatch' }
  }

  const secret = env().FOOTPRINT_WEBHOOK_SECRET
  if (!secret) return { ok: false, error: 'webhook_secret_unset' }
  const secretBytes = parseSvixSecret(secret)

  // svix-signature: space-separated pairs of "v1,<base64sig>"
  const parts = svixSignature.split(' ').filter(Boolean)
  for (const part of parts) {
    const [version, provided] = part.split(',')
    if (version !== 'v1' || !provided) continue
    const expected = createHmac('sha256', secretBytes).update(signedPayload).digest('base64')
    if (constantTimeStringEq(provided, expected)) return { ok: true }
  }
  return { ok: false, error: 'signature_mismatch' }
}

export function signMockFootprintBody(
  svixId: string,
  svixTimestamp: string,
  rawBody: string,
): string {
  const signedPayload = `${svixId}.${svixTimestamp}.${rawBody}`
  const sig = createHmac('sha256', mockSecret()).update(signedPayload).digest('base64')
  return `${MOCK_PREFIX},${sig}`
}

export function extractFootprintIdempotencyKey(
  _rawBody: string,
  headers: Record<string, string>,
): string {
  const svixId = headers['svix-id']
  if (!svixId) throw new Error('svix_id_missing')
  return svixId
}

export function extractFootprintEventType(rawBody: string): string {
  const body = JSON.parse(rawBody) as { type?: string }
  return body.type ?? 'unknown'
}

function mockSecret(): Buffer {
  return Buffer.from('coinfrenzy-mock-footprint-secret')
}

function parseSvixSecret(secret: string): Buffer {
  // Svix secrets are prefixed `whsec_<base64>`; we accept either form.
  const value = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret
  try {
    return Buffer.from(value, 'base64')
  } catch {
    return Buffer.from(value)
  }
}

function constantTimeStringEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
  } catch {
    return false
  }
}
