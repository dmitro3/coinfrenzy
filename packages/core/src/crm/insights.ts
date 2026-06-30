// docs/11 §3 — segment "smart suggestions".
//
// Fast, descriptive analyses that run on demand against a segment's
// member set. The goal is to help the operator validate that the
// segment captures the players they intended:
//
//   "Mostly Florida players (62%)"
//   "Avg lifetime spend: $247"
//   "70% played in last 7 days"
//   "Common favorite category: slots"
//
// Each insight is a one-shot aggregate query over the compiled segment,
// scoped to the matching player ids subquery. The implementation
// intentionally uses correlated SQL: the compiler hands us a parameterized
// SELECT, and we wrap it in `WHERE p.id IN (<segment>)` for each insight.

import { compile, type CompiledSegment } from './compiler'
import type { FilterTree } from './filter-tree'
import { err, ok, type Result } from '../errors/result'
import type { Context } from '../context'

export type InsightTone = 'neutral' | 'positive' | 'attention' | 'critical'

export interface SegmentInsight {
  label: string
  value: string
  tone?: InsightTone
}

export type InsightsError = { code: 'INVALID_TREE'; details: unknown } | { code: 'EMPTY_SEGMENT' }

interface InsightRow {
  total: number
  active7d: number
  active30d: number
  whales: number
  avgSpendCents: number | null
  avgLifetimeBets: number | null
  topState: string | null
  topStateCount: number | null
  topCategory: string | null
  emailConsentPct: number | null
  smsConsentPct: number | null
  newPlayers7d: number
  dormant30d: number
}

export async function generateInsights(
  ctx: Context,
  tree: FilterTree | unknown,
): Promise<Result<{ insights: SegmentInsight[]; total: number }, InsightsError>> {
  let compiled: CompiledSegment
  try {
    compiled = compile(tree, { mode: 'fetch' })
  } catch (e) {
    return err({ code: 'INVALID_TREE' as const, details: e instanceof Error ? e.message : e })
  }

  // Wrap the segment SELECT as a CTE and run a single roll-up query.
  // We could split into multiple roundtrips for clarity but at ~200
  // players the planner handles this fine and the latency win matters
  // (the panel rerenders on every condition tweak).
  const innerSql = compiled.sql
  const aggSql = `
    WITH segment_ids AS (${innerSql})
    SELECT
      COUNT(*)::int AS total,
      SUM(CASE WHEN p.last_login_at >= NOW() - INTERVAL '7 days' THEN 1 ELSE 0 END)::int AS active7d,
      SUM(CASE WHEN p.last_login_at >= NOW() - INTERVAL '30 days' THEN 1 ELSE 0 END)::int AS active30d,
      SUM(CASE WHEN coalesce(pls.total_deposited_usd, 0) > 10000 THEN 1 ELSE 0 END)::int AS whales,
      AVG(coalesce(pls.total_deposited_usd, 0))::float AS "avgSpendCents",
      AVG(coalesce(pls.round_count, 0))::float AS "avgLifetimeBets",
      (SELECT s.state FROM (
         SELECT p2.state, COUNT(*) c FROM players p2 WHERE p2.id IN (SELECT id FROM segment_ids) AND p2.state IS NOT NULL GROUP BY p2.state ORDER BY c DESC LIMIT 1
      ) s) AS "topState",
      (SELECT c FROM (
         SELECT p2.state, COUNT(*) c FROM players p2 WHERE p2.id IN (SELECT id FROM segment_ids) AND p2.state IS NOT NULL GROUP BY p2.state ORDER BY c DESC LIMIT 1
      ) s) AS "topStateCount",
      (SELECT g.category FROM (
         SELECT g2.category, SUM(pgs2.total_bet_sc) wager FROM player_game_stats pgs2 JOIN games g2 ON g2.id = pgs2.game_id WHERE pgs2.player_id IN (SELECT id FROM segment_ids) GROUP BY g2.category ORDER BY wager DESC LIMIT 1
      ) g) AS "topCategory",
      (SUM(CASE WHEN p.email_consent THEN 1 ELSE 0 END)::float * 100.0 / NULLIF(COUNT(*),0))::float AS "emailConsentPct",
      (SUM(CASE WHEN p.sms_consent   THEN 1 ELSE 0 END)::float * 100.0 / NULLIF(COUNT(*),0))::float AS "smsConsentPct",
      SUM(CASE WHEN p.created_at >= NOW() - INTERVAL '7 days' THEN 1 ELSE 0 END)::int AS "newPlayers7d",
      SUM(CASE WHEN (p.last_login_at IS NULL OR p.last_login_at < NOW() - INTERVAL '30 days') THEN 1 ELSE 0 END)::int AS "dormant30d"
    FROM players p
    LEFT JOIN player_lifetime_stats pls ON pls.player_id = p.id
    WHERE p.id IN (SELECT id FROM segment_ids)
  `

  const rows = await runRawSelect<InsightRow>(ctx, aggSql, compiled.params)
  const row = rows[0]
  if (!row || row.total === 0) {
    return ok({ insights: [], total: 0 })
  }

  const insights: SegmentInsight[] = []
  insights.push({
    label: 'Active in last 7 days',
    value: pct(row.active7d, row.total),
    tone: row.active7d / row.total > 0.5 ? 'positive' : 'neutral',
  })
  if (row.avgSpendCents !== null) {
    insights.push({
      label: 'Avg lifetime spend',
      value: `$${formatNumber(row.avgSpendCents)}`,
      tone: 'neutral',
    })
  }
  if (row.topState && row.topStateCount) {
    insights.push({
      label: `Top state — ${row.topState}`,
      value: `${pct(row.topStateCount, row.total)} of segment`,
      tone: 'neutral',
    })
  }
  if (row.topCategory) {
    insights.push({
      label: 'Top game category',
      value: prettyCategory(row.topCategory),
      tone: 'neutral',
    })
  }
  if (row.whales > 0) {
    insights.push({
      label: 'Whales (>$10k)',
      value: `${row.whales.toLocaleString()} (${pct(row.whales, row.total)})`,
      tone: 'positive',
    })
  }
  if (row.emailConsentPct !== null) {
    insights.push({
      label: 'Email-reachable',
      value: `${Math.round(row.emailConsentPct)}%`,
      tone: row.emailConsentPct < 50 ? 'attention' : 'positive',
    })
  }
  if (row.dormant30d > 0) {
    insights.push({
      label: 'Dormant 30d+',
      value: `${row.dormant30d.toLocaleString()} (${pct(row.dormant30d, row.total)})`,
      tone: row.dormant30d / row.total > 0.5 ? 'critical' : 'attention',
    })
  }
  if (row.newPlayers7d > 0) {
    insights.push({
      label: 'New players this week',
      value: row.newPlayers7d.toLocaleString(),
      tone: 'positive',
    })
  }

  return ok({ insights, total: row.total })
}

function pct(n: number, total: number): string {
  if (total <= 0) return '0%'
  const p = (n / total) * 100
  if (p < 1) return '<1%'
  return `${Math.round(p)}%`
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '0'
  if (Math.abs(n) >= 1000) {
    return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
  }
  return n.toFixed(2)
}

function prettyCategory(c: string): string {
  if (c === 'live') return 'Live dealer'
  if (c === 'instant') return 'Instant'
  return c.charAt(0).toUpperCase() + c.slice(1)
}

async function runRawSelect<T>(
  ctx: Context,
  rawSql: string,
  params: Array<string | number | boolean | null>,
): Promise<T[]> {
  type DbWithClient = {
    _: { session: { client: { unsafe: (q: string, p: unknown[]) => Promise<unknown[]> } } }
  }
  const dbAny = ctx.db as unknown as DbWithClient
  const client = dbAny._?.session?.client
  if (client && typeof client.unsafe === 'function') {
    const rows = await client.unsafe(rawSql, params)
    return rows as T[]
  }
  // Fallback used in tests.
  const { sql } = await import('drizzle-orm')
  const result = await ctx.db.execute(sql.raw(substituteParams(rawSql, params)))
  return result as unknown as T[]
}

function substituteParams(raw: string, params: Array<string | number | boolean | null>): string {
  return raw.replace(/\$(\d+)/g, (_, n) => {
    const v = params[Number(n) - 1]
    if (v === null) return 'NULL'
    if (typeof v === 'number') return String(v)
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
    return `'${String(v).replace(/'/g, "''")}'`
  })
}
