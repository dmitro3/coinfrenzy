import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { audit } from '@coinfrenzy/core'
import { getDb, schema } from '@coinfrenzy/db'

import { getAdminSession, getRequestMeta } from '@/lib/admin-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/07 §7 + docs/08 §7.1 — "Escalate to Manager" action: a non-manager
// cashier flags a redemption for manager review. We don't have a separate
// `escalated` status — the row stays in pending_review but writes an audit
// row that the manager queue UI can pivot on.

const body = z.object({
  reason: z.string().min(1).max(2000),
})

export async function POST(req: NextRequest, ctx2: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await ctx2.params
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
  const redemption = await db.query.redemptions.findFirst({
    where: eq(schema.redemptions.id, id),
  })
  if (!redemption) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const meta = await getRequestMeta()
  await audit.writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: session.admin.id,
    actorRole: session.payload.role,
    action: 'redemption.escalated',
    resourceKind: 'redemption',
    resourceId: id,
    reason: parsed.reason,
    ip: meta.ip,
    metadata: { current_status: redemption.status },
  })

  return NextResponse.json({ ok: true })
}
