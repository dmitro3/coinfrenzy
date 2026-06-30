'use client'

import * as React from 'react'

import { Button } from '@coinfrenzy/ui/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@coinfrenzy/ui/primitives/card'
import { Input } from '@coinfrenzy/ui/primitives/input'

// docs/12 §6.8 — the Custom Query workbench. The UI is intentionally
// constrained: pick a base table from the allow-list, add WHERE conditions,
// optional GROUP BY + aggregates, optional ORDER BY, then run.
//
// The compiler validates the spec server-side; this UI doesn't claim to be
// secure on its own — it just makes constructing a valid spec ergonomic.

type AllowedTable =
  | 'players'
  | 'purchases'
  | 'redemptions'
  | 'bonuses_awarded'
  | 'ledger_entries'
  | 'player_events'
  | 'game_rounds'
  | 'daily_operational_snapshots'
  | 'daily_redemption_rate_snapshot'

type Operator = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'not_in' | 'is_null' | 'is_not_null'

type Aggregate = 'count' | 'count_distinct' | 'sum' | 'avg' | 'min' | 'max'

interface ConditionState {
  column: string
  operator: Operator
  value: string
}

interface AggregateState {
  fn: Aggregate
  column: string
  alias: string
}

interface OrderState {
  column: string
  direction: 'asc' | 'desc'
}

const TABLES: AllowedTable[] = [
  'players',
  'purchases',
  'redemptions',
  'bonuses_awarded',
  'ledger_entries',
  'player_events',
  'game_rounds',
  'daily_operational_snapshots',
  'daily_redemption_rate_snapshot',
]

const COLUMN_HINTS: Record<AllowedTable, string[]> = {
  players: ['id', 'email', 'state', 'status', 'kyc_level', 'created_at'],
  purchases: ['id', 'player_id', 'amount_usd', 'status', 'created_at'],
  redemptions: ['id', 'player_id', 'amount_usd', 'status', 'requested_at', 'paid_at'],
  bonuses_awarded: ['id', 'player_id', 'sc_amount', 'status', 'created_at'],
  ledger_entries: ['source', 'currency', 'amount', 'created_at'],
  player_events: ['player_id', 'event_name', 'amount', 'created_at'],
  game_rounds: ['game_id', 'bet_amount', 'win_amount', 'created_at'],
  daily_operational_snapshots: ['date', 'dau', 'total_ngr_sc', 'total_deposits_usd'],
  daily_redemption_rate_snapshot: [
    'date',
    'revenue_usd',
    'redemptions_usd',
    'lifetime_redemption_rate',
  ],
}

interface SavedQuery {
  id: string
  name: string
  description: string | null
  queryConfig: unknown
  schedule: string | null
}

export function CustomQueryWorkbench({ savedQueries }: { savedQueries: SavedQuery[] }) {
  const [baseTable, setBaseTable] = React.useState<AllowedTable>('daily_operational_snapshots')
  const [selectColumns, setSelectColumns] = React.useState<string>('date, dau, total_ngr_sc')
  const [conditions, setConditions] = React.useState<ConditionState[]>([])
  const [aggregates, setAggregates] = React.useState<AggregateState[]>([])
  const [groupBy, setGroupBy] = React.useState<string>('')
  const [orderBy, setOrderBy] = React.useState<OrderState[]>([
    { column: 'date', direction: 'desc' },
  ])
  const [limit, setLimit] = React.useState<number>(1000)
  const [running, setRunning] = React.useState(false)
  const [result, setResult] = React.useState<{
    columns: string[]
    rows: Array<Record<string, unknown>>
    durationMs: number
    rowCount: number
    truncated: boolean
  } | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  function spec() {
    return {
      baseTable,
      selectColumns: selectColumns
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      aggregates,
      where: conditions.map((c) => ({
        column: c.column,
        operator: c.operator,
        value:
          c.operator === 'is_null' || c.operator === 'is_not_null'
            ? undefined
            : c.operator === 'in' || c.operator === 'not_in'
              ? c.value
                  .split(',')
                  .map((v) => v.trim())
                  .filter(Boolean)
              : tryNumber(c.value),
      })),
      groupBy: groupBy
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      orderBy,
      limit,
    }
  }

  async function run() {
    setRunning(true)
    setError(null)
    try {
      const r = await fetch('/api/admin/reports/custom-query', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(spec()),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        setError((j as { error?: string }).error ?? `HTTP ${r.status}`)
        setResult(null)
      } else {
        setResult((await r.json()) as typeof result)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  async function save() {
    const name = window.prompt('Name this saved query')
    if (!name) return
    await fetch('/api/admin/reports/custom-query/saved', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, queryConfig: spec() }),
    })
    window.location.reload()
  }

  function loadSaved(q: SavedQuery) {
    const cfg = q.queryConfig as ReturnType<typeof spec>
    setBaseTable(cfg.baseTable as AllowedTable)
    setSelectColumns((cfg.selectColumns ?? []).join(', '))
    setAggregates((cfg.aggregates as AggregateState[]) ?? [])
    setConditions(
      (cfg.where ?? []).map((c) => ({
        column: c.column,
        operator: c.operator as Operator,
        value: Array.isArray(c.value) ? c.value.join(', ') : (c.value ?? '').toString(),
      })),
    )
    setGroupBy((cfg.groupBy ?? []).join(', '))
    setOrderBy((cfg.orderBy as OrderState[]) ?? [])
    setLimit(cfg.limit ?? 1000)
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle className="text-sm">Saved queries</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          {savedQueries.length === 0 ? (
            <p className="text-muted-foreground">No saved queries yet.</p>
          ) : (
            savedQueries.map((q) => (
              <button
                key={q.id}
                onClick={() => loadSaved(q)}
                className="block w-full rounded-md border bg-card/40 px-2 py-1.5 text-left hover:bg-muted"
              >
                <div className="font-medium">{q.name}</div>
                {q.description ? (
                  <div className="truncate text-[11px] text-muted-foreground">{q.description}</div>
                ) : null}
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-9">
        <CardHeader>
          <CardTitle className="text-sm">Build query</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Base table
            </span>
            <select
              value={baseTable}
              onChange={(e) => setBaseTable(e.target.value as AllowedTable)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              {TABLES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              Suggested columns: {COLUMN_HINTS[baseTable].join(', ')}
            </p>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Select columns (comma-separated)
            </span>
            <Input value={selectColumns} onChange={(e) => setSelectColumns(e.target.value)} />
          </label>

          <ConditionsEditor table={baseTable} value={conditions} onChange={setConditions} />

          <AggregatesEditor table={baseTable} value={aggregates} onChange={setAggregates} />

          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Group by (comma-separated)
            </span>
            <Input value={groupBy} onChange={(e) => setGroupBy(e.target.value)} />
          </label>

          <OrderByEditor table={baseTable} value={orderBy} onChange={setOrderBy} />

          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Limit (max 10,000)
            </span>
            <Input
              type="number"
              value={limit}
              onChange={(e) => setLimit(Math.min(Math.max(1, Number(e.target.value || 0)), 10_000))}
            />
          </label>

          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <Button onClick={run} disabled={running}>
              {running ? 'Running…' : 'Run query'}
            </Button>
            <Button onClick={save} variant="outline">
              Save query…
            </Button>
            {error ? <span className="text-xs text-destructive">{error}</span> : null}
          </div>
        </CardContent>
      </Card>

      {result ? (
        <Card className="lg:col-span-12">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-sm">
              <span>
                Results · {result.rowCount.toLocaleString()} rows · {result.durationMs} ms
                {result.truncated ? ' · truncated' : ''}
              </span>
              <Button variant="outline" size="sm" onClick={() => downloadCsv(result)}>
                Download CSV
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  {result.columns.map((c) => (
                    <th
                      key={c}
                      className="px-2 py-1 text-left font-medium uppercase tracking-wider text-muted-foreground"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr key={i} className="border-b last:border-b-0">
                    {result.columns.map((c) => (
                      <td key={c} className="px-2 py-1 font-mono">
                        {formatCell(row[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function ConditionsEditor({
  table,
  value,
  onChange,
}: {
  table: AllowedTable
  value: ConditionState[]
  onChange: (next: ConditionState[]) => void
}) {
  function add() {
    onChange([...value, { column: COLUMN_HINTS[table][0]!, operator: '=', value: '' }])
  }
  function remove(i: number) {
    onChange(value.filter((_, j) => j !== i))
  }
  function update(i: number, patch: Partial<ConditionState>) {
    onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Where
        </span>
        <Button size="sm" variant="outline" onClick={add}>
          + Condition
        </Button>
      </div>
      {value.map((c, i) => (
        <div key={i} className="grid grid-cols-12 items-center gap-2">
          <Input
            value={c.column}
            onChange={(e) => update(i, { column: e.target.value })}
            placeholder="column"
            className="col-span-3"
          />
          <select
            value={c.operator}
            onChange={(e) => update(i, { operator: e.target.value as Operator })}
            className="col-span-2 h-9 rounded-md border bg-background px-2 text-sm"
          >
            {(
              [
                '=',
                '!=',
                '>',
                '>=',
                '<',
                '<=',
                'in',
                'not_in',
                'is_null',
                'is_not_null',
              ] as Operator[]
            ).map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
          <Input
            disabled={c.operator === 'is_null' || c.operator === 'is_not_null'}
            value={c.value}
            onChange={(e) => update(i, { value: e.target.value })}
            placeholder="value (or comma-list for IN)"
            className="col-span-6"
          />
          <Button size="sm" variant="ghost" onClick={() => remove(i)} className="col-span-1">
            ×
          </Button>
        </div>
      ))}
    </div>
  )
}

function AggregatesEditor({
  table,
  value,
  onChange,
}: {
  table: AllowedTable
  value: AggregateState[]
  onChange: (next: AggregateState[]) => void
}) {
  function add() {
    onChange([...value, { fn: 'count', column: COLUMN_HINTS[table][0] ?? '*', alias: '' }])
  }
  function remove(i: number) {
    onChange(value.filter((_, j) => j !== i))
  }
  function update(i: number, patch: Partial<AggregateState>) {
    onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Aggregates
        </span>
        <Button size="sm" variant="outline" onClick={add}>
          + Aggregate
        </Button>
      </div>
      {value.map((a, i) => (
        <div key={i} className="grid grid-cols-12 items-center gap-2">
          <select
            value={a.fn}
            onChange={(e) => update(i, { fn: e.target.value as Aggregate })}
            className="col-span-3 h-9 rounded-md border bg-background px-2 text-sm"
          >
            {(['count', 'count_distinct', 'sum', 'avg', 'min', 'max'] as Aggregate[]).map((fn) => (
              <option key={fn} value={fn}>
                {fn}
              </option>
            ))}
          </select>
          <Input
            value={a.column}
            onChange={(e) => update(i, { column: e.target.value })}
            placeholder="column or *"
            className="col-span-4"
          />
          <Input
            value={a.alias}
            onChange={(e) => update(i, { alias: e.target.value })}
            placeholder="alias (optional)"
            className="col-span-4"
          />
          <Button size="sm" variant="ghost" onClick={() => remove(i)} className="col-span-1">
            ×
          </Button>
        </div>
      ))}
    </div>
  )
}

function OrderByEditor({
  table,
  value,
  onChange,
}: {
  table: AllowedTable
  value: OrderState[]
  onChange: (next: OrderState[]) => void
}) {
  function add() {
    onChange([...value, { column: COLUMN_HINTS[table][0]!, direction: 'desc' }])
  }
  function remove(i: number) {
    onChange(value.filter((_, j) => j !== i))
  }
  function update(i: number, patch: Partial<OrderState>) {
    onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Order by
        </span>
        <Button size="sm" variant="outline" onClick={add}>
          + Order
        </Button>
      </div>
      {value.map((o, i) => (
        <div key={i} className="grid grid-cols-12 items-center gap-2">
          <Input
            value={o.column}
            onChange={(e) => update(i, { column: e.target.value })}
            placeholder="column"
            className="col-span-9"
          />
          <select
            value={o.direction}
            onChange={(e) => update(i, { direction: e.target.value as 'asc' | 'desc' })}
            className="col-span-2 h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="asc">asc</option>
            <option value="desc">desc</option>
          </select>
          <Button size="sm" variant="ghost" onClick={() => remove(i)} className="col-span-1">
            ×
          </Button>
        </div>
      ))}
    </div>
  )
}

function tryNumber(s: string): string | number | boolean {
  if (s === 'true') return true
  if (s === 'false') return false
  if (s.trim() === '') return ''
  const n = Number(s)
  return Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(s.trim()) ? n : s
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function downloadCsv(result: { columns: string[]; rows: Array<Record<string, unknown>> }) {
  const escape = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const lines: string[] = [result.columns.map((c) => escape(c)).join(',')]
  for (const row of result.rows) {
    lines.push(
      result.columns
        .map((c) => {
          const v = row[c]
          if (v === null || v === undefined) return ''
          if (typeof v === 'object') return escape(JSON.stringify(v))
          return escape(String(v))
        })
        .join(','),
    )
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `custom-query-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
