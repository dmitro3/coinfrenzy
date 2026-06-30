import 'server-only'

import { and, eq, gte, sql } from 'drizzle-orm'

import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

// Per-host activity stats for the host account page. Shown on
// /admin/account when the logged-in admin has role='host'. Counts
// interactions of every kind in the last 7d and 30d, plus VIP-coverage
// snapshot and total SC awarded.

export interface HostStats {
  vipCount: number
  newVipsThisWeek: number
  interactions7d: number
  interactions30d: number
  bonusesSent7d: number
  bonusesSent30d: number
  messagesSent30d: number
  scAwarded30dMinor: bigint
}

export async function fetchHostStats(hostId: string): Promise<HostStats> {
  const db = getDb()
  // Raw `sql` templates can't bind JS Date — use ISO strings + ::timestamptz.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()

  const [vipAgg] = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      newThisWeek: sql<number>`COUNT(*) FILTER (WHERE ${schema.players.hostAssignedAt} >= ${sevenDaysAgo}::timestamptz)::int`,
    })
    .from(schema.players)
    .where(eq(schema.players.assignedHostId, hostId))

  const [interactionAgg] = await db
    .select({
      total7d: sql<number>`COUNT(*) FILTER (WHERE ${schema.hostPlayerInteractions.createdAt} >= ${sevenDaysAgo}::timestamptz)::int`,
      total30d: sql<number>`COUNT(*) FILTER (WHERE ${schema.hostPlayerInteractions.createdAt} >= ${thirtyDaysAgo}::timestamptz)::int`,
      bonus7d: sql<number>`COUNT(*) FILTER (WHERE ${schema.hostPlayerInteractions.interactionType} = 'bonus_sent' AND ${schema.hostPlayerInteractions.createdAt} >= ${sevenDaysAgo}::timestamptz)::int`,
      bonus30d: sql<number>`COUNT(*) FILTER (WHERE ${schema.hostPlayerInteractions.interactionType} = 'bonus_sent' AND ${schema.hostPlayerInteractions.createdAt} >= ${thirtyDaysAgo}::timestamptz)::int`,
      message30d: sql<number>`COUNT(*) FILTER (WHERE ${schema.hostPlayerInteractions.interactionType} = 'message_sent' AND ${schema.hostPlayerInteractions.createdAt} >= ${thirtyDaysAgo}::timestamptz)::int`,
      scAwarded: sql<string>`COALESCE(SUM(CASE WHEN ${schema.hostPlayerInteractions.interactionType} = 'bonus_sent' AND ${schema.hostPlayerInteractions.createdAt} >= ${thirtyDaysAgo}::timestamptz THEN (metadata->>'sc_amount')::numeric ELSE 0 END), 0)::text`,
    })
    .from(schema.hostPlayerInteractions)
    .where(
      and(
        eq(schema.hostPlayerInteractions.hostId, hostId),
        gte(schema.hostPlayerInteractions.createdAt, new Date(thirtyDaysAgo)),
      ),
    )

  return {
    vipCount: vipAgg?.total ?? 0,
    newVipsThisWeek: vipAgg?.newThisWeek ?? 0,
    interactions7d: interactionAgg?.total7d ?? 0,
    interactions30d: interactionAgg?.total30d ?? 0,
    bonusesSent7d: interactionAgg?.bonus7d ?? 0,
    bonusesSent30d: interactionAgg?.bonus30d ?? 0,
    messagesSent30d: interactionAgg?.message30d ?? 0,
    scAwarded30dMinor: parseDecimalToBigint(interactionAgg?.scAwarded ?? '0'),
  }
}

function parseDecimalToBigint(raw: string): bigint {
  const integerPart = raw.split('.')[0] ?? '0'
  try {
    return BigInt(integerPart)
  } catch {
    return 0n
  }
}
