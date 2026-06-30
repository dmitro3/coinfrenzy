'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Database,
  PlayCircle,
  RefreshCw,
  ShieldAlert,
  Upload,
} from 'lucide-react'

import { Button } from '@coinfrenzy/ui/primitives/button'
import { Card } from '@coinfrenzy/ui/primitives/card'
import { StatusPill } from '@coinfrenzy/ui/admin/display/StatusPill'

import type { MigrationRunRow, MigrationSnapshotInfo } from './_data'

interface DualCaptureConfig {
  enabled: boolean
  since: string | null
  providers: ('finix' | 'alea' | 'footprint')[]
  notes?: string
}

interface InitialData {
  runs: MigrationRunRow[]
  snapshots: MigrationSnapshotInfo[]
  storeMode: 'real' | 'memory'
  dualCapture: DualCaptureConfig
  openReviews: number
}

const REQUIRED_FILES = ['players_data.csv', 'purchase_report.csv', 'redeem_requests_data.csv']

export function MigrationClient({ initialData }: { initialData: InitialData }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null)

  // Form state for "start new run"
  const today = new Date().toISOString().slice(0, 10)
  const [snapshotDate, setSnapshotDate] = useState(today)
  const [mode, setMode] = useState<'dry_run' | 'production'>('dry_run')
  const [notes, setNotes] = useState('')

  // Upload state
  const [uploadDate, setUploadDate] = useState(today)
  const [uploadFile, setUploadFile] = useState<File | null>(null)

  // Dual-capture state
  const [dcEnabled, setDcEnabled] = useState(initialData.dualCapture.enabled)
  const [dcReason, setDcReason] = useState('')

  const snapshotCoverage = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const s of initialData.snapshots) map.set(s.date, new Set(s.files))
    return map
  }, [initialData.snapshots])

  const hasSnapshot = (date: string) => snapshotCoverage.has(date)
  const missingFiles = (date: string) => {
    const files = snapshotCoverage.get(date) ?? new Set<string>()
    return REQUIRED_FILES.filter((f) => !files.has(f))
  }

  async function refresh() {
    startTransition(() => router.refresh())
  }

  async function startRun() {
    setBusy(true)
    setBanner(null)
    try {
      const res = await fetch('/api/admin/migration/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ snapshotDate, mode, notes: notes.trim() || undefined }),
      })
      const body = await res.json()
      if (!res.ok) {
        setBanner({ kind: 'err', message: body.error ?? 'failed_to_start' })
      } else {
        setBanner({ kind: 'ok', message: `Run queued · ${body.runId}` })
        setNotes('')
        await refresh()
      }
    } catch (e) {
      setBanner({ kind: 'err', message: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  async function uploadSnapshot() {
    if (!uploadFile) return
    setBusy(true)
    setBanner(null)
    try {
      const form = new FormData()
      form.append('date', uploadDate)
      form.append('file', uploadFile)
      const res = await fetch('/api/admin/migration/snapshots', { method: 'POST', body: form })
      const body = await res.json()
      if (!res.ok) {
        setBanner({ kind: 'err', message: body.error ?? 'upload_failed' })
      } else {
        setBanner({ kind: 'ok', message: `Uploaded ${uploadFile.name}` })
        setUploadFile(null)
        await refresh()
      }
    } catch (e) {
      setBanner({ kind: 'err', message: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  async function toggleDualCapture() {
    if (!dcReason.trim()) {
      setBanner({ kind: 'err', message: 'A reason is required to toggle dual-capture mode.' })
      return
    }
    const next = !dcEnabled
    if (
      next &&
      !confirm(
        'Enabling dual-capture stops Inngest from processing incoming webhooks. The receiver will still store them — but no ledger writes will happen. Continue?',
      )
    ) {
      return
    }
    setBusy(true)
    setBanner(null)
    try {
      const res = await fetch('/api/admin/migration/dual-capture', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: next, reason: dcReason }),
      })
      const body = await res.json()
      if (!res.ok) {
        setBanner({ kind: 'err', message: body.error ?? 'toggle_failed' })
      } else {
        setBanner({ kind: 'ok', message: `Dual-capture ${next ? 'ENABLED' : 'DISABLED'}` })
        setDcEnabled(next)
        setDcReason('')
        await refresh()
      }
    } catch (e) {
      setBanner({ kind: 'err', message: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

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

      {initialData.storeMode === 'memory' ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          <strong>R2 not configured.</strong> Snapshots are kept only in-memory for this server
          process. Set R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET in
          Doppler to persist.
        </div>
      ) : null}

      {initialData.openReviews > 0 ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-200 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" />
          {initialData.openReviews} open review-queue item{initialData.openReviews === 1 ? '' : 's'}{' '}
          — final cutover blocks until these are resolved.
        </div>
      ) : null}

      {/* Three top-row cards: snapshots / start run / dual capture */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Snapshots */}
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-ink-primary">
              <Database className="h-4 w-4" /> Snapshots
            </div>
            <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
              {initialData.storeMode}
            </span>
          </div>
          <div className="space-y-2 max-h-48 overflow-auto text-xs">
            {initialData.snapshots.length === 0 ? (
              <div className="text-ink-tertiary">
                No snapshots in R2 yet. Upload Gamma CSVs below.
              </div>
            ) : (
              initialData.snapshots.map((s) => {
                const missing = REQUIRED_FILES.filter((f) => !s.files.includes(f))
                return (
                  <div
                    key={s.date}
                    className="flex items-center justify-between rounded border border-line-subtle px-2 py-1.5"
                  >
                    <div>
                      <div className="font-medium tabular-nums text-ink-primary">{s.date}</div>
                      <div className="text-[10px] text-ink-tertiary">
                        {s.files.length} file{s.files.length === 1 ? '' : 's'}
                        {missing.length > 0 ? (
                          <span className="ml-1 text-amber-300">
                            · missing {missing.join(', ')}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {missing.length === 0 ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-400" />
                    )}
                  </div>
                )
              })
            )}
          </div>

          <form
            className="mt-3 space-y-2 border-t border-line-subtle pt-3"
            onSubmit={(e) => {
              e.preventDefault()
              uploadSnapshot()
            }}
          >
            <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">Upload CSV</div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <input
                type="date"
                value={uploadDate}
                onChange={(e) => setUploadDate(e.target.value)}
                className="rounded border border-line-subtle bg-surface px-2 py-1 text-xs"
                required
              />
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                className="text-xs"
                required
              />
            </div>
            <Button type="submit" size="sm" disabled={busy || !uploadFile}>
              <Upload className="h-3.5 w-3.5 mr-1" />
              Upload
            </Button>
          </form>
        </Card>

        {/* Start new run */}
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-ink-primary">
            <PlayCircle className="h-4 w-4" /> Start new run
          </div>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              startRun()
            }}
          >
            <label className="block text-xs">
              <span className="block text-[11px] uppercase tracking-wide text-ink-tertiary">
                Snapshot date
              </span>
              <input
                type="date"
                value={snapshotDate}
                onChange={(e) => setSnapshotDate(e.target.value)}
                className="mt-1 w-full rounded border border-line-subtle bg-surface px-2 py-1 text-xs"
                required
              />
              {!hasSnapshot(snapshotDate) ? (
                <span className="mt-1 block text-[10px] text-amber-300">
                  No snapshot exists for this date.
                </span>
              ) : missingFiles(snapshotDate).length > 0 ? (
                <span className="mt-1 block text-[10px] text-amber-300">
                  Missing files: {missingFiles(snapshotDate).join(', ')}
                </span>
              ) : (
                <span className="mt-1 block text-[10px] text-emerald-400">Snapshot complete.</span>
              )}
            </label>
            <label className="block text-xs">
              <span className="block text-[11px] uppercase tracking-wide text-ink-tertiary">
                Mode
              </span>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as 'dry_run' | 'production')}
                className="mt-1 w-full rounded border border-line-subtle bg-surface px-2 py-1 text-xs"
              >
                <option value="dry_run">Dry run (staging-equivalent)</option>
                <option value="production">Production (cutover night only)</option>
              </select>
            </label>
            <label className="block text-xs">
              <span className="block text-[11px] uppercase tracking-wide text-ink-tertiary">
                Notes
              </span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What is this run for? (rehearsal #3, cutover night, etc.)"
                rows={2}
                className="mt-1 w-full rounded border border-line-subtle bg-surface px-2 py-1 text-xs"
              />
            </label>
            <Button type="submit" size="sm" disabled={busy}>
              {pending ? 'Refreshing…' : 'Queue run'}
            </Button>
          </form>
        </Card>

        {/* Dual capture */}
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-ink-primary">
              <ShieldAlert className="h-4 w-4" /> Dual-capture window
            </div>
            <StatusPill
              status="custom"
              color={dcEnabled ? 'positive' : 'neutral'}
              label={dcEnabled ? 'CAPTURING' : 'OFF'}
            />
          </div>
          <p className="text-[11px] text-ink-tertiary mb-2">
            When ON, webhooks are stored but not processed. Replay during cutover night via the run
            detail page.
          </p>
          {dcEnabled && initialData.dualCapture.since ? (
            <p className="mb-2 text-[11px] text-ink-secondary">
              Started{' '}
              <span className="tabular-nums">
                {new Date(initialData.dualCapture.since).toLocaleString()}
              </span>
            </p>
          ) : null}
          <p className="text-[11px] text-ink-tertiary mb-2">
            Providers:{' '}
            <span className="tabular-nums">{initialData.dualCapture.providers.join(', ')}</span>
          </p>
          <label className="block text-xs">
            <span className="block text-[11px] uppercase tracking-wide text-ink-tertiary">
              Reason (required, audited)
            </span>
            <input
              type="text"
              value={dcReason}
              onChange={(e) => setDcReason(e.target.value)}
              placeholder="T-30 capture rehearsal #2"
              className="mt-1 w-full rounded border border-line-subtle bg-surface px-2 py-1 text-xs"
            />
          </label>
          <Button
            className="mt-3"
            size="sm"
            variant={dcEnabled ? 'destructive' : 'default'}
            onClick={toggleDualCapture}
            disabled={busy}
          >
            {dcEnabled ? 'Disable capture' : 'Enable capture'}
          </Button>
        </Card>
      </div>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-medium text-ink-primary">Recent runs</div>
          <Button size="sm" variant="ghost" onClick={refresh} disabled={pending}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Refresh
          </Button>
        </div>
        <div className="overflow-x-auto rounded border border-line-subtle">
          <table className="w-full text-xs">
            <thead className="bg-surface-muted">
              <tr className="text-left text-[10px] uppercase tracking-wide text-ink-tertiary">
                <th className="px-3 py-2">Triggered</th>
                <th className="px-3 py-2">Snapshot</th>
                <th className="px-3 py-2">Mode</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Validation</th>
                <th className="px-3 py-2 text-right">Tables</th>
                <th className="px-3 py-2 text-right">Rows</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {initialData.runs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-ink-tertiary">
                    No runs yet. Queue one above.
                  </td>
                </tr>
              ) : (
                initialData.runs.map((r) => (
                  <tr key={r.id} className="border-t border-line-subtle">
                    <td className="px-3 py-2 tabular-nums text-ink-secondary">
                      {new Date(r.triggeredAt).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{r.snapshotDate}</td>
                    <td className="px-3 py-2">
                      <StatusPill
                        status="custom"
                        color={r.mode === 'production' ? 'critical' : 'neutral'}
                        label={r.mode}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill
                        status="custom"
                        color={runStatusColor(r.status)}
                        label={r.status}
                      />
                    </td>
                    <td className="px-3 py-2">
                      {r.validationStatus ? (
                        <StatusPill
                          status="custom"
                          color={validationColor(r.validationStatus)}
                          label={r.validationStatus}
                        />
                      ) : (
                        <span className="text-ink-tertiary">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.tablesSucceeded}/{r.tablesTotal}
                      {r.tablesFailed > 0 ? (
                        <span className="ml-1 text-red-400">+{r.tablesFailed} failed</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.rowsImported.toLocaleString()}
                      {r.rowsFailed > 0 ? (
                        <span className="ml-1 text-red-400">/ {r.rowsFailed}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/admin/migration/${r.id}`}
                        className="text-ink-primary hover:underline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <div className="text-sm font-medium text-ink-primary mb-2 flex items-center gap-2">
          <CircleDashed className="h-4 w-4" /> What this page does
        </div>
        <ul className="space-y-1.5 text-xs text-ink-secondary list-disc pl-5">
          <li>
            <strong>Upload</strong> Gamma&apos;s exported CSVs into{' '}
            <code className="text-[11px]">gamma-snapshots/YYYY-MM-DD/</code> on R2. The importer
            reads from there.
          </li>
          <li>
            <strong>Queue a run</strong> — the worker imports the snapshot, runs all idempotent
            entity importers, then auto-runs validation gates per docs/13 §5.
          </li>
          <li>
            <strong>Dual-capture</strong> — flip ON 30 days before cutover so vendor webhooks land
            in <code>pending_webhooks</code> without firing handlers. Replay on cutover night.
          </li>
          <li>
            <strong>Review queue</strong> — ambiguous Gamma data (e.g. unknown rsg text) lands here
            for human resolution; cutover blocked until empty.
          </li>
        </ul>
      </Card>
    </div>
  )
}

type Tone = 'positive' | 'critical' | 'notice' | 'neutral' | 'attention'

function runStatusColor(status: string): Tone {
  if (status === 'imported' || status === 'validated') return 'positive'
  if (status === 'failed' || status === 'cancelled') return 'critical'
  if (status === 'queued' || status === 'running') return 'notice'
  return 'neutral'
}

function validationColor(status: string): Tone {
  if (status === 'passed') return 'positive'
  if (status === 'failed') return 'critical'
  if (status === 'soft_warnings') return 'notice'
  return 'neutral'
}
