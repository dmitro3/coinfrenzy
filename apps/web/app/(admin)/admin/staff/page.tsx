import { redirect } from 'next/navigation'
import { desc, eq, isNull } from 'drizzle-orm'

import { canManageStaff, canReadAuditLog } from '@coinfrenzy/core/auth'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { requireAdminSession } from '@/lib/admin-session'
import { StaffTable, type StaffRow } from './staff-table'
import { PageHeader } from '@coinfrenzy/ui/admin/layout/PageHeader'

export const dynamic = 'force-dynamic'

export default async function StaffPage() {
  const session = await requireAdminSession('/admin/staff')
  if (!canReadAuditLog(session.payload.role)) {
    redirect('/admin')
  }

  const db = getDb()

  // Load admin rows + their assigned roles (aggregated client-side).
  const rows = await db
    .select({
      id: schema.admins.id,
      email: schema.admins.email,
      displayName: schema.admins.displayName,
      status: schema.admins.status,
      totpEnabled: schema.admins.totpEnabled,
      lastLoginAt: schema.admins.lastLoginAt,
      createdAt: schema.admins.createdAt,
    })
    .from(schema.admins)
    .where(isNull(schema.admins.deletedAt))
    .orderBy(desc(schema.admins.createdAt))

  const assignments = await db
    .select({
      adminId: schema.adminRoleAssignments.adminId,
      slug: schema.adminRoles.slug,
    })
    .from(schema.adminRoleAssignments)
    .innerJoin(schema.adminRoles, eq(schema.adminRoleAssignments.roleId, schema.adminRoles.id))

  const rolesByAdmin = new Map<string, string[]>()
  for (const a of assignments) {
    const list = rolesByAdmin.get(a.adminId) ?? []
    list.push(a.slug)
    rolesByAdmin.set(a.adminId, list)
  }

  const data: StaffRow[] = rows.map((r) => ({
    id: r.id,
    email: r.email,
    displayName: r.displayName,
    status: r.status,
    totpEnabled: r.totpEnabled,
    lastLoginAt: r.lastLoginAt ? r.lastLoginAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    roles: rolesByAdmin.get(r.id) ?? [],
  }))

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Staff"
        description="Operator accounts and their assigned roles. Master-only actions: invite, suspend/reactivate, force password or 2FA reset, set role, terminate. Every action is audited."
      />
      <StaffTable rows={data} canManage={canManageStaff(session.payload.role)} />
    </div>
  )
}
