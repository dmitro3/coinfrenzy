import { NextResponse, type NextRequest } from 'next/server'
import { eq } from 'drizzle-orm'

import * as schema from '@coinfrenzy/db/schema'

import { buildAdminContext } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/12 §7 — fetch a single export's status. Used by the UI to poll for
// completion after POST /api/admin/exports.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response

  const { id } = await params
  const [row] = await built.data.ctx.db
    .select()
    .from(schema.dataExports)
    .where(eq(schema.dataExports.id, id))
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  return NextResponse.json({
    id: row.id,
    exportType: row.exportType,
    status: row.status,
    rowCount: row.rowCount,
    sizeBytes: row.sizeBytes != null ? row.sizeBytes.toString() : null,
    downloadUrl: row.downloadUrl,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  })
}
