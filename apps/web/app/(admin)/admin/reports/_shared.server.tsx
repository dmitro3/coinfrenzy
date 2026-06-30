import 'server-only'

import { redirect } from 'next/navigation'

import { canReadAuditLog } from '@coinfrenzy/core/auth'

import { requireAdminSession, type AdminSessionResult } from '@/lib/admin-session'

// Reports section is gated to manager+ unless a page declares its own
// finer-grained rules (Custom Query is master-only via canRunCustomQuery).
export async function requireReportsAccess(nextPath: string): Promise<AdminSessionResult> {
  const session = await requireAdminSession(nextPath)
  if (!canReadAuditLog(session.payload.role)) redirect('/admin')
  return session
}
