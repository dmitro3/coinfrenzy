import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import type { AdminRoleSlug } from './admin-session'

/**
 * Stateless, short-lived token returned after step-1 (password) login. The
 * client sends it back with the TOTP code in step-2. Token expires in 5
 * minutes; cannot be replayed past expiry.
 *
 * Carries a `purpose` so a step-1 token can't be reused as a setup token.
 */

export type PendingPurpose = 'totp_verify' | 'totp_setup'

export interface Pending2FAPayload {
  admin_id: string
  primary_role: AdminRoleSlug
  ip: string
  ua: string
  purpose: PendingPurpose
  iat: number
  exp: number
  nonce: string
}

const TTL_MS = 5 * 60 * 1000

export function issuePending(
  secret: string,
  data: Omit<Pending2FAPayload, 'iat' | 'exp' | 'nonce'>,
  now: Date = new Date(),
): string {
  const payload: Pending2FAPayload = {
    ...data,
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor((now.getTime() + TTL_MS) / 1000),
    nonce: randomBytes(8).toString('hex'),
  }
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const sig = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyPending(
  secret: string,
  token: string,
  now: Date = new Date(),
): Pending2FAPayload | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts as [string, string]
  const expected = createHmac('sha256', secret).update(body).digest()
  let received: Buffer
  try {
    received = Buffer.from(sig, 'base64url')
  } catch {
    return null
  }
  if (expected.length !== received.length) return null
  if (!timingSafeEqual(expected, received)) return null
  try {
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as unknown
    if (!isPending(decoded)) return null
    if (decoded.exp * 1000 < now.getTime()) return null
    return decoded
  } catch {
    return null
  }
}

function isPending(v: unknown): v is Pending2FAPayload {
  if (typeof v !== 'object' || v == null) return false
  const o = v as Record<string, unknown>
  return (
    typeof o.admin_id === 'string' &&
    typeof o.primary_role === 'string' &&
    typeof o.ip === 'string' &&
    typeof o.ua === 'string' &&
    (o.purpose === 'totp_verify' || o.purpose === 'totp_setup') &&
    typeof o.iat === 'number' &&
    typeof o.exp === 'number' &&
    typeof o.nonce === 'string'
  )
}
