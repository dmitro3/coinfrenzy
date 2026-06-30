import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { audit } from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/11 §3 — manual email send. Any admin role may queue a one-off email
// using a CRM template. The send itself is enqueued via Inngest in M2; for
// now we record intent + audit it.

const body = z.object({
  templateSlug: z.string().min(1).max(128),
  subject: z.string().max(255).optional(),
  body: z.string().max(10_000).optional(),
})

export async function POST(req: NextRequest, ctx2: { params: Promise<{ id: string }> }) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { flushAfterCommit, session, ip, userAgent } = built.data

  const { id } = await ctx2.params

  let parsed: z.infer<typeof body>
  try {
    parsed = body.parse(await req.json().catch(() => ({})))
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const db = getDb()
  const [player] = await db
    .select({ id: schema.players.id, email: schema.players.email })
    .from(schema.players)
    .where(eq(schema.players.id, id))
    .limit(1)
  if (!player) return jsonError(404, 'player_not_found')

  await audit.writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: session.admin.id,
    actorRole: session.payload.role,
    action: 'player.send_email',
    resourceKind: 'player',
    resourceId: id,
    after: {
      template_slug: parsed.templateSlug,
      to: player.email,
      subject_override: parsed.subject ?? null,
    },
    ip,
    userAgent,
    metadata: {
      template_slug: parsed.templateSlug,
      subject: parsed.subject,
      body: parsed.body,
    },
  })

  // The actual send is owned by the CRM/SendGrid pipeline (Inngest). For M1
  // we queue intent only; sending is wired in a later prompt.
  await flushAfterCommit()
  return NextResponse.json({ ok: true, queued: true })
}
