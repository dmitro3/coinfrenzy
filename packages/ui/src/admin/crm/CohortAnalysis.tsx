'use client'

import * as React from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Download, Loader2 } from 'lucide-react'

import { Button } from '../../primitives/button'
import { cn } from '../../lib/utils'

type Metric = 'retention' | 'ltv' | 'activity' | 'revenue'

interface CohortCell {
  cohortWeek: string
  weeksSinceSignup: number
  value: number
}

interface CohortKpis {
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

interface CohortResponse {
  metric: Metric
  windowDays: number
  total: number
  cells: CohortCell[]
  kpis: CohortKpis
}

interface SegmentOption {
  id: string
  name: string
  cachedCount: number | null
}

interface CohortAnalysisProps {
  segments: SegmentOption[]
  /** Pre-selected segment id when this lives inside a segment detail page. */
  initialSegmentId?: string
  /** When provided, the segment picker is hidden (we already know the segment). */
  filterTreeOverride?: unknown
  className?: string
}

const METRIC_LABELS: Record<Metric, string> = {
  retention: 'Retention (%)',
  ltv: 'LTV per player (USD)',
  activity: 'Activity (rounds)',
  revenue: 'Revenue (USD)',
}

const WINDOW_OPTIONS = [
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 180, label: 'Last 180 days' },
  { value: 365, label: 'Last 365 days' },
]

export function CohortAnalysis({
  segments,
  initialSegmentId,
  filterTreeOverride,
  className,
}: CohortAnalysisProps) {
  const [segmentId, setSegmentId] = React.useState<string | null>(
    initialSegmentId ?? segments[0]?.id ?? null,
  )
  const [metric, setMetric] = React.useState<Metric>('retention')
  const [windowDays, setWindowDays] = React.useState(90)
  const [data, setData] = React.useState<CohortResponse | null>(null)
  const [loading, setLoading] = React.useState(false)

  const selectedSegment = segments.find((s) => s.id === segmentId) ?? null

  React.useEffect(() => {
    let cancelled = false
    async function run() {
      const filterTree = filterTreeOverride ?? (await fetchSegmentTree(segmentId))
      if (!filterTree) return
      setLoading(true)
      try {
        const res = await fetch('/api/admin/crm/segments/cohort', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ filterTree, metric, windowDays }),
        })
        if (!res.ok) return
        const json = (await res.json()) as CohortResponse
        if (!cancelled) setData(json)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [segmentId, metric, windowDays, filterTreeOverride])

  const chartData = React.useMemo(() => {
    if (!data) return []
    // Group cells by weeksSinceSignup (x axis), summed/averaged per metric.
    const map = new Map<number, { week: number; value: number; count: number }>()
    for (const c of data.cells) {
      const cur = map.get(c.weeksSinceSignup) ?? { week: c.weeksSinceSignup, value: 0, count: 0 }
      cur.value += c.value
      cur.count += 1
      map.set(c.weeksSinceSignup, cur)
    }
    return [...map.values()]
      .sort((a, b) => a.week - b.week)
      .map((b) => ({
        week: `Wk ${b.week}`,
        value:
          metric === 'retention' || metric === 'ltv' ? b.value / Math.max(1, b.count) : b.value,
      }))
  }, [data, metric])

  const heatmapRows = React.useMemo(() => {
    if (!data) return [] as Array<{ cohort: string; cells: Array<{ week: number; value: number }> }>
    const byCohort = new Map<string, Array<{ week: number; value: number }>>()
    for (const c of data.cells) {
      const list = byCohort.get(c.cohortWeek) ?? []
      list.push({ week: c.weeksSinceSignup, value: c.value })
      byCohort.set(c.cohortWeek, list)
    }
    return [...byCohort.entries()]
      .map(([cohort, cells]) => ({ cohort, cells: cells.sort((a, b) => a.week - b.week) }))
      .sort((a, b) => a.cohort.localeCompare(b.cohort))
  }, [data])

  const maxHeatValue = React.useMemo(() => {
    if (!data) return 1
    return Math.max(1, ...data.cells.map((c) => c.value))
  }, [data])

  function exportCsv() {
    if (!data) return
    const rows = ['cohort_week,weeks_since_signup,value']
    for (const c of data.cells) {
      rows.push(`${c.cohortWeek},${c.weeksSinceSignup},${c.value}`)
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cohort-${selectedSegment?.name ?? 'segment'}-${metric}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-end gap-3">
        {filterTreeOverride === undefined ? (
          <div>
            <label className="block text-[10px] uppercase text-ink-tertiary">Segment</label>
            <select
              value={segmentId ?? ''}
              onChange={(e) => setSegmentId(e.target.value || null)}
              className="mt-1 h-9 rounded-md border border-line-subtle bg-elevated px-2 text-sm text-ink-primary"
            >
              <option value="">choose…</option>
              {segments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.cachedCount !== null ? ` (${s.cachedCount.toLocaleString()})` : ''}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div>
          <label className="block text-[10px] uppercase text-ink-tertiary">Metric</label>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as Metric)}
            className="mt-1 h-9 rounded-md border border-line-subtle bg-elevated px-2 text-sm text-ink-primary"
          >
            {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
              <option key={m} value={m}>
                {METRIC_LABELS[m]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] uppercase text-ink-tertiary">Window</label>
          <select
            value={windowDays}
            onChange={(e) => setWindowDays(Number(e.target.value))}
            className="mt-1 h-9 rounded-md border border-line-subtle bg-elevated px-2 text-sm text-ink-primary"
          >
            {WINDOW_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <Button variant="outline" size="sm" className="h-9" onClick={exportCsv} disabled={!data}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Export CSV
        </Button>

        {loading ? <Loader2 className="ml-2 h-4 w-4 animate-spin text-ink-tertiary" /> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <KpiTile label="Players" value={data?.kpis.totalInCohort.toLocaleString() ?? '—'} />
        <KpiTile label="Active 30d" value={data?.kpis.active30d.toLocaleString() ?? '—'} />
        <KpiTile
          label="LTV @ wk 12"
          value={data ? `$${(data.kpis.ltvWeek12 ?? 0).toFixed(2)}` : '—'}
        />
        <KpiTile
          label="Churn (60d+)"
          value={data ? `${(data.kpis.churnRate ?? 0).toFixed(1)}%` : '—'}
          tone={data && data.kpis.churnRate > 60 ? 'critical' : undefined}
        />
      </div>

      <div className="rounded-lg border border-line-subtle bg-surface p-4">
        <div className="mb-2 text-xs font-medium text-ink-secondary">
          {METRIC_LABELS[metric]} over weeks since signup
        </div>
        <div className="h-72">
          <ResponsiveContainer>
            <LineChart data={chartData}>
              <CartesianGrid strokeOpacity={0.1} stroke="hsl(0 0% 100% / 0.06)" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="hsl(0 0% 100% / 0.3)" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(0 0% 100% / 0.3)" />
              <Tooltip
                contentStyle={{
                  background: 'hsl(220 13% 8%)',
                  border: '1px solid hsl(0 0% 100% / 0.1)',
                  borderRadius: 6,
                  fontSize: 12,
                }}
              />
              <Line dataKey="value" stroke="#a78bfa" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border border-line-subtle bg-surface p-4">
        <div className="mb-2 text-xs font-medium text-ink-secondary">Cohort heatmap</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr>
                <th className="px-2 py-1 text-left text-ink-tertiary">Signup week</th>
                {Array.from({ length: 12 }).map((_, i) => (
                  <th key={i} className="px-1 py-1 text-center text-ink-tertiary">
                    Wk {i}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmapRows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-2 py-6 text-center text-ink-tertiary">
                    {loading ? 'Loading…' : 'No cohorts yet for this window'}
                  </td>
                </tr>
              ) : (
                heatmapRows.map((row) => (
                  <tr key={row.cohort}>
                    <td className="px-2 py-1 font-medium text-ink-secondary">{row.cohort}</td>
                    {Array.from({ length: 12 }).map((_, i) => {
                      const cell = row.cells.find((c) => c.week === i)
                      const v = cell?.value ?? 0
                      const opacity = Math.min(0.95, v / maxHeatValue)
                      return (
                        <td
                          key={i}
                          className="px-1 py-1"
                          style={{
                            background: cell
                              ? `rgba(167, 139, 250, ${0.05 + opacity * 0.6})`
                              : undefined,
                          }}
                          title={cell ? `${v.toFixed(2)}` : ''}
                        >
                          <div className="text-center text-ink-primary">
                            {cell ? formatCellValue(v, metric) : ''}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function KpiTile({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'critical' | 'positive'
}) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-surface p-4',
        tone === 'critical'
          ? 'border-rose-500/30'
          : tone === 'positive'
            ? 'border-emerald-500/30'
            : 'border-line-subtle',
      )}
    >
      <div className="text-[10px] uppercase tracking-wide text-ink-tertiary">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-ink-primary">{value}</div>
    </div>
  )
}

function formatCellValue(v: number, metric: Metric): string {
  if (metric === 'retention') return `${v.toFixed(0)}%`
  if (metric === 'ltv' || metric === 'revenue') return `$${v.toFixed(0)}`
  return v.toFixed(0)
}

async function fetchSegmentTree(segmentId: string | null): Promise<unknown | null> {
  if (!segmentId) return null
  const res = await fetch(`/api/admin/crm/segments/${segmentId}`, { cache: 'no-store' })
  if (!res.ok) return null
  const json = (await res.json()) as { segment: { filterTree: unknown } }
  return json.segment?.filterTree ?? null
}
