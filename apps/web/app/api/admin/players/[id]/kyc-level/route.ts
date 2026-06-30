import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { audit, auth as coreAuth } from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/07 §6 — manual KYC override. Compliance + master can promote/demote
// a player to any KYC tier internally (L0 / L1 / L2 / L3) when they've
// verified identity out-of-band (e.g. through the cashier review queue or
// a manual document review). The change writes audit_log with before/after
// so the trail survives even if a tier is later downgraded.
//
// Permission: manager+ may demote (raise compliance friction), but only
// master+ may PROMOTE to L2 or L3 (redemption-enabling). This mirrors the
// approval-threshold pattern documented in docs/09 §3.

const body = z.object({
  kycLevel: z.number().int().min(0).max(3),
  reason: z.string().min(2).max(500),
  markVerified: z.boolean().optional(),
})

export async function POST(req: NextRequest, ctx2: { params: Promise<{ id: string }> }) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { flushAfterCommit, session, ip, userAgent } = built.data

  if (!coreAuth.hasAtLeast(session.payload.role, 'manager')) {
    return jsonError(403, 'forbidden', { required: 'manager' })
  }

  const { id } = await ctx2.params

  let parsed: z.infer<typeof body>
  try {
    parsed = body.parse(await req.json().catch(() => ({})))
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const db = getDb()
  const [player] = await db
    .select({
      id: schema.players.id,
      kycLevel: schema.players.kycLevel,
      kycVerifiedAt: schema.players.kycVerifiedAt,
    })
    .from(schema.players)
    .where(eq(schema.players.id, id))
    .limit(1)
  if (!player) return jsonError(404, 'player_not_found')

  // Promoting to L2 or L3 unlocks redemption — require master role.
  const isPromotion = parsed.kycLevel > player.kycLevel
  if (isPromotion && parsed.kycLevel >= 2 && session.payload.role !== 'master') {
    return jsonError(403, 'forbidden', {
      required: 'master',
      reason: 'Promoting to L2/L3 unlocks redemption — master-only override.',
    })
  }

  const now = new Date()
  const willVerify = parsed.markVerified ?? parsed.kycLevel >= 2
  const nextVerifiedAt = willVerify ? (player.kycVerifiedAt ?? now) : null

  await db
    .update(schema.players)
    .set({
      kycLevel: parsed.kycLevel,
      kycVerifiedAt: nextVerifiedAt,
      updatedAt: now,
    })
    .where(eq(schema.players.id, id))

  await audit.writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: session.admin.id,
    actorRole: session.payload.role,
    action: 'player.kyc_override',
    resourceKind: 'player',
    resourceId: id,
    before: {
      kyc_level: player.kycLevel,
      kyc_verified_at: player.kycVerifiedAt?.toISOString() ?? null,
    },
    after: {
      kyc_level: parsed.kycLevel,
      kyc_verified_at: nextVerifiedAt?.toISOString() ?? null,
    },
    reason: parsed.reason,
    ip,
    userAgent,
  })

  await flushAfterCommit()
  return NextResponse.json({
    ok: true,
    kycLevel: parsed.kycLevel,
    kycVerifiedAt: nextVerifiedAt?.toISOString() ?? null,
  })
}
