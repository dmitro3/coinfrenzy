import { randomBytes } from 'node:crypto'

import { NextResponse, type NextRequest } from 'next/server'
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { audit, auth as coreAuth, crm as coreCrm } from '@coinfrenzy/core'
import { hashPassword } from '@coinfrenzy/core/auth'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/09 §5 — staff invite + management.
//
// Master-only. Creates a new admin with:
//   - status='active'
//   - must_reset_password=true (login forces wizard)
//   - totp_enabled=false (wizard enforces 2FA setup post-reset)
//   - a strong random temp password
// and assigns the named role.
//
// The temp password is returned ONCE in the response so the founder can
// hand it to the new staff member out-of-band. We also attempt to send
// an invitation email if a template named `staff_invitation` exists; the
// route does not fail if the email send fails (the founder still has
// the temp password).

const ROLES = [
  'support',
  'host',
  'kyc_reviewer',
  'cashier',
  'cashier_lead',
  'marketing',
  'game_ops',
  'manager',
  'master',
] as const

const inviteBody = z.object({
  email: z.string().email().toLowerCase(),
  displayName: z.string().trim().min(1).max(100),
  role: z.enum(ROLES),
})

function generateTempPassword(): string {
  // 16 random hex chars + symbol/case so the policy passes on first reset.
  const raw = randomBytes(12).toString('base64url').slice(0, 14)
  return `Cf1!${raw}`
}

export async function POST(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { ctx, flushAfterCommit, session, ip, userAgent } = built.data

  if (!coreAuth.canManageStaff(session.payload.role)) {
    return jsonError(403, 'forbidden', { required: 'master' })
  }

  let parsed: z.infer<typeof inviteBody>
  try {
    parsed = inviteBody.parse(await req.json().catch(() => ({})))
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const db = getDb()
  const existing = await db
    .select({ id: schema.admins.id })
    .from(schema.admins)
    .where(sql`lower(${schema.admins.email}) = ${parsed.email}`)
    .limit(1)
  if (existing[0]) return jsonError(409, 'email_already_in_use')

  const tempPassword = generateTempPassword()
  const passwordHash = await hashPassword(tempPassword, 12)

  const [created] = await db
    .insert(schema.admins)
    .values({
      email: parsed.email,
      displayName: parsed.displayName,
      passwordHash,
      mustResetPassword: true,
      totpEnabled: false,
      status: 'active',
    })
    .returning({ id: schema.admins.id })

  // Assign the role.
  const [role] = await db
    .select({ id: schema.adminRoles.id })
    .from(schema.adminRoles)
    .where(eq(schema.adminRoles.slug, parsed.role))
    .limit(1)
  if (role) {
    await db.insert(schema.adminRoleAssignments).values({ adminId: created!.id, roleId: role.id })
  }

  await audit.writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: session.admin.id,
    actorRole: session.payload.role,
    action: 'staff.invite',
    resourceKind: 'admin',
    resourceId: created!.id,
    after: { email: parsed.email, role: parsed.role, displayName: parsed.displayName },
    ip,
    userAgent,
  })

  // Best-effort invitation email. We pass through a dedicated template
  // slug; if it doesn't exist the send returns TEMPLATE_NOT_FOUND and
  // we silently move on — the temp password is still surfaced in the
  // response.
  let emailDispatched: 'sent' | 'no_template' | 'skipped' = 'skipped'
  try {
    // sendDirectMessage expects a playerId. For staff invitations the
    // template-resolution + provider dispatch lives in dispatchEmail
    // directly so we render minimally and call dispatchers.
    const subject = `You've been invited to CoinFrenzy admin`
    const html = `<p>Hi ${parsed.displayName},</p>
<p>You have been invited to the CoinFrenzy back-office.</p>
<p><strong>Email:</strong> ${parsed.email}<br/>
<strong>Temporary password:</strong> <code>${tempPassword}</code></p>
<p>Sign in at <a href="https://admin.coinfrenzy.com/admin">https://admin.coinfrenzy.com/admin</a> and you will be prompted to set a new password and enable two-factor authentication.</p>
<p>This temporary password will expire on first login.</p>`
    const text = `You have been invited to CoinFrenzy admin.\nEmail: ${parsed.email}\nTemporary password: ${tempPassword}\nSign in at https://admin.coinfrenzy.com/admin to set a new password and enable 2FA.`
    const dispatch = await coreCrm.dispatchEmail({
      to: parsed.email,
      from: 'noreply@coinfrenzy.com',
      subject,
      html,
      text,
    })
    emailDispatched = dispatch.ok ? 'sent' : 'no_template'
  } catch {
    emailDispatched = 'skipped'
  }

  void ctx
  await flushAfterCommit()
  return NextResponse.json({
    ok: true,
    adminId: created!.id,
    email: parsed.email,
    role: parsed.role,
    tempPassword,
    emailDispatched,
    note: 'Temp password is shown ONCE. Save it now. The invited admin must set a new password and enable 2FA on first login.',
  })
}
