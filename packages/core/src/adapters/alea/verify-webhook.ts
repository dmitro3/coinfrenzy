import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

import { env, isMockEnabled } from '@coinfrenzy/config'

import type { VerifyResult } from '../../webhooks/types'

// docs/05 §5.4 — Alea HMAC-SHA256 over `${timestamp}.${rawBody}`, hex
// encoded, in the `x-alea-signature` header. The exact header names should
// be confirmed against https://app.aleaplay.com/wikialea; this is our
// best-guess industry-standard pattern.

const MOCK_PREFIX = 'mock'

export async function verifyAleaWebhook(
  rawBody: string,
  headers: Record<string, string>,
): Promise<VerifyResult> {
  const signature = headers['x-alea-signature']
  const timestamp = headers['x-alea-timestamp']
  if (!signature || !timestamp) return { ok: false, error: 'missing_headers' }

  // 5-minute replay window
  const ts = Number.parseInt(timestamp, 10)
  if (!Number.isFinite(ts)) return { ok: false, error: 'invalid_timestamp' }
  const skewMs = Math.abs(Date.now() - ts)
  if (skewMs > 5 * 60 * 1000) return { ok: false, error: 'stale_timestamp' }

  const signedPayload = `${timestamp}.${rawBody}`

  if (isMockEnabled('alea') && signature.startsWith(`${MOCK_PREFIX}=`)) {
    const provided = signature.slice(MOCK_PREFIX.length + 1)
    const expected = createHmac('sha256', mockSecret()).update(signedPayload).digest('hex')
    return constantTime(provided, expected)
      ? { ok: true }
      : { ok: false, error: 'mock_signature_mismatch' }
  }

  const secret = env().ALEA_WEBHOOK_SECRET
  if (!secret) return { ok: false, error: 'webhook_secret_unset' }
  const expected = createHmac('sha256', secret).update(signedPayload).digest('hex')
  return constantTime(signature, expected)
    ? { ok: true }
    : { ok: false, error: 'signature_mismatch' }
}

export interface VerifyAleaDigestArgs {
  type: 'SESSION' | 'BALANCE' | 'TRANSACTION'
  signature?: string
  casinoSessionId?: string
  currency?: string
  gameId?: string
  integratorId?: string
  softwareId?: string
  rawBody?: string
}
// because we have different payload comes from session, balance and transaction creating this verifyAleaDigestSignature instead of using verifyAleaWebhook
export function verifyAleaDigestSignature(args: VerifyAleaDigestArgs): VerifyResult {
  // According to Alea docs, this should use the secretApiKey, not webhook secret
  const secret = env().ALEA_API_KEY
  if (!secret) return { ok: false, error: 'alea_api_key_unset' }
  if (!args.signature) return { ok: false, error: 'missing_signature' }

  let payloadToSign: string
  switch (args.type) {
    case 'SESSION': {
      if (!args.casinoSessionId) return { ok: false, error: 'missing_casino_session_id' }
      // According to Alea docs: SHA512(casinoSessionId + secretApiKey)
      payloadToSign = `${args.casinoSessionId}${secret}`
      break
    }
    case 'BALANCE': {
      if (
        !args.casinoSessionId ||
        !args.currency ||
        !args.gameId ||
        !args.integratorId ||
        !args.softwareId
      ) {
        return { ok: false, error: 'missing_balance_signature_fields' }
      }
      // According to Alea docs: SHA512(casinoSessionId + currency + gameId + integratorId + softwareId + secretApiKey)
      payloadToSign = `${args.casinoSessionId}${args.currency}${args.gameId}${args.integratorId}${args.softwareId}${secret}`
      break
    }
    case 'TRANSACTION': {
      if (!args.rawBody) return { ok: false, error: 'missing_raw_body' }
      // According to Alea docs: SHA512(JSON String of HTTP Body + secretApiKey)
      payloadToSign = `${args.rawBody.replace(/\s/g, '')}${secret}`
      break
    }
  }

  // According to Alea docs, the format is: SHA-512=<hash>
  const expected = `SHA-512=${createHash('sha512').update(payloadToSign).digest('hex')}`
  return constantTimeText(args.signature, expected)
    ? { ok: true }
    : { ok: false, error: 'signature_mismatch' }
}

export function signMockAleaBody(rawBody: string): { signature: string; timestamp: string } {
  const timestamp = String(Date.now())
  const signedPayload = `${timestamp}.${rawBody}`
  const sig = createHmac('sha256', mockSecret()).update(signedPayload).digest('hex')
  return { signature: `${MOCK_PREFIX}=${sig}`, timestamp }
}

export function extractAleaIdempotencyKey(rawBody: string): string {
  const body = JSON.parse(rawBody) as { id?: string; eventId?: string; roundId?: string }
  // Alea's payloads use `id` for envelope events. For round.bet/round.win
  // we fall back to roundId+eventType so a duplicate delivery of the same
  // bet is collapsed.
  if (body.id) return body.id
  if (body.eventId) return body.eventId
  if (body.roundId) {
    const eventType = (JSON.parse(rawBody) as { type?: string }).type ?? 'round'
    return `${eventType}:${body.roundId}`
  }
  throw new Error('alea_event_missing_id')
}

export function extractAleaEventType(rawBody: string): string {
  const body = JSON.parse(rawBody) as { type?: string; event?: string }
  return body.type ?? body.event ?? 'unknown'
}

function mockSecret(): string {
  return 'coinfrenzy-mock-alea-secret'
}

function constantTime(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  } catch {
    return false
  }
}

function constantTimeText(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
  } catch {
    return false
  }
}
