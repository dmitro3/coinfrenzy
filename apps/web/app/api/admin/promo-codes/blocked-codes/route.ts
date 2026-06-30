import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { canManageBonuses } from '@coinfrenzy/core/auth'
import { writeAuditEntry } from '@coinfrenzy/core/audit'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { getAdminSession, getRequestMeta } from '@/lib/admin-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Hard blocklist for promo codes (docs/06 §12 step 1a). Entries here
// short-circuit redemption even if the row in `promo_codes` is otherwise
// active. Used when an abused code needs to be killed immediately without
// archiving (e.g. leaked on a coupon-aggregator site).

const body = z.object({
  code: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, 'code must be alphanumeric'),
  reason: z.string().min(2).max(500),
})

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canManageBonuses(session.payload.role)) {
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
  const code = parsed.code.toUpperCase()

  try {
    await db
      .insert(schema.blockedPromoCodes)
      .values({ code, reason: parsed.reason, addedBy: session.admin.id })
      .onConflictDoUpdate({
        target: schema.blockedPromoCodes.code,
        set: { reason: parsed.reason, addedBy: session.admin.id, addedAt: new Date() },
      })

    const meta = await getRequestMeta()
    await writeAuditEntry(db, {
      actorKind: 'admin',
      actorId: session.admin.id,
      actorRole: session.payload.role,
      action: 'admin.promo_code.blocked',
      resourceKind: 'blocked_promo_code',
      resourceId: code,
      after: { code, reason: parsed.reason },
      ip: meta.ip,
      userAgent: meta.userAgent,
    })

    return NextResponse.json({ code })
  } catch (e) {
    return NextResponse.json(
      { error: 'block_failed', details: e instanceof Error ? e.message : undefined },
      { status: 500 },
    )
  }
}
