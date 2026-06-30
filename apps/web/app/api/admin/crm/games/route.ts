import { NextResponse, type NextRequest } from 'next/server'

import { schema } from '@coinfrenzy/db'

import { buildAdminContext } from '@/lib/admin-route'
import { sql } from 'drizzle-orm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Lightweight game search/list — used by the SegmentBuilder's `played_game`
// picker and by anywhere we need a game-id autocomplete.

export async function GET(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { ctx } = built.data

  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim() ?? ''
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? 20)))

  const filter = q ? sql`AND g.display_name ILIKE ${'%' + q + '%'}` : sql``

  const rows = await ctx.db.execute(sql`
    SELECT g.id, g.display_name AS "displayName", g.category, gp.display_name AS "providerName"
    FROM ${schema.games} g
    JOIN game_providers gp ON gp.id = g.provider_id
    WHERE g.deleted_at IS NULL AND g.status = 'active'
    ${filter}
    ORDER BY g.display_name ASC
    LIMIT ${limit}
  `)

  return NextResponse.json({
    games: (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      displayName: String(r.displayName),
      category: String(r.category),
      providerName: String(r.providerName),
    })),
  })
}
