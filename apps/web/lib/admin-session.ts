import 'server-only'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { env } from '@coinfrenzy/config'
import {
  ADMIN_SESSION_COOKIE as COOKIE_NAME,
  verifySession,
  type AdminSessionContext,
  type AdminSessionPayload,
} from '@coinfrenzy/core/auth'
import { getDb } from '@coinfrenzy/db/client'

const ADMIN_SESSION_COOKIE = COOKIE_NAME

export interface AdminSessionResult {
  payload: AdminSessionPayload
  admin: {
    id: string
    email: string
    displayName: string
    status: string
    totpEnabled: boolean
  }
}

/**
 * Build the auth context used by core/auth. Reads ADMIN_SESSION_SECRET and
 * optional ADMIN_SESSION_SECRET_PREV from env per docs/09 §5.2 upgrade 5.
 */
function getAdminAuthContext(): AdminSessionContext {
  const e = env()
  if (!e.ADMIN_SESSION_SECRET) {
    throw new Error(
      'ADMIN_SESSION_SECRET is not set. Generate a 32+ char secret and add it to your environment.',
    )
  }
  return {
    secret: e.ADMIN_SESSION_SECRET,
    previousSecret: e.ADMIN_SESSION_SECRET_PREV ?? null,
  }
}

export async function getRequestMeta(): Promise<{ ip: string; userAgent: string }> {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')
  const ip = (forwarded ? forwarded.split(',')[0] : h.get('x-real-ip')) ?? '0.0.0.0'
  const userAgent = h.get('user-agent') ?? ''
  return { ip: ip.trim(), userAgent }
}

/**
 * Read + verify the admin session for the current request. Returns null if
 * absent/invalid. Use this when you want to decide rendering on the basis
 * of session presence without redirecting.
 */
export async function getAdminSession(): Promise<AdminSessionResult | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value
  if (!token) return null

  const { ip, userAgent } = await getRequestMeta()
  const ctx = getAdminAuthContext()

  const result = await verifySession(ctx, {
    db: getDb(),
    token,
    ip,
    userAgent,
    enforceBindings: env().NODE_ENV === 'production',
  })

  if (!result.ok) return null
  return { payload: result.value.payload, admin: result.value.admin }
}

/**
 * Require a valid admin session in an RSC. Redirects to /admin/login if
 * missing. The caller can rely on the return value being defined.
 */
export async function requireAdminSession(nextPath?: string): Promise<AdminSessionResult> {
  const session = await getAdminSession()
  if (!session) {
    const target = `/admin/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ''}`
    redirect(target)
  }
  return session
}

export { getAdminAuthContext, ADMIN_SESSION_COOKIE }
