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

// docs/06 §12 — promo code admin CRUD. A promo code is bound to one
// bonus template (the "what they get") plus context/limits/window/blocks
// (the "how they get it"). The redeem path runs the same award() engine
// as every other bonus, just with promo-level overrides.

const CONTEXTS = ['signup', 'purchase', 'standalone'] as const

const createBody = z.object({
  code: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, 'code must be alphanumeric (+ _ or -)'),
  description: z.string().max(500).nullable().optional(),
  bonusId: z.string().uuid(),
  requiredContext: z.enum(CONTEXTS).nullable().optional(),
  // Either a positive integer cap, or null = unlimited.
  maxPerPlayer: z.number().int().min(0).max(10_000).nullable().optional(),
  maxTotalUses: z.number().int().min(0).max(10_000_000).nullable().optional(),
  validFrom: z.string().datetime().nullable().optional(),
  validUntil: z.string().datetime().nullable().optional(),
  // Per-code overrides (Advanced). Both nullable = inherit from template.
  playthroughMultiplier: z.number().min(0).max(100).nullable().optional(),
  playthroughWindowHours: z.number().int().min(1).max(8760).nullable().optional(),
  // Anti-abuse: lowercase domain strings, e.g. ["mailinator.com"].
  blockedEmailDomains: z.array(z.string().toLowerCase().max(253)).max(200).nullable().optional(),
})

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!canManageBonuses(session.payload.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let parsed: z.infer<typeof createBody>
  try {
    parsed = createBody.parse(await req.json())
  } catch (e) {
    return NextResponse.json(
      { error: 'invalid_input', details: e instanceof z.ZodError ? e.flatten() : undefined },
      { status: 400 },
    )
  }

  const db = getDb()

  // Verify the bonus template exists and is active.
  const [bonus] = await db
    .select({ id: schema.bonuses.id, status: schema.bonuses.status })
    .from(schema.bonuses)
    .where(eq(schema.bonuses.id, parsed.bonusId))
    .limit(1)
  if (!bonus) {
    return NextResponse.json({ error: 'bonus_not_found' }, { status: 404 })
  }

  const normalizedCode = parsed.code.toUpperCase()

  try {
    const [inserted] = await db
      .insert(schema.promoCodes)
      .values({
        code: normalizedCode,
        description: parsed.description ?? null,
        bonusId: parsed.bonusId,
        requiredContext: parsed.requiredContext ?? null,
        maxPerPlayer: parsed.maxPerPlayer ?? null,
        maxTotalUses: parsed.maxTotalUses ?? null,
        validFrom: parsed.validFrom ? new Date(parsed.validFrom) : null,
        validUntil: parsed.validUntil ? new Date(parsed.validUntil) : null,
        playthroughMultiplier:
          parsed.playthroughMultiplier != null ? parsed.playthroughMultiplier.toFixed(2) : null,
        playthroughWindowHours: parsed.playthroughWindowHours ?? null,
        blockedEmailDomains: parsed.blockedEmailDomains ?? null,
        status: 'active',
        createdBy: session.admin.id,
      })
      .returning({ id: schema.promoCodes.id })

    const meta = await getRequestMeta()
    await writeAuditEntry(db, {
      actorKind: 'admin',
      actorId: session.admin.id,
      actorRole: session.payload.role,
      action: 'admin.promo_code.created',
      resourceKind: 'promo_code',
      resourceId: inserted!.id,
      after: { ...parsed, code: normalizedCode },
      ip: meta.ip,
      userAgent: meta.userAgent,
    })

    return NextResponse.json({ id: inserted!.id })
  } catch (e) {
    if (e instanceof Error && /duplicate key value/i.test(e.message)) {
      return NextResponse.json({ error: 'code_taken' }, { status: 409 })
    }
    return NextResponse.json(
      { error: 'create_failed', details: e instanceof Error ? e.message : undefined },
      { status: 500 },
    )
  }
}
