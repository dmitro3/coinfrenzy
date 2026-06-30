import { redirect } from 'next/navigation'
import Link from 'next/link'
import { and, desc, eq, sql } from 'drizzle-orm'

import { canReadAuditLog } from '@coinfrenzy/core/auth'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'
import { PageHeader } from '@coinfrenzy/ui/admin/layout/PageHeader'
import { StatusPill } from '@coinfrenzy/ui/admin/display/StatusPill'

import { requireAdminSession } from '@/lib/admin-session'
import { formatCoins } from '@/lib/format'

import { AleaFindingActions } from './_actions'

export const dynamic = 'force-dynamic'

// docs/04 §7.2 — Alea reconciliation findings list. One row per open
// discrepancy between Alea's authoritative round list and ours. The
// nightly cron in apps/worker/src/jobs/reconcile-alea.ts writes here.

const STATUS_FILTERS = ['open', 'resolved', 'ignored', 'replayed', 'all'] as const

type StatusFilter = (typeof STATUS_FILTERS)[number]

interface PageProps {
  searchParams: Promise<{
    status?: string
    kind?: string
    severity?: string
  }>
}

export default async function AleaFindingsPage({ searchParams }: PageProps) {
  const session = await requireAdminSession('/admin/integrity/alea')
  if (!canReadAuditLog(session.payload.role)) redirect('/admin')

  const sp = await searchParams
  const statusRaw = sp.status?.trim() || 'open'
  const status: StatusFilter = (STATUS_FILTERS as readonly string[]).includes(statusRaw)
    ? (statusRaw as StatusFilter)
    : 'open'

  const db = getDb()
  const conds = []
  if (status !== 'all') conds.push(eq(schema.aleaReconciliationFindings.status, status))
  if (sp.kind) conds.push(eq(schema.aleaReconciliationFindings.kind, sp.kind))
  if (sp.severity) conds.push(eq(schema.aleaReconciliationFindings.severity, sp.severity))

  const rows = await db
    .select()
    .from(schema.aleaReconciliationFindings)
    .where(conds.length ? and(...conds) : sql`true`)
    .orderBy(desc(schema.aleaReconciliationFindings.createdAt))
    .limit(500)

  const [counts] = await db.execute<{
    open: string
    open_critical: string
    resolved: string
    ignored: string
    replayed: string
  }>(sql`
    SELECT COUNT(*) FILTER (WHERE status = 'open')::text AS open,
           COUNT(*) FILTER (WHERE status = 'open' AND severity = 'critical')::text AS open_critical,
           COUNT(*) FILTER (WHERE status = 'resolved')::text AS resolved,
           COUNT(*) FILTER (WHERE status = 'ignored')::text AS ignored,
           COUNT(*) FILTER (WHERE status = 'replayed')::text AS replayed
    FROM alea_reconciliation_findings
  `)

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Alea reconciliation findings"
        subtitle={`${rows.length.toLocaleString()} ${rows.length === 1 ? 'row' : 'rows'} shown`}
        description="Output of the nightly Alea round-history reconciliation. Open critical rows page on-call. Resolve, ignore, or schedule replay below."
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'Integration health', href: '/admin/integrity' },
          { label: 'Alea findings' },
        ]}
        renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <CountTile label="Open" value={Number(counts?.open ?? 0)} tone="warn" />
        <CountTile label="Critical" value={Number(counts?.open_critical ?? 0)} tone="critical" />
        <CountTile label="Resolved" value={Number(counts?.resolved ?? 0)} tone="ok" />
        <CountTile label="Ignored" value={Number(counts?.ignored ?? 0)} tone="neutral" />
        <CountTile label="Replayed" value={Number(counts?.replayed ?? 0)} tone="neutral" />
      </div>

      <form
        method="get"
        className="flex flex-wrap items-end gap-2 rounded-md border border-line-subtle bg-surface p-3"
      >
        <Select name="status" label="Status" defaultValue={status} options={STATUS_FILTERS} />
        <Select
          name="kind"
          label="Kind"
          defaultValue={sp.kind ?? ''}
          options={[
            '',
            'missing_from_ours',
            'missing_from_alea',
            'amount_mismatch',
            'currency_mismatch',
            'status_mismatch',
          ]}
        />
        <Select
          name="severity"
          label="Severity"
          defaultValue={sp.severity ?? ''}
          options={['', 'info', 'warn', 'critical']}
        />
        <button
          type="submit"
          className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent/90"
        >
          Apply
        </button>
      </form>

      <div className="overflow-x-auto rounded-md border border-line-subtle">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs text-ink-tertiary">
            <tr>
              <th className="px-3 py-2">Detected</th>
              <th className="px-3 py-2">Round id</th>
              <th className="px-3 py-2">Kind</th>
              <th className="px-3 py-2">Severity</th>
              <th className="px-3 py-2 text-right">Alea bet / win</th>
              <th className="px-3 py-2 text-right">Ours bet / win</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center text-ink-tertiary">
                  No findings matching the current filter.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-mono text-xs text-ink-tertiary">
                    {r.createdAt.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{r.externalRoundId}</td>
                  <td className="px-3 py-2 text-xs">{r.kind}</td>
                  <td className="px-3 py-2">
                    <StatusPill
                      status="custom"
                      label={r.severity}
                      color={
                        r.severity === 'critical'
                          ? 'critical'
                          : r.severity === 'warn'
                            ? 'attention'
                            : 'neutral'
                      }
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {r.aleaBet != null ? formatCoins(r.aleaBet) : '—'} /{' '}
                    {r.aleaWin != null ? formatCoins(r.aleaWin) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {r.oursBet != null ? formatCoins(r.oursBet) : '—'} /{' '}
                    {r.oursWin != null ? formatCoins(r.oursWin) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill
                      status="custom"
                      label={r.status}
                      color={
                        r.status === 'open'
                          ? 'attention'
                          : r.status === 'resolved'
                            ? 'positive'
                            : 'neutral'
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    {r.status === 'open' ? (
                      <AleaFindingActions findingId={r.id} />
                    ) : (
                      <span className="text-xs text-ink-tertiary">{r.resolutionNotes ?? '—'}</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CountTile({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'ok' | 'warn' | 'critical' | 'neutral'
}) {
  const toneClass =
    tone === 'critical'
      ? 'text-red-600'
      : tone === 'warn'
        ? 'text-amber-600'
        : tone === 'ok'
          ? 'text-emerald-600'
          : 'text-ink-primary'
  return (
    <div className="rounded-md border border-line-subtle bg-card/60 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-ink-tertiary">{label}</div>
      <div className={'mt-1 font-mono text-2xl font-semibold ' + toneClass}>
        {value.toLocaleString()}
      </div>
    </div>
  )
}

function Select<T extends string>({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string
  label: string
  defaultValue: T | ''
  options: readonly (T | '')[]
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] uppercase tracking-wide text-ink-tertiary" htmlFor={name}>
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        className="h-9 rounded-md border border-line-subtle bg-bg px-3 text-sm text-ink-primary"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o === '' ? 'All' : o}
          </option>
        ))}
      </select>
    </div>
  )
}
