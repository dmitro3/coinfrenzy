import { NextResponse, type NextRequest } from 'next/server'

import { migration } from '@coinfrenzy/core'
import { hasAtLeast } from '@coinfrenzy/core/auth'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/13 §5.1 — per-player balance spot-check. Used by the cutover
// runbook's "spot-check 20 random players" step.

export async function GET(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  if (!hasAtLeast(built.data.session.payload.role, 'master')) {
    return jsonError(403, 'forbidden')
  }

  const url = new URL(req.url)
  const snapshotDate = url.searchParams.get('date')
  if (!snapshotDate || !/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) {
    return jsonError(400, 'date_required', { format: 'YYYY-MM-DD' })
  }
  const limitRaw = url.searchParams.get('limit')
  const limit = limitRaw ? Math.min(parseInt(limitRaw, 10) || 25, 1000) : 25
  const driftOnly = url.searchParams.get('drift_only') === 'true'

  const result = await migration.compareBalances({
    ctx: built.data.ctx,
    snapshotDate,
    limit,
    driftOnly,
  })

  return NextResponse.json({ ok: true, result })
}
