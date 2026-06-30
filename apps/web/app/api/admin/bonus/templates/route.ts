import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { canManageBonuses } from '@coinfrenzy/core/auth'
import { writeAuditEntry } from '@coinfrenzy/core/audit'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { getAdminSession, getRequestMeta } from '@/lib/admin-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/06 §16 / docs/08 §8 — admin bonus template CRUD. POST = create.
// PATCH lives in `./[id]/route.ts`.

const BONUS_TYPES = [
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
] as const

const upsertBody = z.object({
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9_-]+$/, 'slug must be lowercase alphanumeric (+_-)'),
  displayName: z.string().min(1).max(120),
  bonusType: z.enum(BONUS_TYPES),
  awardSc: z.string().regex(/^-?\d+$/),
  awardGc: z.string().regex(/^-?\d+$/),
  playthroughMultiplier: z.number().min(0).max(100),
  playthroughWindowHours: z.number().int().min(1).max(8760).nullable(),
  minBetForContribution: z
    .string()
    .regex(/^-?\d+$/)
    .nullable(),
  maxBetDuringPlaythrough: z
    .string()
    .regex(/^-?\d+$/)
    .nullable(),
  maxPerPlayer: z.number().int().min(0).max(10_000).nullable(),
  cooldownHours: z.number().int().min(0).max(8760).nullable(),
  stackable: z.boolean(),
  description: z.string().max(2000).nullable(),
  terms: z.string().max(10_000).nullable(),
})

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canManageBonuses(session.payload.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let parsed: z.infer<typeof upsertBody>
  try {
    parsed = upsertBody.parse(await req.json())
  } catch (e) {
    return NextResponse.json(
      { error: 'invalid_input', details: e instanceof z.ZodError ? e.flatten() : undefined },
      { status: 400 },
    )
  }

  const db = getDb()
  try {
    const [inserted] = await db
      .insert(schema.bonuses)
      .values({
        slug: parsed.slug,
        displayName: parsed.displayName,
        bonusType: parsed.bonusType,
        awardSc: BigInt(parsed.awardSc),
        awardGc: BigInt(parsed.awardGc),
        playthroughMultiplier: parsed.playthroughMultiplier.toFixed(2),
        playthroughWindowHours: parsed.playthroughWindowHours,
        minBetForContribution: parsed.minBetForContribution
          ? BigInt(parsed.minBetForContribution)
          : null,
        maxBetDuringPlaythrough: parsed.maxBetDuringPlaythrough
          ? BigInt(parsed.maxBetDuringPlaythrough)
          : null,
        maxPerPlayer: parsed.maxPerPlayer ?? null,
        cooldownHours: parsed.cooldownHours ?? null,
        stackable: parsed.stackable,
        description: parsed.description,
        terms: parsed.terms,
        status: 'active',
      })
      .returning({ id: schema.bonuses.id })

    const meta = await getRequestMeta()
    await writeAuditEntry(db, {
      actorKind: 'admin',
      actorId: session.admin.id,
      actorRole: session.payload.role,
      action: 'admin.bonus.template_created',
      resourceKind: 'bonus_template',
      resourceId: inserted!.id,
      after: { ...parsed, awardSc: parsed.awardSc, awardGc: parsed.awardGc },
      ip: meta.ip,
      userAgent: meta.userAgent,
    })

    return NextResponse.json({ id: inserted!.id })
  } catch (e) {
    if (e instanceof Error && /duplicate key value/i.test(e.message)) {
      return NextResponse.json({ error: 'slug_taken' }, { status: 409 })
    }
    return NextResponse.json(
      { error: 'create_failed', details: e instanceof Error ? e.message : undefined },
      { status: 500 },
    )
  }
}
