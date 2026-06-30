import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { canManageBonuses } from '@coinfrenzy/core/auth'
import { writeAuditEntry } from '@coinfrenzy/core/audit'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { getAdminSession, getRequestMeta } from '@/lib/admin-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/06 §12 — promo code PATCH. The `code` itself is immutable once
// created (it's the stable handle players type). Status flips and config
// edits go through here.

const CONTEXTS = ['signup', 'purchase', 'standalone'] as const
const STATUSES = ['active', 'inactive', 'archived'] as const

const patchBody = z
  .object({
    description: z.string().max(500).nullable().optional(),
    bonusId: z.string().uuid().optional(),
    requiredContext: z.enum(CONTEXTS).nullable().optional(),
    maxPerPlayer: z.number().int().min(0).max(10_000).nullable().optional(),
    maxTotalUses: z.number().int().min(0).max(10_000_000).nullable().optional(),
    validFrom: z.string().datetime().nullable().optional(),
    validUntil: z.string().datetime().nullable().optional(),
    playthroughMultiplier: z.number().min(0).max(100).nullable().optional(),
    playthroughWindowHours: z.number().int().min(1).max(8760).nullable().optional(),
    blockedEmailDomains: z.array(z.string().toLowerCase().max(253)).max(200).nullable().optional(),
    status: z.enum(STATUSES).optional(),
  })
  .strict()

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canManageBonuses(session.payload.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params

  let parsed: z.infer<typeof patchBody>
  try {
    parsed = patchBody.parse(await req.json())
  } catch (e) {
    return NextResponse.json(
      { error: 'invalid_input', details: e instanceof z.ZodError ? e.flatten() : undefined },
      { status: 400 },
    )
  }

  const db = getDb()
  const [before] = await db
    .select()
    .from(schema.promoCodes)
    .where(eq(schema.promoCodes.id, id))
    .limit(1)
  if (!before) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  if (parsed.bonusId) {
    const [bonus] = await db
      .select({ id: schema.bonuses.id })
      .from(schema.bonuses)
      .where(eq(schema.bonuses.id, parsed.bonusId))
      .limit(1)
    if (!bonus) return NextResponse.json({ error: 'bonus_not_found' }, { status: 404 })
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (parsed.description !== undefined) updates.description = parsed.description
  if (parsed.bonusId !== undefined) updates.bonusId = parsed.bonusId
  if (parsed.requiredContext !== undefined) updates.requiredContext = parsed.requiredContext
  if (parsed.maxPerPlayer !== undefined) updates.maxPerPlayer = parsed.maxPerPlayer
  if (parsed.maxTotalUses !== undefined) updates.maxTotalUses = parsed.maxTotalUses
  if (parsed.validFrom !== undefined) {
    updates.validFrom = parsed.validFrom ? new Date(parsed.validFrom) : null
  }
  if (parsed.validUntil !== undefined) {
    updates.validUntil = parsed.validUntil ? new Date(parsed.validUntil) : null
  }
  if (parsed.playthroughMultiplier !== undefined) {
    updates.playthroughMultiplier =
      parsed.playthroughMultiplier != null ? parsed.playthroughMultiplier.toFixed(2) : null
  }
  if (parsed.playthroughWindowHours !== undefined) {
    updates.playthroughWindowHours = parsed.playthroughWindowHours
  }
  if (parsed.blockedEmailDomains !== undefined) {
    updates.blockedEmailDomains = parsed.blockedEmailDomains
  }
  if (parsed.status !== undefined) updates.status = parsed.status

  await db.update(schema.promoCodes).set(updates).where(eq(schema.promoCodes.id, id))

  const action =
    parsed.status && parsed.status !== before.status
      ? parsed.status === 'archived'
        ? 'admin.promo_code.archived'
        : parsed.status === 'inactive'
          ? 'admin.promo_code.disabled'
          : 'admin.promo_code.activated'
      : 'admin.promo_code.updated'

  const meta = await getRequestMeta()
  await writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: session.admin.id,
    actorRole: session.payload.role,
    action,
    resourceKind: 'promo_code',
    resourceId: id,
    before: {
      status: before.status,
      bonusId: before.bonusId,
      requiredContext: before.requiredContext,
      maxPerPlayer: before.maxPerPlayer,
      maxTotalUses: before.maxTotalUses,
      validFrom: before.validFrom?.toISOString() ?? null,
      validUntil: before.validUntil?.toISOString() ?? null,
    },
    after: { ...parsed },
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  return NextResponse.json({ ok: true })
}
