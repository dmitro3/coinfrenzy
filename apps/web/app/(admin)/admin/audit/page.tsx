import { redirect } from 'next/navigation'
import Link from 'next/link'
import { and, desc, gte, lte, or, sql } from 'drizzle-orm'

import { canReadAuditLog } from '@coinfrenzy/core/auth'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'
import { Input } from '@coinfrenzy/ui/primitives/input'
import { PageHeader } from '@coinfrenzy/ui/admin/layout/PageHeader'

import { ExportCsvButton } from '@/components/export-csv-button'
import { requireAdminSession } from '@/lib/admin-session'
import { AuditTable, type AuditRow } from './audit-table'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{
    q?: string
    kind?: string
    from?: string
    to?: string
    limit?: string
  }>
}

const ACTOR_KINDS = ['admin', 'system', 'player', 'anonymous'] as const

export default async function AuditLogPage({ searchParams }: PageProps) {
  const session = await requireAdminSession('/admin/audit')
  if (!canReadAuditLog(session.payload.role)) {
    redirect('/admin')
  }
  const sp = await searchParams
  const q = sp.q?.trim() ?? ''
  const kind = (sp.kind ?? '').trim()
  const fromStr = sp.from?.trim() ?? ''
  const toStr = sp.to?.trim() ?? ''
  const limitRaw = Number(sp.limit ?? '500')
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 2_000) : 500

  const db = getDb()

  const conds = []
  if (q.length >= 2) {
    const pattern = `%${q}%`
    conds.push(
      or(
        sql`${schema.auditLog.action} ilike ${pattern}`,
        sql`coalesce(${schema.auditLog.actorId}::text, '') ilike ${pattern}`,
        sql`coalesce(${schema.auditLog.resourceId}, '') ilike ${pattern}`,
        sql`coalesce(${schema.auditLog.resourceKind}, '') ilike ${pattern}`,
        sql`coalesce(${schema.auditLog.reason}, '') ilike ${pattern}`,
      )!,
    )
  }
  if (kind && (ACTOR_KINDS as readonly string[]).includes(kind)) {
    conds.push(sql`${schema.auditLog.actorKind} = ${kind}`)
  }
  if (fromStr) {
    const d = new Date(fromStr)
    if (!Number.isNaN(d.getTime())) conds.push(gte(schema.auditLog.occurredAt, d))
  }
  if (toStr) {
    const d = new Date(toStr)
    if (!Number.isNaN(d.getTime())) conds.push(lte(schema.auditLog.occurredAt, d))
  }

  const rows = await db
    .select({
      id: schema.auditLog.id,
      actorKind: schema.auditLog.actorKind,
      actorId: schema.auditLog.actorId,
      actorRole: schema.auditLog.actorRole,
      action: schema.auditLog.action,
      resourceKind: schema.auditLog.resourceKind,
      resourceId: schema.auditLog.resourceId,
      ip: schema.auditLog.ip,
      occurredAt: schema.auditLog.occurredAt,
      reason: schema.auditLog.reason,
    })
    .from(schema.auditLog)
    .where(conds.length > 0 ? and(...conds) : sql`true`)
    .orderBy(desc(schema.auditLog.occurredAt))
    .limit(limit)

  const data: AuditRow[] = rows.map((r) => ({
    id: r.id,
    actorKind: r.actorKind,
    actorId: r.actorId,
    actorRole: r.actorRole,
    action: r.action,
    resourceKind: r.resourceKind,
    resourceId: r.resourceId,
    ip: r.ip ?? null,
    occurredAt: r.occurredAt.toISOString(),
    reason: r.reason,
  }))

  const anyFilter = q || kind || fromStr || toStr

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Audit log"
        subtitle={`${rows.length.toLocaleString()} ${rows.length === 1 ? 'entry' : 'entries'} (limit ${limit.toLocaleString()})`}
        description="Append-only feed of every admin and system action. Filters below run server-side; the export button respects them."
        actions={<ExportCsvButton href="/api/admin/audit/export" />}
      />

      <form
        method="get"
        className="flex flex-wrap items-end gap-2 rounded-md border border-line-subtle bg-surface p-3"
      >
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-wide text-ink-tertiary" htmlFor="q">
            Search
          </label>
          <Input
            id="q"
            type="search"
            name="q"
            defaultValue={q}
            placeholder="action, actor id, resource, reason"
            className="h-9 w-72 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-wide text-ink-tertiary" htmlFor="kind">
            Actor kind
          </label>
          <select
            id="kind"
            name="kind"
            defaultValue={kind}
            className="h-9 rounded-md border border-line-subtle bg-bg px-3 text-sm text-ink-primary"
          >
            <option value="">All</option>
            {ACTOR_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-wide text-ink-tertiary" htmlFor="from">
            From
          </label>
          <Input
            id="from"
            type="datetime-local"
            name="from"
            defaultValue={fromStr}
            className="h-9 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-wide text-ink-tertiary" htmlFor="to">
            To
          </label>
          <Input
            id="to"
            type="datetime-local"
            name="to"
            defaultValue={toStr}
            className="h-9 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-wide text-ink-tertiary" htmlFor="limit">
            Limit
          </label>
          <select
            id="limit"
            name="limit"
            defaultValue={String(limit)}
            className="h-9 rounded-md border border-line-subtle bg-bg px-3 text-sm text-ink-primary"
          >
            <option value="100">100</option>
            <option value="500">500</option>
            <option value="1000">1,000</option>
            <option value="2000">2,000</option>
          </select>
        </div>
        <button
          type="submit"
          className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent/90"
        >
          Apply
        </button>
        {anyFilter ? (
          <Link
            href="/admin/audit"
            className="h-9 inline-flex items-center text-xs text-ink-tertiary hover:text-ink-primary"
          >
            Clear
          </Link>
        ) : null}
      </form>

      <AuditTable rows={data} />
    </div>
  )
}
