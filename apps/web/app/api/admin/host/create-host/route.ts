import { NextResponse, type NextRequest } from 'next/server'
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import { audit } from '@coinfrenzy/core'
import { canCreateHost, hashPassword } from '@coinfrenzy/core/auth'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { getAdminSession, getRequestMeta } from '@/lib/admin-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// M4 — master creates a host account. Inserts into `admins`, assigns the
// 'host' role, and audits the creation. The user must rotate the temp
// password on first login per docs/09 §5.2.

const body = z.object({
  displayName: z.string().min(1).max(120),
  email: z.string().email().max(255),
  tempPassword: z.string().min(12).max(255),
})

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canCreateHost(session.payload.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let parsed: z.infer<typeof body>
  try {
    parsed = body.parse(await req.json())
  } catch (e) {
    return NextResponse.json(
      { error: 'invalid_input', details: e instanceof z.ZodError ? e.flatten() : undefined },
      { status: 400 },
    )
  }

  const db = getDb()
  const lowerEmail = parsed.email.toLowerCase()

  const existing = await db
    .select({ id: schema.admins.id })
    .from(schema.admins)
    .where(sql`lower(${schema.admins.email}) = ${lowerEmail}`)
    .limit(1)
  if (existing[0]) {
    return NextResponse.json({ error: 'email_already_exists' }, { status: 409 })
  }

  const hostRoleRows = await db
    .select({ id: schema.adminRoles.id })
    .from(schema.adminRoles)
    .where(eq(schema.adminRoles.slug, 'host'))
    .limit(1)
  const hostRoleId = hostRoleRows[0]?.id
  if (!hostRoleId) {
    return NextResponse.json(
      { error: 'host_role_missing', reason: "Run db:migrate to install the 'host' role." },
      { status: 500 },
    )
  }

  const passwordHash = await hashPassword(parsed.tempPassword, 12)

  const inserted = await db
    .insert(schema.admins)
    .values({
      email: lowerEmail,
      displayName: parsed.displayName,
      passwordHash,
      status: 'active',
    })
    .returning({ id: schema.admins.id })

  const newAdminId = inserted[0]?.id
  if (!newAdminId) {
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 })
  }

  await db.insert(schema.adminRoleAssignments).values({
    adminId: newAdminId,
    roleId: hostRoleId,
  })

  const meta = await getRequestMeta()
  await audit.writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: session.admin.id,
    actorRole: session.payload.role,
    action: 'admin.host_created',
    resourceKind: 'admin',
    resourceId: newAdminId,
    metadata: {
      email: lowerEmail,
      display_name: parsed.displayName,
    },
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  return NextResponse.json({ ok: true, hostId: newAdminId })
}
