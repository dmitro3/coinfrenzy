import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { audit } from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/09 §6 — right-to-erasure / "wipe account" flow. Honors a player's
// data deletion request without violating audit-trail immutability:
//   1. PII is overwritten on `players` (email replaced with a deterministic
//      anonymised tombstone, name fields nulled, address scrubbed).
//   2. The same tombstone is mirrored on `auth_user` so logins are
//      impossible going forward (Better Auth requires a unique email and
//      ours is now an `@deleted.coinfrenzy.invalid` address).
//   3. All Better Auth sessions are revoked.
//   4. The row is soft-deleted (`deleted_at = now`) and the status flips
//      to `closed` so downstream segments / dashboards exclude it.
//   5. The audit_log records BEFORE/AFTER values so the trail itself is
//      preserved even after the live row is anonymised.
//
// We deliberately do NOT hard-delete the row: ledger entries, redemptions,
// audit history, and KYC events reference the player id and are
// regulatorily-required to remain intact. The tombstone is the GDPR-style
// "the right to be forgotten" reconciled with sweepstakes recordkeeping.
//
// Permission: master only. Reason text is mandatory and stored.

const body = z.object({
  reason: z.string().min(10).max(1000),
  confirm: z.literal('DELETE'),
})

export async function POST(req: NextRequest, ctx2: { params: Promise<{ id: string }> }) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { flushAfterCommit, session, ip, userAgent } = built.data

  if (session.payload.role !== 'master') {
    return jsonError(403, 'forbidden', { required: 'master' })
  }

  const { id } = await ctx2.params

  let parsed: z.infer<typeof body>
  try {
    parsed = body.parse(await req.json().catch(() => ({})))
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const db = getDb()
  const [player] = await db.select().from(schema.players).where(eq(schema.players.id, id)).limit(1)
  if (!player) return jsonError(404, 'player_not_found')

  if (player.deletedAt) {
    return jsonError(400, 'already_wiped')
  }

  const now = new Date()
  const tombstoneEmail = `deleted+${id}@deleted.coinfrenzy.invalid`

  const before = {
    email: player.email,
    username: player.username,
    display_name: player.displayName,
    first_name: player.firstName,
    last_name: player.lastName,
    phone: player.phone,
    address_line1: player.addressLine1,
    address_line2: player.addressLine2,
    city: player.city,
    postal_code: player.postalCode,
    status: player.status,
  }

  await db.transaction(async (tx) => {
    await tx
      .update(schema.players)
      .set({
        email: tombstoneEmail,
        username: null,
        displayName: 'Deleted user',
        firstName: null,
        lastName: null,
        phone: null,
        addressLine1: null,
        addressLine2: null,
        city: null,
        postalCode: null,
        emailConsent: false,
        smsConsent: false,
        status: 'closed',
        statusReason: `wiped by admin: ${parsed.reason.slice(0, 200)}`,
        deletedAt: now,
        updatedAt: now,
      })
      .where(eq(schema.players.id, id))

    await tx
      .update(schema.authUser)
      .set({
        email: tombstoneEmail,
        emailVerified: false,
        name: null,
        image: null,
        updatedAt: now,
      })
      .where(eq(schema.authUser.id, id))

    await tx.delete(schema.authSession).where(eq(schema.authSession.userId, id))
    await tx.delete(schema.authTwoFactor).where(eq(schema.authTwoFactor.userId, id))
  })

  await audit.writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: session.admin.id,
    actorRole: session.payload.role,
    action: 'player.wipe',
    resourceKind: 'player',
    resourceId: id,
    before,
    after: {
      email: tombstoneEmail,
      status: 'closed',
      deleted_at: now.toISOString(),
    },
    reason: parsed.reason,
    ip,
    userAgent,
  })

  await flushAfterCommit()
  return NextResponse.json({ ok: true })
}
