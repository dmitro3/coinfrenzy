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

// docs/06 §16 — bonus template PATCH. The `slug` is immutable once created
// (it's the stable trigger handle). Status flips also pass through here.

const patchBody = z.object({
  displayName: z.string().min(1).max(120).optional(),
  bonusType: z
    .enum([
      'welcome',
      'tier_up',
      'weekly_tier',
      'monthly_tier',
      'package',
      'daily',
      'jackpot',
      'referral',
      'affiliate',
      'promotion',
      'amoe',
      'admin_added_sc',
      'crm_promocode',
      'purchase_promocode',
    ])
    .optional(),
  awardSc: z
    .string()
    .regex(/^-?\d+$/)
    .optional(),
  awardGc: z
    .string()
    .regex(/^-?\d+$/)
    .optional(),
  playthroughMultiplier: z.number().min(0).max(100).optional(),
  playthroughWindowHours: z.number().int().min(1).max(8760).nullable().optional(),
  minBetForContribution: z
    .string()
    .regex(/^-?\d+$/)
    .nullable()
    .optional(),
  maxBetDuringPlaythrough: z
    .string()
    .regex(/^-?\d+$/)
    .nullable()
    .optional(),
  maxPerPlayer: z.number().int().min(0).max(10_000).nullable().optional(),
  cooldownHours: z.number().int().min(0).max(8760).nullable().optional(),
  stackable: z.boolean().optional(),
  description: z.string().max(2000).nullable().optional(),
  terms: z.string().max(10_000).nullable().optional(),
  status: z.enum(['active', 'inactive', 'archived']).optional(),
})

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
  const beforeRows = await db
    .select()
    .from(schema.bonuses)
    .where(eq(schema.bonuses.id, id))
    .limit(1)
  const before = beforeRows[0]
  if (!before) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (parsed.displayName !== undefined) updates.displayName = parsed.displayName
  if (parsed.bonusType !== undefined) updates.bonusType = parsed.bonusType
  if (parsed.awardSc !== undefined) updates.awardSc = BigInt(parsed.awardSc)
  if (parsed.awardGc !== undefined) updates.awardGc = BigInt(parsed.awardGc)
  if (parsed.playthroughMultiplier !== undefined) {
    updates.playthroughMultiplier = parsed.playthroughMultiplier.toFixed(2)
  }
  if (parsed.playthroughWindowHours !== undefined) {
    updates.playthroughWindowHours = parsed.playthroughWindowHours
  }
  if (parsed.minBetForContribution !== undefined) {
    updates.minBetForContribution = parsed.minBetForContribution
      ? BigInt(parsed.minBetForContribution)
      : null
  }
  if (parsed.maxBetDuringPlaythrough !== undefined) {
    updates.maxBetDuringPlaythrough = parsed.maxBetDuringPlaythrough
      ? BigInt(parsed.maxBetDuringPlaythrough)
      : null
  }
  if (parsed.maxPerPlayer !== undefined) updates.maxPerPlayer = parsed.maxPerPlayer
  if (parsed.cooldownHours !== undefined) updates.cooldownHours = parsed.cooldownHours
  if (parsed.stackable !== undefined) updates.stackable = parsed.stackable
  if (parsed.description !== undefined) updates.description = parsed.description
  if (parsed.terms !== undefined) updates.terms = parsed.terms
  if (parsed.status !== undefined) updates.status = parsed.status

  await db.update(schema.bonuses).set(updates).where(eq(schema.bonuses.id, id))

  const meta = await getRequestMeta()
  await writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: session.admin.id,
    actorRole: session.payload.role,
    action: 'admin.bonus.template_updated',
    resourceKind: 'bonus_template',
    resourceId: id,
    before: {
      displayName: before.displayName,
      bonusType: before.bonusType,
      awardSc: before.awardSc.toString(),
      awardGc: before.awardGc.toString(),
      playthroughMultiplier: before.playthroughMultiplier,
      playthroughWindowHours: before.playthroughWindowHours,
      status: before.status,
      stackable: before.stackable,
    },
    after: parsed,
    ip: meta.ip,
    userAgent: meta.userAgent,
  })

  return NextResponse.json({ ok: true })
}
