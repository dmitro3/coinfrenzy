'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, PlayCircle, RefreshCw, XCircle } from 'lucide-react'

import { Button } from '@coinfrenzy/ui/primitives/button'
import { Card } from '@coinfrenzy/ui/primitives/card'
import { StatusPill } from '@coinfrenzy/ui/admin/display/StatusPill'

interface RunRow {
  id: string
  snapshotDate: string
  snapshotUri: string
  mode: 'dry_run' | 'production'
  status: string
  tablesTotal: number
  tablesSucceeded: number
  tablesFailed: number
  rowsImported: number
  rowsFailed: number
  validationStatus: string | null
  validationSummary: Record<string, unknown> | null
  triggeredAt: string
  completedAt: string | null
  errorSummary: string | null
  notes: string | null
}

interface TableRow {
  id: string
  tableName: string
  source: string
  rowsInSource: number
  rowsImported: number
  rowsSkipped: number
  rowsFailed: number
  status: string
  errorSummary: string | null
}

interface ErrorRow {
  id: string
  sourceFile: string
  sourceRowNumber: number | null
  sourceRowId: string | null
  errorCode: string
  errorMessage: string
  errorField: string | null
  createdAt: string
}

interface ReviewRow {
  id: string
  kind: string
  sourceFile: string
  sourceText: string | null
  sourceRowId: string | null
  status: string
  suggestion: Record<string, unknown> | null
  resolutionNotes: string | null
  resolvedAt: string | null
}

interface ReplayRow {
  id: string
  provider: string
  eventType: string
  receivedAt: string
  replayedAt: string
  outcome: string
  error: string | null
}

interface ValidationGate {
  check: string
  severity: 'hard' | 'soft'
  passed: boolean
  expected?: number | string | null
  actual?: number | string | null
  detail?: string
}

interface Props {
  run: RunRow
  tables: TableRow[]
  errors: ErrorRow[]
  reviews: ReviewRow[]
  replays: ReplayRow[]
}

export function MigrationRunDetailClient({ run, tables, errors, reviews, replays }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null)
  const [replayFrom, setReplayFrom] = useState<string>(toLocalDt(new Date(run.triggeredAt)))
  const [replayTo, setReplayTo] = useState<string>(toLocalDt(new Date()))

  const validationGates: ValidationGate[] = Array.isArray(run.validationSummary?.gates)
    ? (run.validationSummary!.gates as ValidationGate[])
    : []

  const refresh = () => startTransition(() => router.refresh())

  async function runValidation() {
    setBusy(true)
    setBanner(null)
    try {
      const res = await fetch(`/api/admin/migration/runs/${run.id}/validate`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) {
        setBanner({ kind: 'err', message: body.error ?? 'validation_failed' })
      } else {
        setBanner({ kind: 'ok', message: `Validation: ${body.report.status}` })
        refresh()
      }
    } finally {
      setBusy(false)
    }
  }

  async function runReplay(dryRun: boolean) {
    setBusy(true)
    setBanner(null)
    try {
      const res = await fetch('/api/admin/migration/replay', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          from: new Date(replayFrom).toISOString(),
          to: new Date(replayTo).toISOString(),
          runId: run.id,
          dryRun,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setBanner({ kind: 'err', message: body.error ?? 'replay_failed' })
      } else {
        const r = body.result
        setBanner({
          kind: 'ok',
          message: `${dryRun ? 'Dry-run' : 'Replay'}: ${r.total} total · ${r.completed} ok · ${r.failed} failed · ${r.duplicate} dup`,
        })
        refresh()
      }
    } finally {
      setBusy(false)
    }
  }

  async function resolveReview(id: string, action: 'apply' | 'dismiss') {
    const notes = prompt(
      action === 'apply'
        ? 'Optional notes for applying this resolution:'
        : 'Optional notes for dismissing this review:',
    )
    if (notes === null) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/migration/review-queue/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, notes: notes || undefined }),
      })
      const body = await res.json()
      if (!res.ok) setBanner({ kind: 'err', message: body.error ?? 'failed' })
      else refresh()
    } finally {
      setBusy(false)
    }
  }

  const openReviews = reviews.filter((r) => r.status === 'open')

  return (
    <div className="space-y-6">
      {banner ? (
        <div
          className={
            'rounded-md border px-4 py-2 text-sm ' +
            (banner.kind === 'ok'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
              : 'border-red-500/40 bg-red-500/10 text-red-200')
          }
        >
          {banner.message}
        </div>
      ) : null}

      {/* Summary row */}
      <div className="grid gap-4 md:grid-cols-4">
        <SummaryTile label="Status" value={run.status} variant={statusVariant(run.status)} />
        <SummaryTile
          label="Validation"
          value={run.validationStatus ?? '—'}
          variant={validationVariant(run.validationStatus)}
        />
        <SummaryTile
          label="Rows imported"
          value={run.rowsImported.toLocaleString()}
          secondary={run.rowsFailed ? `${run.rowsFailed} failed` : undefined}
        />
        <SummaryTile
          label="Tables"
          value={`${run.tablesSucceeded}/${run.tablesTotal}`}
          secondary={run.tablesFailed ? `${run.tablesFailed} failed` : undefined}
        />
      </div>

      {/* Actions */}
      <Card className="p-4">
        <div className="text-sm font-medium text-ink-primary mb-3">Actions</div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={runValidation} disabled={busy}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Re-run validation
          </Button>
          <Button size="sm" variant="ghost" onClick={refresh} disabled={pending}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Refresh
          </Button>
        </div>
      </Card>

      {/* Validation gates */}
      {validationGates.length > 0 ? (
        <Card className="p-4">
          <div className="text-sm font-medium text-ink-primary mb-2">Validation gates</div>
          <div className="overflow-x-auto rounded border border-line-subtle">
            <table className="w-full text-xs">
              <thead className="bg-surface-muted">
                <tr className="text-left text-[10px] uppercase tracking-wide text-ink-tertiary">
                  <th className="px-3 py-2">Check</th>
                  <th className="px-3 py-2">Severity</th>
                  <th className="px-3 py-2">Result</th>
                  <th className="px-3 py-2">Expected</th>
                  <th className="px-3 py-2">Actual</th>
                  <th className="px-3 py-2">Detail</th>
                </tr>
              </thead>
              <tbody>
                {validationGates.map((g) => (
                  <tr key={g.check} className="border-t border-line-subtle">
                    <td className="px-3 py-2 font-medium text-ink-primary">{g.check}</td>
                    <td className="px-3 py-2 uppercase text-[10px] tracking-wide text-ink-tertiary">
                      {g.severity}
                    </td>
                    <td className="px-3 py-2">
                      {g.passed ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Pass
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-400">
                          <XCircle className="h-3.5 w-3.5" /> Fail
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{String(g.expected ?? '—')}</td>
                    <td className="px-3 py-2 tabular-nums">{String(g.actual ?? '—')}</td>
                    <td className="px-3 py-2 text-ink-secondary">{g.detail ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* Per-table summaries */}
      <Card className="p-4">
        <div className="text-sm font-medium text-ink-primary mb-2">Per-table imports</div>
        <div className="overflow-x-auto rounded border border-line-subtle">
          <table className="w-full text-xs">
            <thead className="bg-surface-muted">
              <tr className="text-left text-[10px] uppercase tracking-wide text-ink-tertiary">
                <th className="px-3 py-2">Table</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">In source</th>
                <th className="px-3 py-2 text-right">Imported</th>
                <th className="px-3 py-2 text-right">Skipped</th>
                <th className="px-3 py-2 text-right">Failed</th>
              </tr>
            </thead>
            <tbody>
              {tables.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-ink-tertiary">
                    No per-table records yet.
                  </td>
                </tr>
              ) : (
                tables.map((t) => (
                  <tr key={t.id} className="border-t border-line-subtle">
                    <td className="px-3 py-2 font-medium text-ink-primary">{t.tableName}</td>
                    <td className="px-3 py-2">{t.source}</td>
                    <td className="px-3 py-2">
                      <StatusPill
                        status="custom"
                        color={tableStatusColor(t.status)}
                        label={t.status}
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {t.rowsInSource.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {t.rowsImported.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {t.rowsSkipped.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {t.rowsFailed.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Review queue */}
      {reviews.length > 0 ? (
        <Card className="p-4">
          <div className="text-sm font-medium text-ink-primary mb-2">
            Review queue
            {openReviews.length > 0 ? (
              <span className="ml-2 text-amber-300">({openReviews.length} open)</span>
            ) : null}
          </div>
          <div className="space-y-2">
            {reviews.map((r) => (
              <div key={r.id} className="rounded border border-line-subtle p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-ink-secondary">
                  <span className="font-medium text-ink-primary">{r.kind}</span>
                  <span className="text-ink-tertiary">·</span>
                  <span>{r.sourceFile}</span>
                  {r.sourceRowId ? (
                    <>
                      <span className="text-ink-tertiary">·</span>
                      <span className="font-mono text-[11px]">{r.sourceRowId}</span>
                    </>
                  ) : null}
                  <span className="text-ink-tertiary">·</span>
                  <StatusPill
                    status="custom"
                    color={reviewStatusColor(r.status)}
                    label={r.status}
                  />
                </div>
                {r.sourceText ? (
                  <pre className="mt-1 whitespace-pre-wrap text-xs text-ink-secondary">
                    {r.sourceText}
                  </pre>
                ) : null}
                {r.resolutionNotes ? (
                  <div className="mt-1 text-[11px] text-ink-tertiary">
                    Notes: {r.resolutionNotes}
                  </div>
                ) : null}
                {r.status === 'open' ? (
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => resolveReview(r.id, 'apply')} disabled={busy}>
                      Apply
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => resolveReview(r.id, 'dismiss')}
                      disabled={busy}
                    >
                      Dismiss
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* Row errors */}
      {errors.length > 0 ? (
        <Card className="p-4">
          <div className="text-sm font-medium text-ink-primary mb-2">
            Row errors ({errors.length} shown, max 100)
          </div>
          <div className="overflow-x-auto rounded border border-line-subtle">
            <table className="w-full text-xs">
              <thead className="bg-surface-muted">
                <tr className="text-left text-[10px] uppercase tracking-wide text-ink-tertiary">
                  <th className="px-3 py-2">File</th>
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">Gamma id</th>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Message</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((e) => (
                  <tr key={e.id} className="border-t border-line-subtle">
                    <td className="px-3 py-2">{e.sourceFile}</td>
                    <td className="px-3 py-2 tabular-nums">{e.sourceRowNumber ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-[11px]">{e.sourceRowId ?? '—'}</td>
                    <td className="px-3 py-2 font-mono">{e.errorCode}</td>
                    <td className="px-3 py-2 text-ink-secondary">{e.errorMessage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* Replay controls */}
      <Card className="p-4">
        <div className="text-sm font-medium text-ink-primary mb-2 flex items-center gap-2">
          <PlayCircle className="h-4 w-4" /> Replay captured webhooks
        </div>
        <p className="text-[11px] text-ink-tertiary mb-3">
          Replays every <code>pending_webhooks</code> row with{' '}
          <code>status=&apos;received&apos;</code> in the window. Idempotent — re-running skips
          already-replayed events.
        </p>
        <div className="grid gap-2 md:grid-cols-2">
          <label className="block text-xs">
            <span className="block text-[11px] uppercase tracking-wide text-ink-tertiary">
              From
            </span>
            <input
              type="datetime-local"
              value={replayFrom}
              onChange={(e) => setReplayFrom(e.target.value)}
              className="mt-1 w-full rounded border border-line-subtle bg-surface px-2 py-1 text-xs"
            />
          </label>
          <label className="block text-xs">
            <span className="block text-[11px] uppercase tracking-wide text-ink-tertiary">To</span>
            <input
              type="datetime-local"
              value={replayTo}
              onChange={(e) => setReplayTo(e.target.value)}
              className="mt-1 w-full rounded border border-line-subtle bg-surface px-2 py-1 text-xs"
            />
          </label>
        </div>
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => runReplay(true)} disabled={busy}>
            Dry run
          </Button>
          <Button size="sm" onClick={() => runReplay(false)} disabled={busy}>
            Replay
          </Button>
        </div>
      </Card>

      {replays.length > 0 ? (
        <Card className="p-4">
          <div className="text-sm font-medium text-ink-primary mb-2">Replay log</div>
          <div className="overflow-x-auto rounded border border-line-subtle">
            <table className="w-full text-xs">
              <thead className="bg-surface-muted">
                <tr className="text-left text-[10px] uppercase tracking-wide text-ink-tertiary">
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2">Event</th>
                  <th className="px-3 py-2">Received</th>
                  <th className="px-3 py-2">Replayed</th>
                  <th className="px-3 py-2">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {replays.map((r) => (
                  <tr key={r.id} className="border-t border-line-subtle">
                    <td className="px-3 py-2">{r.provider}</td>
                    <td className="px-3 py-2 font-mono text-[11px]">{r.eventType}</td>
                    <td className="px-3 py-2 tabular-nums text-ink-tertiary">
                      {new Date(r.receivedAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-ink-tertiary">
                      {new Date(r.replayedAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill
                        status="custom"
                        color={
                          r.outcome === 'completed'
                            ? 'positive'
                            : r.outcome === 'failed'
                              ? 'critical'
                              : 'neutral'
                        }
                        label={r.outcome}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  )
}

function SummaryTile({
  label,
  value,
  secondary,
  variant = 'neutral',
}: {
  label: string
  value: string
  secondary?: string
  variant?: 'positive' | 'critical' | 'notice' | 'neutral'
}) {
  const tone =
    variant === 'positive'
      ? 'text-emerald-300'
      : variant === 'critical'
        ? 'text-red-300'
        : variant === 'notice'
          ? 'text-amber-300'
          : 'text-ink-primary'
  return (
    <Card className="p-4">
      <div className="text-[10px] uppercase tracking-wide text-ink-tertiary">{label}</div>
      <div className={'text-xl font-semibold ' + tone}>{value}</div>
      {secondary ? <div className="text-[11px] text-ink-tertiary">{secondary}</div> : null}
    </Card>
  )
}

function statusVariant(status: string): 'positive' | 'critical' | 'notice' | 'neutral' {
  if (status === 'imported' || status === 'validated') return 'positive'
  if (status === 'failed' || status === 'cancelled') return 'critical'
  if (status === 'queued' || status === 'running') return 'notice'
  return 'neutral'
}

function validationVariant(status: string | null): 'positive' | 'critical' | 'notice' | 'neutral' {
  if (status === 'passed') return 'positive'
  if (status === 'failed') return 'critical'
  if (status === 'soft_warnings') return 'notice'
  return 'neutral'
}

function tableStatusColor(status: string): 'positive' | 'critical' | 'notice' | 'neutral' {
  if (status === 'success') return 'positive'
  if (status === 'failed') return 'critical'
  if (status === 'partial') return 'notice'
  return 'neutral'
}

function reviewStatusColor(status: string): 'positive' | 'critical' | 'notice' | 'neutral' {
  if (status === 'open') return 'notice'
  if (status === 'dismissed') return 'neutral'
  if (status === 'applied') return 'positive'
  return 'neutral'
}

function toLocalDt(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
