import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { audit, auth as coreAuth } from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/09 §5 — staff actions.
//
// PATCH supports a few targeted operations keyed by an `action` field
// so the UI only needs one endpoint:
//   - "suspend"     — sets status='suspended'
//   - "reactivate"  — sets status='active' (must be currently suspended)
//   - "force_password_reset"  — sets must_reset_password=true
//   - "force_2fa_reset"       — clears totp_secret and totp_enabled
//   - "set_role"    — replaces the admin's role assignments
//
// DELETE soft-deletes the admin (status='terminated', deleted_at=now).
// A terminated admin cannot log in; their audit history remains intact.
//
// All actions are master-only and audited.

const patchBody = z.discriminatedUnion('action', [
  z.object({ action: z.literal('suspend'), reason: z.string().trim().min(3).max(500) }),
  z.object({ action: z.literal('reactivate'), reason: z.string().trim().min(3).max(500) }),
  z.object({
    action: z.literal('force_password_reset'),
    reason: z.string().trim().min(3).max(500),
  }),
  z.object({ action: z.literal('force_2fa_reset'), reason: z.string().trim().min(3).max(500) }),
  z.object({
    action: z.literal('set_role'),
    role: z.enum([
      'support',
      'host',
      'kyc_reviewer',
      'cashier',
      'cashier_lead',
      'marketing',
      'game_ops',
      'manager',
      'master',
    ]),
    reason: z.string().trim().min(3).max(500),
  }),
])

export async function PATCH(req: NextRequest, ctx2: { params: Promise<{ id: string }> }) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { flushAfterCommit, session, ip, userAgent } = built.data

  if (!coreAuth.canManageStaff(session.payload.role)) {
    return jsonError(403, 'forbidden', { required: 'master' })
  }

  const { id } = await ctx2.params
  if (id === session.admin.id) {
    return jsonError(409, 'cannot_act_on_self')
  }

  let parsed: z.infer<typeof patchBody>
  try {
    parsed = patchBody.parse(await req.json().catch(() => ({})))
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const db = getDb()
  const [target] = await db.select().from(schema.admins).where(eq(schema.admins.id, id)).limit(1)
  if (!target) return jsonError(404, 'staff_not_found')
  if (target.deletedAt) return jsonError(409, 'staff_terminated')

  switch (parsed.action) {
    case 'suspend': {
      if (target.status === 'suspended') return NextResponse.json({ ok: true, noChange: true })
      await db
        .update(schema.admins)
        .set({ status: 'suspended', statusReason: parsed.reason, updatedAt: new Date() })
        .where(eq(schema.admins.id, id))
      await audit.writeAuditEntry(db, {
        actorKind: 'admin',
        actorId: session.admin.id,
        actorRole: session.payload.role,
        action: 'staff.suspend',
        resourceKind: 'admin',
        resourceId: id,
        before: { status: target.status },
        after: { status: 'suspended' },
        reason: parsed.reason,
        ip,
        userAgent,
      })
      break
    }
    case 'reactivate': {
      if (target.status === 'active') return NextResponse.json({ ok: true, noChange: true })
      await db
        .update(schema.admins)
        .set({ status: 'active', statusReason: null, updatedAt: new Date() })
        .where(eq(schema.admins.id, id))
      await audit.writeAuditEntry(db, {
        actorKind: 'admin',
        actorId: session.admin.id,
        actorRole: session.payload.role,
        action: 'staff.reactivate',
        resourceKind: 'admin',
        resourceId: id,
        before: { status: target.status },
        after: { status: 'active' },
        reason: parsed.reason,
        ip,
        userAgent,
      })
      break
    }
    case 'force_password_reset': {
      await db
        .update(schema.admins)
        .set({ mustResetPassword: true, updatedAt: new Date() })
        .where(eq(schema.admins.id, id))
      await audit.writeAuditEntry(db, {
        actorKind: 'admin',
        actorId: session.admin.id,
        actorRole: session.payload.role,
        action: 'staff.force_password_reset',
        resourceKind: 'admin',
        resourceId: id,
        after: { must_reset_password: true },
        reason: parsed.reason,
        ip,
        userAgent,
      })
      break
    }
    case 'force_2fa_reset': {
      await db
        .update(schema.admins)
        .set({
          totpSecret: null,
          totpEnabled: false,
          totpEnabledAt: null,
          backupCodes: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.admins.id, id))
      await audit.writeAuditEntry(db, {
        actorKind: 'admin',
        actorId: session.admin.id,
        actorRole: session.payload.role,
        action: 'staff.force_2fa_reset',
        resourceKind: 'admin',
        resourceId: id,
        before: { totpEnabled: target.totpEnabled },
        after: { totpEnabled: false },
        reason: parsed.reason,
        ip,
        userAgent,
      })
      break
    }
    case 'set_role': {
      const [role] = await db
        .select({ id: schema.adminRoles.id })
        .from(schema.adminRoles)
        .where(eq(schema.adminRoles.slug, parsed.role))
        .limit(1)
      if (!role) return jsonError(404, 'role_not_found')

      // Snapshot existing assignments for the audit trail.
      const prior = await db
        .select({ slug: schema.adminRoles.slug })
        .from(schema.adminRoleAssignments)
        .innerJoin(schema.adminRoles, eq(schema.adminRoleAssignments.roleId, schema.adminRoles.id))
        .where(eq(schema.adminRoleAssignments.adminId, id))

      await db
        .delete(schema.adminRoleAssignments)
        .where(eq(schema.adminRoleAssignments.adminId, id))
      await db.insert(schema.adminRoleAssignments).values({ adminId: id, roleId: role.id })

      await audit.writeAuditEntry(db, {
        actorKind: 'admin',
        actorId: session.admin.id,
        actorRole: session.payload.role,
        action: 'staff.set_role',
        resourceKind: 'admin',
        resourceId: id,
        before: { roles: prior.map((p) => p.slug) },
        after: { roles: [parsed.role] },
        reason: parsed.reason,
        ip,
        userAgent,
      })
      break
    }
  }

  await flushAfterCommit()
  return NextResponse.json({ ok: true, action: parsed.action })
}

const deleteQuerySchema = z.object({
  reason: z.string().trim().min(10).max(500),
})

export async function DELETE(req: NextRequest, ctx2: { params: Promise<{ id: string }> }) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { flushAfterCommit, session, ip, userAgent } = built.data

  if (!coreAuth.canManageStaff(session.payload.role)) {
    return jsonError(403, 'forbidden', { required: 'master' })
  }

  const { id } = await ctx2.params
  if (id === session.admin.id) {
    return jsonError(409, 'cannot_terminate_self')
  }

  const url = new URL(req.url)
  let parsed: z.infer<typeof deleteQuerySchema>
  try {
    parsed = deleteQuerySchema.parse({ reason: url.searchParams.get('reason') ?? '' })
  } catch (e) {
    return jsonError(
      400,
      'reason_required_min_10_chars',
      e instanceof z.ZodError ? e.flatten() : undefined,
    )
  }

  const db = getDb()
  const [target] = await db.select().from(schema.admins).where(eq(schema.admins.id, id)).limit(1)
  if (!target) return jsonError(404, 'staff_not_found')
  if (target.deletedAt) return jsonError(409, 'already_terminated')

  await db
    .update(schema.admins)
    .set({
      status: 'terminated',
      statusReason: parsed.reason,
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.admins.id, id))

  // Drop role assignments so a re-created admin row doesn't inherit them.
  await db.delete(schema.adminRoleAssignments).where(eq(schema.adminRoleAssignments.adminId, id))

  await audit.writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: session.admin.id,
    actorRole: session.payload.role,
    action: 'staff.terminate',
    resourceKind: 'admin',
    resourceId: id,
    before: { status: target.status, totpEnabled: target.totpEnabled },
    after: { status: 'terminated', deletedAt: new Date().toISOString() },
    reason: parsed.reason,
    ip,
    userAgent,
  })

  await flushAfterCommit()
  return NextResponse.json({ ok: true })
}
