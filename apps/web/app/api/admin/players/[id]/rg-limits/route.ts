import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { audit, auth as coreAuth } from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/09 §3.5 — responsible-gaming limits.
//
// Lets a manager-or-above admin set, raise, or LOWER a player's RG
// deposit and session limits. Raising a limit goes into a 24h
// cooling-off window per industry best practice — the new limit is
// staged in `rg_pending_limit_changes` and applied by the cooling-off
// cron. LOWERING a limit takes effect immediately (always safer).
//
// Self-exclusion is handled via the separate /self-exclusion endpoints
// in the same folder.

const moneyBigint = z.union([z.string(), z.number(), z.null()]).transform((v): bigint | null => {
  if (v === null) return null
  const s = typeof v === 'number' ? v.toString() : v.trim()
  if (s === '') return null
  // Accept either minor-unit integers (e.g. '1000000') or decimal majors ('100.00').
  if (s.includes('.')) {
    const [maj = '0', frac = ''] = s.split('.')
    const fracPadded = frac.padEnd(4, '0').slice(0, 4)
    return BigInt(maj) * 10_000n + BigInt(fracPadded || '0')
  }
  return BigInt(s)
})

const body = z.object({
  depositDaily: moneyBigint.optional(),
  depositWeekly: moneyBigint.optional(),
  depositMonthly: moneyBigint.optional(),
  sessionMinutes: z.union([z.number().int().positive(), z.null()]).optional(),
  reason: z.string().trim().min(3).max(500),
})

const COOLING_OFF_MS = 24 * 60 * 60 * 1000

export async function PUT(req: NextRequest, ctx2: { params: Promise<{ id: string }> }) {
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
  const [player] = await db.select().from(schema.players).where(eq(schema.players.id, id)).limit(1)
  if (!player) return jsonError(404, 'player_not_found')

  // Pending changes object structure:
  // { effectiveAt: ISO, depositDaily?, depositWeekly?, depositMonthly?, sessionMinutes? }
  const pending: Record<string, string | number | null> = {}
  const immediate: Partial<typeof schema.players.$inferInsert> = {}
  const before: Record<string, unknown> = {
    depositDaily: player.rgDepositLimitDaily?.toString() ?? null,
    depositWeekly: player.rgDepositLimitWeekly?.toString() ?? null,
    depositMonthly: player.rgDepositLimitMonthly?.toString() ?? null,
    sessionMinutes: player.rgSessionLimitMin,
  }
  const after: Record<string, unknown> = {}

  function applyLimit(
    name: 'depositDaily' | 'depositWeekly' | 'depositMonthly',
    incoming: bigint | null | undefined,
    currentRaw: bigint | null,
    column: 'rgDepositLimitDaily' | 'rgDepositLimitWeekly' | 'rgDepositLimitMonthly',
  ) {
    if (incoming === undefined) return
    const current = currentRaw
    const lowering = incoming !== null && (current === null || incoming < current)
    const raising = incoming !== null && current !== null && incoming > current
    if (incoming === null || lowering) {
      // Removing or tightening — immediate.
      immediate[column] = incoming as bigint | null as never
      after[name] = incoming === null ? null : incoming.toString()
    } else if (raising) {
      pending[name] = incoming.toString()
      after[name] = `pending: ${incoming.toString()}`
    } else if (current === null) {
      // First-ever limit — immediate.
      immediate[column] = incoming as bigint | null as never
      after[name] = incoming.toString()
    }
  }

  applyLimit('depositDaily', parsed.depositDaily, player.rgDepositLimitDaily, 'rgDepositLimitDaily')
  applyLimit(
    'depositWeekly',
    parsed.depositWeekly,
    player.rgDepositLimitWeekly,
    'rgDepositLimitWeekly',
  )
  applyLimit(
    'depositMonthly',
    parsed.depositMonthly,
    player.rgDepositLimitMonthly,
    'rgDepositLimitMonthly',
  )

  if (parsed.sessionMinutes !== undefined) {
    const current = player.rgSessionLimitMin
    const incoming = parsed.sessionMinutes
    if (incoming === null || (current !== null && incoming < current) || current === null) {
      immediate.rgSessionLimitMin = incoming as number | null as never
      after.sessionMinutes = incoming
    } else if (current !== null && incoming > current) {
      pending.sessionMinutes = incoming
      after.sessionMinutes = `pending: ${incoming}`
    }
  }

  if (Object.keys(pending).length > 0) {
    immediate.rgPendingLimitChanges = {
      effectiveAt: new Date(Date.now() + COOLING_OFF_MS).toISOString(),
      ...pending,
    } as never
  }

  if (Object.keys(immediate).length === 0) {
    return NextResponse.json({ ok: true, noChange: true })
  }

  immediate.updatedAt = new Date() as never

  await db.update(schema.players).set(immediate).where(eq(schema.players.id, id))

  await audit.writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: session.admin.id,
    actorRole: session.payload.role,
    action: 'player.rg_limits.update',
    resourceKind: 'player',
    resourceId: id,
    before,
    after,
    reason: parsed.reason,
    ip,
    userAgent,
  })

  await flushAfterCommit()
  return NextResponse.json({
    ok: true,
    immediate: Object.keys(immediate).filter((k) => k.startsWith('rg')),
    pendingApplied: Object.keys(pending),
  })
}
