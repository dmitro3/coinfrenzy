import { randomUUID } from 'node:crypto'

import { NextResponse, type NextRequest } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { audit, vip as vipModule } from '@coinfrenzy/core'
import { isHost } from '@coinfrenzy/core/auth'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// M4 — host sends an ad-hoc message to one of their VIPs. Ownership is
// enforced before we touch the message log or audit table.
//
// Delivery uses the same crm_message_log table the CRM uses; the actual
// SendGrid/Twilio call is queued by the worker (existing infra). For M4
// scope we record intent + audit it; the queue path picks it up.

const body = z.object({
  playerId: z.string().uuid(),
  channel: z.enum(['email', 'sms', 'in_app']).default('email'),
  subject: z.string().max(255).optional(),
  body: z.string().min(1).max(10_000),
})

export async function POST(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { session, ip, userAgent, flushAfterCommit } = built.data

  if (!isHost(session.payload.role)) {
    return jsonError(403, 'forbidden')
  }

  let parsed: z.infer<typeof body>
  try {
    parsed = body.parse(await req.json().catch(() => ({})))
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const db = getDb()
  // SECURITY: confirm the player is assigned to this host before doing anything.
  const [player] = await db
    .select({
      id: schema.players.id,
      email: schema.players.email,
      phone: schema.players.phone,
      emailConsent: schema.players.emailConsent,
      smsConsent: schema.players.smsConsent,
    })
    .from(schema.players)
    .where(
      and(
        eq(schema.players.id, parsed.playerId),
        eq(schema.players.assignedHostId, session.admin.id),
      ),
    )
    .limit(1)
  if (!player) return jsonError(403, 'player_not_assigned')

  if (parsed.channel === 'sms' && !player.phone) return jsonError(400, 'player_has_no_phone')
  if (parsed.channel === 'email' && !player.emailConsent) {
    return jsonError(400, 'player_email_consent_off')
  }
  if (parsed.channel === 'sms' && !player.smsConsent) {
    return jsonError(400, 'player_sms_consent_off')
  }

  const recipient = parsed.channel === 'sms' ? (player.phone ?? '') : player.email
  const messageId = randomUUID()
  const now = new Date()

  await db.insert(schema.crmMessageLog).values({
    id: messageId,
    playerId: player.id,
    channel: parsed.channel,
    recipient,
    subject: parsed.subject ?? null,
    bodyPreview: parsed.body.slice(0, 280),
    status: 'queued',
    queuedAt: now,
    createdAt: now,
  })

  await audit.writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: session.admin.id,
    actorRole: session.payload.role,
    action: 'host.message_sent',
    resourceKind: 'player',
    resourceId: player.id,
    metadata: {
      channel: parsed.channel,
      message_id: messageId,
      subject: parsed.subject ?? null,
    },
    ip,
    userAgent,
  })

  // Mirror to host_player_interactions so it surfaces in the player history.
  await vipModule.logInteraction(db, {
    hostId: session.admin.id,
    playerId: player.id,
    type: 'message_sent',
    notes: parsed.subject ?? parsed.body.slice(0, 280),
    metadata: {
      channel: parsed.channel,
      message_id: messageId,
    },
    actorRole: 'host',
    skipAudit: true,
  })

  await flushAfterCommit()
  return NextResponse.json({ ok: true, messageId, queued: true })
}
