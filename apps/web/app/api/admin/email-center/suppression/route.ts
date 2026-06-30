import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { and, asc, desc, eq, ilike, sql } from 'drizzle-orm'

import { audit as auditMod } from '@coinfrenzy/core'
import { canManageSuppression } from '@coinfrenzy/core/auth'
import { schema } from '@coinfrenzy/db'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SOURCE_OPTIONS = ['bounce', 'complaint', 'manual', 'unsubscribe', 'tcpa_stop'] as const

const querySchema = z.object({
  search: z.string().max(200).optional(),
  source: z.enum(SOURCE_OPTIONS).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
})

const postBody = z.object({
  emailOrPhone: z.string().min(3).max(200),
  reason: z.string().min(1).max(200),
  source: z.enum(SOURCE_OPTIONS).default('manual'),
})

export async function GET(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response

  const search = req.nextUrl.searchParams.get('search') ?? undefined
  const source = req.nextUrl.searchParams.get('source') ?? undefined
  const limitRaw = req.nextUrl.searchParams.get('limit')

  let parsed: z.infer<typeof querySchema>
  try {
    parsed = querySchema.parse({
      search,
      source,
      limit: limitRaw ?? undefined,
    })
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const conds = []
  if (parsed.search) {
    conds.push(ilike(schema.crmSuppression.emailOrPhone, `%${parsed.search}%`))
  }
  if (parsed.source) {
    conds.push(eq(schema.crmSuppression.source, parsed.source))
  }

  const rows = await built.data.ctx.db
    .select({
      emailOrPhone: schema.crmSuppression.emailOrPhone,
      reason: schema.crmSuppression.reason,
      source: schema.crmSuppression.source,
      addedAt: schema.crmSuppression.addedAt,
    })
    .from(schema.crmSuppression)
    .where(conds.length > 0 ? and(...conds) : sql`true`)
    .orderBy(desc(schema.crmSuppression.addedAt))
    .limit(parsed.limit)

  const totalRow = await built.data.ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.crmSuppression)
  const total = totalRow[0]?.n ?? 0

  // Source breakdown for the insights tiles.
  const breakdown = await built.data.ctx.db
    .select({
      source: schema.crmSuppression.source,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.crmSuppression)
    .groupBy(schema.crmSuppression.source)
    .orderBy(asc(schema.crmSuppression.source))

  return NextResponse.json({
    rows: rows.map((r) => ({ ...r, addedAt: r.addedAt.toISOString() })),
    total,
    breakdown: breakdown.reduce<Record<string, number>>((acc, b) => {
      acc[b.source] = b.n
      return acc
    }, {}),
  })
}

export async function POST(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  if (!canManageSuppression(built.data.session.payload.role)) {
    return jsonError(403, 'forbidden')
  }

  let parsed: z.infer<typeof postBody>
  try {
    parsed = postBody.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  await built.data.ctx.db
    .insert(schema.crmSuppression)
    .values({
      emailOrPhone: parsed.emailOrPhone.trim().toLowerCase(),
      reason: parsed.reason.trim(),
      source: parsed.source,
    })
    .onConflictDoUpdate({
      target: schema.crmSuppression.emailOrPhone,
      set: { reason: parsed.reason.trim(), source: parsed.source },
    })

  const actor = built.data.ctx.actor
  await auditMod.writeAuditEntry(built.data.ctx.db, {
    actorKind: 'admin',
    actorId: actor.kind === 'admin' ? actor.adminId : null,
    actorRole: actor.kind === 'admin' ? actor.role : null,
    action: 'crm.suppression.added',
    resourceKind: 'crm_suppression',
    resourceId: parsed.emailOrPhone.trim().toLowerCase(),
    after: { reason: parsed.reason, source: parsed.source },
    ip: actor.kind === 'admin' ? actor.ip : null,
    requestId: built.data.ctx.reqId,
  })
  await built.data.flushAfterCommit()

  return NextResponse.json({ ok: true })
}
