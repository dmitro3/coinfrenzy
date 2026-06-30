import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

import { and, eq, gt, isNull } from 'drizzle-orm'

import { type DbExecutor } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { err, ok, type Result } from '../errors/result'

/**
 * Hardened HMAC admin session per docs/09 §5.2.
 *
 * Token shape:
 *   <base64url(payload)>.<base64url(hmac(payload))>
 *
 * Payload includes session_id (revocation), bind_ip and bind_ua (theft
 * mitigation), exp/iat (timeouts). Signed with HMAC-SHA256 over the payload
 * bytes using ADMIN_SESSION_SECRET. ADMIN_SESSION_SECRET_PREV is accepted
 * during the 7-day rotation overlap.
 */

export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000 // 8 hours
export const ADMIN_SESSION_COOKIE = 'cf_admin_session'

export type AdminRoleSlug =
  | 'support'
  | 'host'
  | 'kyc_reviewer'
  | 'cashier'
  | 'cashier_lead'
  | 'marketing'
  | 'game_ops'
  | 'manager'
  | 'master'

export interface AdminSessionPayload {
  session_id: string
  admin_id: string
  role: AdminRoleSlug
  iat: number
  exp: number
  bind_ip: string
  bind_ua: string
}

export interface AdminSessionContext {
  /** Current ADMIN_SESSION_SECRET, used to sign new tokens and verify existing. */
  secret: string
  /** Optional previous secret accepted during 7-day rotation overlap. */
  previousSecret?: string | null
}

export interface IssueSessionInput {
  db: DbExecutor
  adminId: string
  role: AdminRoleSlug
  ip: string
  userAgent: string
  /** Override the now() timestamp (for tests). */
  now?: Date
  /** Override expiry (for tests). */
  expiresAt?: Date
}

export interface IssueSessionResult {
  token: string
  sessionId: string
  expiresAt: Date
  payload: AdminSessionPayload
}

export type AdminSessionVerifyError =
  | { kind: 'malformed' }
  | { kind: 'bad_signature' }
  | { kind: 'expired' }
  | { kind: 'revoked_or_unknown' }
  | { kind: 'ip_mismatch' }
  | { kind: 'ua_mismatch' }

/**
 * Coarse user-agent hash: SHA-256 of the lowercased UA string. Trim to 32
 * hex chars so the payload stays compact.
 */
export function hashUserAgent(ua: string): string {
  return createHash('sha256')
    .update((ua ?? '').toLowerCase().trim())
    .digest('hex')
    .slice(0, 32)
}

function base64url(input: Buffer): string {
  return input.toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function base64urlDecode(input: string): Buffer {
  const padded =
    input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4)
  return Buffer.from(padded, 'base64')
}

export function signToken(payload: AdminSessionPayload, secret: string): string {
  const body = base64url(Buffer.from(JSON.stringify(payload), 'utf8'))
  const sig = createHmac('sha256', secret).update(body).digest()
  return `${body}.${base64url(sig)}`
}

function verifySignature(token: string, secret: string): AdminSessionPayload | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts as [string, string]
  const expected = createHmac('sha256', secret).update(body).digest()
  let received: Buffer
  try {
    received = base64urlDecode(sig)
  } catch {
    return null
  }
  if (expected.length !== received.length) return null
  if (!timingSafeEqual(expected, received)) return null
  try {
    const parsed = JSON.parse(base64urlDecode(body).toString('utf8')) as unknown
    if (!isAdminSessionPayload(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

function isAdminSessionPayload(value: unknown): value is AdminSessionPayload {
  if (typeof value !== 'object' || value == null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.session_id === 'string' &&
    typeof v.admin_id === 'string' &&
    typeof v.role === 'string' &&
    typeof v.iat === 'number' &&
    typeof v.exp === 'number' &&
    typeof v.bind_ip === 'string' &&
    typeof v.bind_ua === 'string'
  )
}

/**
 * Create an admin session row + signed token. Both ADMIN_SESSION_SECRET and
 * the database row must be valid for the session to authenticate.
 *
 * NOTE: caller is responsible for writing the audit log entry for the login
 * event. We keep this function pure(-ish) so it can be re-used for
 * step-up sessions, impersonation tokens, etc.
 */
export async function issueSession(
  ctx: AdminSessionContext,
  input: IssueSessionInput,
): Promise<IssueSessionResult> {
  const now = input.now ?? new Date()
  const expiresAt = input.expiresAt ?? new Date(now.getTime() + SESSION_DURATION_MS)
  const sessionId = randomUUID()
  const uaHash = hashUserAgent(input.userAgent)

  await input.db.insert(schema.adminSessions).values({
    id: sessionId,
    adminId: input.adminId,
    bindIp: input.ip || null,
    bindUaHash: uaHash,
    createdAt: now,
    expiresAt,
    lastActiveAt: now,
  })

  const payload: AdminSessionPayload = {
    session_id: sessionId,
    admin_id: input.adminId,
    role: input.role,
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor(expiresAt.getTime() / 1000),
    bind_ip: input.ip,
    bind_ua: uaHash,
  }
  const token = signToken(payload, ctx.secret)
  return { token, sessionId, expiresAt, payload }
}

export interface VerifySessionInput {
  db: DbExecutor
  token: string
  ip: string
  userAgent: string
  /** Set false to skip the IP/UA bindings (e.g. mobile clients). */
  enforceBindings?: boolean
  /** Override the now() timestamp (for tests). */
  now?: Date
}

export interface VerifySessionSuccess {
  payload: AdminSessionPayload
  admin: { id: string; email: string; displayName: string; status: string; totpEnabled: boolean }
  sessionRow: { id: string; expiresAt: Date; revokedAt: Date | null }
}

/**
 * Validate the token's HMAC signature against current + previous secret,
 * then enforce session row, expiry, and bindings.
 */
export async function verifySession(
  ctx: AdminSessionContext,
  input: VerifySessionInput,
): Promise<Result<VerifySessionSuccess, AdminSessionVerifyError>> {
  const enforce = input.enforceBindings ?? true
  const now = input.now ?? new Date()

  let payload = verifySignature(input.token, ctx.secret)
  if (!payload && ctx.previousSecret) {
    payload = verifySignature(input.token, ctx.previousSecret)
  }
  if (!payload) {
    return err({ kind: 'bad_signature' as const })
  }

  if (payload.exp * 1000 < now.getTime()) {
    return err({ kind: 'expired' as const })
  }

  const expectedUa = hashUserAgent(input.userAgent)
  if (enforce && payload.bind_ua && payload.bind_ua !== expectedUa) {
    return err({ kind: 'ua_mismatch' as const })
  }
  if (enforce && payload.bind_ip && input.ip && payload.bind_ip !== input.ip) {
    return err({ kind: 'ip_mismatch' as const })
  }

  const sessionRow = await input.db
    .select({
      id: schema.adminSessions.id,
      expiresAt: schema.adminSessions.expiresAt,
      revokedAt: schema.adminSessions.revokedAt,
    })
    .from(schema.adminSessions)
    .where(
      and(
        eq(schema.adminSessions.id, payload.session_id),
        isNull(schema.adminSessions.revokedAt),
        gt(schema.adminSessions.expiresAt, now),
      ),
    )
    .limit(1)

  const row = sessionRow[0]
  if (!row) {
    return err({ kind: 'revoked_or_unknown' as const })
  }

  const adminRow = await input.db
    .select({
      id: schema.admins.id,
      email: schema.admins.email,
      displayName: schema.admins.displayName,
      status: schema.admins.status,
      totpEnabled: schema.admins.totpEnabled,
    })
    .from(schema.admins)
    .where(eq(schema.admins.id, payload.admin_id))
    .limit(1)

  const admin = adminRow[0]
  if (!admin || admin.status !== 'active') {
    return err({ kind: 'revoked_or_unknown' as const })
  }

  return ok({ payload, admin, sessionRow: row })
}

export interface RevokeSessionInput {
  db: DbExecutor
  sessionId: string
  reason?: string
  revokedBy?: string
  /** Override the now() timestamp (for tests). */
  now?: Date
}

export async function revokeSession({
  db,
  sessionId,
  reason,
  revokedBy,
  now,
}: RevokeSessionInput): Promise<void> {
  await db
    .update(schema.adminSessions)
    .set({
      revokedAt: now ?? new Date(),
      revokedReason: reason ?? null,
      revokedBy: revokedBy ?? null,
    })
    .where(and(eq(schema.adminSessions.id, sessionId), isNull(schema.adminSessions.revokedAt)))
}

/**
 * Bulk revoke — used by "log out everywhere" and by master force-logout.
 */
export async function revokeAllSessionsForAdmin({
  db,
  adminId,
  reason,
  revokedBy,
  now,
}: {
  db: DbExecutor
  adminId: string
  reason?: string
  revokedBy?: string
  now?: Date
}): Promise<number> {
  const result = await db
    .update(schema.adminSessions)
    .set({
      revokedAt: now ?? new Date(),
      revokedReason: reason ?? null,
      revokedBy: revokedBy ?? null,
    })
    .where(and(eq(schema.adminSessions.adminId, adminId), isNull(schema.adminSessions.revokedAt)))
    .returning({ id: schema.adminSessions.id })
  return result.length
}
