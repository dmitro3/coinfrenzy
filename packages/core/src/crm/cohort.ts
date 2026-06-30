// docs/11 §3 + §12 — cohort analysis service.
//
// Given a segment (filter tree), bucket members by their signup week
// and compute retention / LTV / activity metrics over time. Powers
// /admin/crm/cohorts and the segment detail page's cohort tab.
//
// The output shape is intentionally chart-friendly: we hand back a
// matrix of `{ cohortWeek, weeksSinceSignup, value }` rows that the UI
// can pivot into either a heatmap or per-cohort line chart.

import { compile, type CompiledSegment } from './compiler'
import type { FilterTree } from './filter-tree'
import { err, ok, type Result } from '../errors/result'
import type { Context } from '../context'

export type CohortMetric = 'retention' | 'ltv' | 'activity' | 'revenue'

export interface CohortCellData {
  /** ISO date of the start of the signup-week (Monday). */
  cohortWeek: string
  /** 0 = signup week, 1 = first week after, ... */
  weeksSinceSignup: number
  /** Raw count or numeric value depending on metric. */
  value: number
}

export interface CohortKpiTiles {
  totalInCohort: number
  active7d: number
  active30d: number
  active90d: number
  ltvWeek0: number
  ltvWeek4: number
  ltvWeek12: number
  ltvWeek26: number
  churnRate: number
}

export interface CohortAnalysis {
  metric: CohortMetric
  windowDays: number
  cells: CohortCellData[]
  /** Total players considered (size of the segment after window cutoff). */
  total: number
  kpis: CohortKpiTiles
}

export type CohortError = { code: 'INVALID_TREE'; details: unknown }

export async function analyseCohort(
  ctx: Context,
  tree: FilterTree | unknown,
  opts: { metric: CohortMetric; windowDays: number },
): Promise<Result<CohortAnalysis, CohortError>> {
  const { metric, windowDays } = opts
  let compiled: CompiledSegment
  try {
    compiled = compile(tree, { mode: 'fetch' })
  } catch (e) {
    return err({ code: 'INVALID_TREE' as const, details: e instanceof Error ? e.message : e })
  }

  const innerSql = compiled.sql

  // Choose the metric expression. Each one resolves a per-(cohort_week,
  // weeks_since_signup) numeric value. Activity = login event count;
  // retention = distinct active players / cohort size; revenue = total
  // purchases USD; ltv = cumulative purchases USD per player.
  const metricSql = buildMetricSql(metric)

  const sqlText = `
    WITH segment_ids AS (${innerSql}),
    cohort AS (
      SELECT
        p.id,
        date_trunc('week', p.created_at)::date AS cohort_week
      FROM players p
      WHERE p.id IN (SELECT id FROM segment_ids)
        AND p.created_at >= NOW() - $${compiled.params.length + 1} * INTERVAL '1 day'
    ),
    cohort_sizes AS (
      SELECT cohort_week, COUNT(*)::int AS cohort_size FROM cohort GROUP BY cohort_week
    )
    ${metricSql}
  `

  const params: Array<string | number | boolean | null> = [...compiled.params, windowDays]
  const cells = await runRawSelect<{
    cohortWeek: string
    weeksSinceSignup: number
    value: number
  }>(ctx, sqlText, params)

  const totalRow = await runRawSelect<{ total: number }>(
    ctx,
    `WITH segment_ids AS (${innerSql}) SELECT COUNT(*)::int AS total FROM segment_ids`,
    compiled.params,
  )

  const kpiSql = `
    WITH segment_ids AS (${innerSql})
    SELECT
      COUNT(*)::int AS "totalInCohort",
      SUM(CASE WHEN p.last_login_at >= NOW() - INTERVAL '7 days'  THEN 1 ELSE 0 END)::int AS "active7d",
      SUM(CASE WHEN p.last_login_at >= NOW() - INTERVAL '30 days' THEN 1 ELSE 0 END)::int AS "active30d",
      SUM(CASE WHEN p.last_login_at >= NOW() - INTERVAL '90 days' THEN 1 ELSE 0 END)::int AS "active90d",
      AVG(CASE WHEN AGE(NOW(), p.created_at) >= INTERVAL  '0 days' THEN coalesce((SELECT SUM(amount_usd) FROM purchases pu WHERE pu.player_id = p.id AND pu.status = 'succeeded'),0) END)::float AS "ltvWeek0",
      AVG(CASE WHEN AGE(NOW(), p.created_at) >= INTERVAL '28 days' THEN coalesce((SELECT SUM(amount_usd) FROM purchases pu WHERE pu.player_id = p.id AND pu.status = 'succeeded' AND pu.created_at <= p.created_at + INTERVAL '28 days'),0) END)::float AS "ltvWeek4",
      AVG(CASE WHEN AGE(NOW(), p.created_at) >= INTERVAL '84 days' THEN coalesce((SELECT SUM(amount_usd) FROM purchases pu WHERE pu.player_id = p.id AND pu.status = 'succeeded' AND pu.created_at <= p.created_at + INTERVAL '84 days'),0) END)::float AS "ltvWeek12",
      AVG(CASE WHEN AGE(NOW(), p.created_at) >= INTERVAL '182 days' THEN coalesce((SELECT SUM(amount_usd) FROM purchases pu WHERE pu.player_id = p.id AND pu.status = 'succeeded' AND pu.created_at <= p.created_at + INTERVAL '182 days'),0) END)::float AS "ltvWeek26",
      (SUM(CASE WHEN (p.last_login_at IS NULL OR p.last_login_at < NOW() - INTERVAL '60 days') THEN 1 ELSE 0 END)::float * 100.0 / NULLIF(COUNT(*),0))::float AS "churnRate"
    FROM players p
    WHERE p.id IN (SELECT id FROM segment_ids)
  `

  const kpiRow = (
    await runRawSelect<{
      totalInCohort: number
      active7d: number
      active30d: number
      active90d: number
      ltvWeek0: number | null
      ltvWeek4: number | null
      ltvWeek12: number | null
      ltvWeek26: number | null
      churnRate: number | null
    }>(ctx, kpiSql, compiled.params)
  )[0] ?? {
    totalInCohort: 0,
    active7d: 0,
    active30d: 0,
    active90d: 0,
    ltvWeek0: 0,
    ltvWeek4: 0,
    ltvWeek12: 0,
    ltvWeek26: 0,
    churnRate: 0,
  }

  return ok({
    metric,
    windowDays,
    total: totalRow[0]?.total ?? 0,
    cells: cells.map((c) => ({
      cohortWeek: c.cohortWeek,
      weeksSinceSignup: Number(c.weeksSinceSignup),
      value: Number(c.value),
    })),
    kpis: {
      totalInCohort: Number(kpiRow.totalInCohort ?? 0),
      active7d: Number(kpiRow.active7d ?? 0),
      active30d: Number(kpiRow.active30d ?? 0),
      active90d: Number(kpiRow.active90d ?? 0),
      ltvWeek0: Number(kpiRow.ltvWeek0 ?? 0),
      ltvWeek4: Number(kpiRow.ltvWeek4 ?? 0),
      ltvWeek12: Number(kpiRow.ltvWeek12 ?? 0),
      ltvWeek26: Number(kpiRow.ltvWeek26 ?? 0),
      churnRate: Number(kpiRow.churnRate ?? 0),
    },
  })
}

function buildMetricSql(metric: CohortMetric): string {
  switch (metric) {
    case 'retention':
      return `
        SELECT
          to_char(c.cohort_week, 'YYYY-MM-DD') AS "cohortWeek",
          GREATEST(0, FLOOR(EXTRACT(DAY FROM (pe.created_at - c.cohort_week)) / 7))::int AS "weeksSinceSignup",
          ROUND(COUNT(DISTINCT pe.player_id) * 100.0 / NULLIF(cs.cohort_size, 0), 2)::float AS value
        FROM cohort c
        JOIN cohort_sizes cs ON cs.cohort_week = c.cohort_week
        LEFT JOIN player_events pe ON pe.player_id = c.id AND pe.event_name = 'player.login' AND pe.created_at >= c.cohort_week
        GROUP BY c.cohort_week, cs.cohort_size, "weeksSinceSignup"
        ORDER BY c.cohort_week, "weeksSinceSignup"`
    case 'activity':
      return `
        SELECT
          to_char(c.cohort_week, 'YYYY-MM-DD') AS "cohortWeek",
          GREATEST(0, FLOOR(EXTRACT(DAY FROM (gr.created_at - c.cohort_week)) / 7))::int AS "weeksSinceSignup",
          COUNT(*)::float AS value
        FROM cohort c
        LEFT JOIN game_rounds gr ON gr.player_id = c.id AND gr.created_at >= c.cohort_week
        GROUP BY c.cohort_week, "weeksSinceSignup"
        ORDER BY c.cohort_week, "weeksSinceSignup"`
    case 'revenue':
      return `
        SELECT
          to_char(c.cohort_week, 'YYYY-MM-DD') AS "cohortWeek",
          GREATEST(0, FLOOR(EXTRACT(DAY FROM (pu.created_at - c.cohort_week)) / 7))::int AS "weeksSinceSignup",
          COALESCE(SUM(pu.amount_usd), 0)::float AS value
        FROM cohort c
        LEFT JOIN purchases pu ON pu.player_id = c.id AND pu.status = 'succeeded' AND pu.created_at >= c.cohort_week
        GROUP BY c.cohort_week, "weeksSinceSignup"
        ORDER BY c.cohort_week, "weeksSinceSignup"`
    case 'ltv':
    default:
      return `
        SELECT
          to_char(c.cohort_week, 'YYYY-MM-DD') AS "cohortWeek",
          GREATEST(0, FLOOR(EXTRACT(DAY FROM (pu.created_at - c.cohort_week)) / 7))::int AS "weeksSinceSignup",
          ROUND(SUM(pu.amount_usd) / NULLIF(cs.cohort_size, 0), 2)::float AS value
        FROM cohort c
        JOIN cohort_sizes cs ON cs.cohort_week = c.cohort_week
        LEFT JOIN purchases pu ON pu.player_id = c.id AND pu.status = 'succeeded' AND pu.created_at >= c.cohort_week
        GROUP BY c.cohort_week, cs.cohort_size, "weeksSinceSignup"
        ORDER BY c.cohort_week, "weeksSinceSignup"`
  }
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
