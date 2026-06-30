import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'

import { buildAdminContext } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { ctx } = built.data

  const rows = await ctx.db.execute(sql`
    SELECT id, display_name AS "displayName", slug
    FROM game_providers
    WHERE status = 'active'
    ORDER BY display_name ASC
  `)
  return NextResponse.json({
    providers: (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      displayName: String(r.displayName),
      slug: String(r.slug),
    })),
  })
}
