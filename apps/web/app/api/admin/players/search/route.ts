import { NextResponse, type NextRequest } from 'next/server'
import { and, eq, isNull, ilike, or, sql } from 'drizzle-orm'

import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { getAdminSession } from '@/lib/admin-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Admin player search — used by manual-award, send-message, and any
 * other "pick a player" picker that needs autocomplete.
 *
 * Accepts a single `q` param. Matches in this order:
 *   - exact UUID (no LIKE; deterministic single hit)
 *   - email prefix (lowercase index on email)
 *   - username prefix (lowercase index on username)
 *
 * Returns up to 10 matches, always excluding soft-deleted accounts.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2 && !UUID_RE.test(q)) {
    return NextResponse.json({ results: [] })
  }

  const db = getDb()

  // Exact UUID hit short-circuits the LIKE search.
  if (UUID_RE.test(q)) {
    const rows = await db
      .select({
        id: schema.players.id,
        email: schema.players.email,
        username: schema.players.username,
        displayName: schema.players.displayName,
        kycLevel: schema.players.kycLevel,
        status: schema.players.status,
      })
      .from(schema.players)
      .where(and(eq(schema.players.id, q), isNull(schema.players.deletedAt)))
      .limit(1)
    return NextResponse.json({ results: rows })
  }

  const lowered = q.toLowerCase()
  const pattern = `${lowered}%`

  const rows = await db
    .select({
      id: schema.players.id,
      email: schema.players.email,
      username: schema.players.username,
      displayName: schema.players.displayName,
      kycLevel: schema.players.kycLevel,
      status: schema.players.status,
    })
    .from(schema.players)
    .where(
      and(
        isNull(schema.players.deletedAt),
        or(
          // Prefix match on lower(email) — uses players_email_idx.
          sql`lower(${schema.players.email}) like ${pattern}`,
          sql`lower(${schema.players.username}) like ${pattern}`,
          ilike(schema.players.displayName, `${q}%`),
        ),
      ),
    )
    .limit(10)

  return NextResponse.json({ results: rows })
}
