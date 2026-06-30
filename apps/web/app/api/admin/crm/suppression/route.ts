import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { desc, eq } from 'drizzle-orm'

import { canDeleteSuppression, canManageSuppression } from '@coinfrenzy/core/auth'
import { schema } from '@coinfrenzy/db'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/11 §7.2 — read + manage suppression list.

export async function GET(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response

  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 500)
  const offset = Number(url.searchParams.get('offset') ?? 0)

  const rows = await built.data.ctx.db
    .select()
    .from(schema.crmSuppression)
    .orderBy(desc(schema.crmSuppression.addedAt))
    .limit(limit)
    .offset(offset)

  return NextResponse.json({
    rows: rows.map((r) => ({
      emailOrPhone: r.emailOrPhone,
      reason: r.reason,
      source: r.source,
      addedAt: r.addedAt.toISOString(),
    })),
  })
}

const addSchema = z.object({
  emailOrPhone: z.string().min(3).max(320),
  reason: z.string().min(1).max(500),
  source: z.enum(['bounce', 'complaint', 'manual', 'unsubscribe', 'tcpa_stop']),
})

export async function POST(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response

  // docs/11 §7.4 — adding to the suppression list is compliance-significant
  // and gated to manager+. Support / marketing / cashier roles cannot add.
  if (!canManageSuppression(built.data.session.payload.role)) {
    return jsonError(403, 'manager_role_required')
  }

  let parsed: z.infer<typeof addSchema>
  try {
    parsed = addSchema.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  await built.data.ctx.db
    .insert(schema.crmSuppression)
    .values({
      emailOrPhone: parsed.emailOrPhone.toLowerCase(),
      reason: parsed.reason,
      source: parsed.source,
    })
    .onConflictDoNothing()

  return NextResponse.json({ added: true })
}

const removeSchema = z.object({ emailOrPhone: z.string().min(3).max(320) })

export async function DELETE(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response

  let parsed: z.infer<typeof removeSchema>
  try {
    parsed = removeSchema.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  // Master-admin only deletion per docs/11 §7.2.
  if (!canDeleteSuppression(built.data.session.payload.role)) {
    return jsonError(403, 'master_admin_required')
  }

  await built.data.ctx.db
    .delete(schema.crmSuppression)
    .where(eq(schema.crmSuppression.emailOrPhone, parsed.emailOrPhone.toLowerCase()))

  return NextResponse.json({ removed: true })
}
