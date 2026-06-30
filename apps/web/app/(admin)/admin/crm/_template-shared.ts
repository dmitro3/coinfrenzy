import 'server-only'

import { sql } from 'drizzle-orm'

import { getDb } from '@coinfrenzy/db/client'

export interface SamplePlayer {
  id: string
  email: string
  displayName: string | null
}

/**
 * Three "interesting" players spanning the spectrum — used by template
 * editors and campaign wizard live preview to render against real data.
 */
export async function listSamplePlayers(): Promise<SamplePlayer[]> {
  const db = getDb()
  const rows = (await db.execute(sql`
    WITH ranked AS (
      SELECT
        p.id,
        p.email,
        COALESCE(p.first_name || ' ' || p.last_name, p.username) AS display_name,
        COALESCE(t.total_deposited_usd, 0) AS spend,
        ROW_NUMBER() OVER (ORDER BY t.total_deposited_usd DESC NULLS LAST) AS r_high,
        ROW_NUMBER() OVER (ORDER BY t.total_deposited_usd ASC NULLS LAST) AS r_low,
        ROW_NUMBER() OVER (ORDER BY p.created_at DESC) AS r_recent
      FROM players p
      LEFT JOIN player_lifetime_stats t ON t.player_id = p.id
      WHERE p.email IS NOT NULL
    )
    SELECT id, email, display_name
    FROM ranked
    WHERE r_high <= 1 OR r_recent <= 1 OR r_low <= 1
    LIMIT 3
  `)) as unknown as Array<Record<string, unknown>>
  return rows.map((r) => ({
    id: String(r.id),
    email: String(r.email),
    displayName: (r.display_name as string | null) ?? null,
  }))
}
