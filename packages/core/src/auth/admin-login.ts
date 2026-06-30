import { and, eq, isNull } from 'drizzle-orm'

import { type DbExecutor } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { err, ok, type Result } from '../errors/result'
import { verifyPassword } from './password'
import type { AdminRoleSlug } from './admin-session'

export type AdminLoginError =
  | { kind: 'invalid_credentials' }
  | { kind: 'account_suspended'; reason: string | null }
  | { kind: 'account_terminated' }
  | { kind: 'no_roles' }

export interface AdminLoginSuccess {
  adminId: string
  email: string
  displayName: string
  totpEnabled: boolean
  /** docs/09 §5.4 — first-login + admin-forced rotation flag. */
  mustResetPassword: boolean
  /** Highest-ranked role assigned to this admin. */
  primaryRole: AdminRoleSlug
  /** All assigned role slugs. */
  roles: AdminRoleSlug[]
}

const ROLE_RANK: Record<string, number> = {
  support: 10,
  kyc_reviewer: 20,
  cashier: 30,
  cashier_lead: 40,
  marketing: 50,
  game_ops: 60,
  manager: 100,
  master: 1000,
}

/**
 * Verify (email, password) and return the admin's account state. The caller
 * is responsible for the next steps (2FA verification, session issuance,
 * audit logging).
 */
export async function authenticateAdmin({
  db,
  email,
  password,
}: {
  db: DbExecutor
  email: string
  password: string
}): Promise<Result<AdminLoginSuccess, AdminLoginError>> {
  const normalized = email.trim().toLowerCase()
  const rows = await db
    .select({
      id: schema.admins.id,
      email: schema.admins.email,
      displayName: schema.admins.displayName,
      passwordHash: schema.admins.passwordHash,
      totpEnabled: schema.admins.totpEnabled,
      mustResetPassword: schema.admins.mustResetPassword,
      status: schema.admins.status,
      statusReason: schema.admins.statusReason,
      deletedAt: schema.admins.deletedAt,
    })
    .from(schema.admins)
    .where(and(eq(schema.admins.email, normalized), isNull(schema.admins.deletedAt)))
    .limit(1)

  const row = rows[0]
  if (!row) {
    // We must do a dummy compare to keep timing similar; bcrypt.compare()
    // with a dummy hash takes ~50ms regardless.
    await verifyPassword(password, '$2a$12$invalidsaltinvalidsaltinvalidsaltinvalidsaltinvalidsal')
    return err({ kind: 'invalid_credentials' as const })
  }

  const valid = await verifyPassword(password, row.passwordHash)
  if (!valid) {
    return err({ kind: 'invalid_credentials' as const })
  }

  if (row.status === 'terminated' || row.deletedAt) {
    return err({ kind: 'account_terminated' as const })
  }
  if (row.status === 'suspended') {
    return err({ kind: 'account_suspended' as const, reason: row.statusReason })
  }

  // Load role assignments.
  const roleRows = await db
    .select({ slug: schema.adminRoles.slug })
    .from(schema.adminRoleAssignments)
    .innerJoin(schema.adminRoles, eq(schema.adminRoleAssignments.roleId, schema.adminRoles.id))
    .where(eq(schema.adminRoleAssignments.adminId, row.id))

  const roles = roleRows.map((r) => r.slug as AdminRoleSlug)
  if (roles.length === 0) {
    return err({ kind: 'no_roles' as const })
  }

  const primaryRole = roles.reduce((best, r) =>
    (ROLE_RANK[r] ?? 0) > (ROLE_RANK[best] ?? 0) ? r : best,
  )

  return ok({
    adminId: row.id,
    email: row.email,
    displayName: row.displayName,
    totpEnabled: row.totpEnabled,
    mustResetPassword: row.mustResetPassword,
    primaryRole,
    roles,
  })
}
