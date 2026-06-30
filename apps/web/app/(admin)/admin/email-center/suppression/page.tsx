import 'server-only'

import Link from 'next/link'
import { Ban } from 'lucide-react'
import { and, asc, desc, eq, ilike, sql } from 'drizzle-orm'

import { canDeleteSuppression, canManageSuppression } from '@coinfrenzy/core/auth'
import { getDb, schema } from '@coinfrenzy/db'
import { EmptyState } from '@coinfrenzy/ui/admin'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'

import { requireAdminSession } from '@/lib/admin-session'

import { AddTrigger, Table } from './_client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{
    search?: string
    source?: 'bounce' | 'complaint' | 'manual' | 'unsubscribe' | 'tcpa_stop'
  }>
}

export default async function Page({ searchParams }: PageProps) {
  const session = await requireAdminSession('/admin/email-center/suppression')
  const role = session.payload.role
  const sp = await searchParams
  const db = getDb()

  const conds = []
  if (sp.search) {
    conds.push(ilike(schema.crmSuppression.emailOrPhone, `%${sp.search}%`))
  }
  if (sp.source) {
    conds.push(eq(schema.crmSuppression.source, sp.source))
  }

  const rows = await db
    .select({
      emailOrPhone: schema.crmSuppression.emailOrPhone,
      reason: schema.crmSuppression.reason,
      source: schema.crmSuppression.source,
      addedAt: schema.crmSuppression.addedAt,
    })
    .from(schema.crmSuppression)
    .where(conds.length > 0 ? and(...conds) : sql`true`)
    .orderBy(desc(schema.crmSuppression.addedAt))
    .limit(500)

  const breakdownRows = await db
    .select({
      source: schema.crmSuppression.source,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.crmSuppression)
    .groupBy(schema.crmSuppression.source)
    .orderBy(asc(schema.crmSuppression.source))

  const breakdown = breakdownRows.reduce<Record<string, number>>((acc, b) => {
    acc[b.source] = b.n
    return acc
  }, {})
  const total = breakdownRows.reduce((sum, r) => sum + r.n, 0)

  const canAdd = canManageSuppression(role)
  const canRemove = canDeleteSuppression(role)

  const initial = rows.map((r) => ({
    emailOrPhone: r.emailOrPhone,
    reason: r.reason,
    source: r.source,
    addedAtIso: r.addedAt.toISOString(),
  }))

  return (
    <ListPageShell
      title="Suppression list"
      subtitle={`${total.toLocaleString()} entries`}
      description="Addresses on this list will not receive marketing. Bounce/complaint/TCPA stop entries should rarely be removed."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'Email Center', href: '/admin/email-center' },
        { label: 'Suppression' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      actions={<AddTrigger canAdd={canAdd} />}
      insights={[
        { label: 'Total', value: total.toLocaleString(), tone: 'neutral' },
        {
          label: 'Bounces',
          value: (breakdown.bounce ?? 0).toLocaleString(),
          tone: (breakdown.bounce ?? 0) > 50 ? 'notice' : 'neutral',
        },
        {
          label: 'Complaints',
          value: (breakdown.complaint ?? 0).toLocaleString(),
          tone: (breakdown.complaint ?? 0) > 0 ? 'critical' : 'neutral',
        },
        {
          label: 'Unsubscribes',
          value: (breakdown.unsubscribe ?? 0).toLocaleString(),
          tone: 'neutral',
        },
      ]}
    >
      <form
        method="GET"
        className="flex flex-wrap items-end gap-3 rounded-lg border border-line-subtle bg-surface px-4 py-3"
      >
        <div className="flex flex-col">
          <label className="text-[10px] uppercase tracking-wide text-ink-tertiary">Search</label>
          <input
            type="text"
            name="search"
            defaultValue={sp.search ?? ''}
            placeholder="email@example.com or +15551234567"
            className="h-8 w-72 rounded-md border border-line-subtle bg-bg px-2 text-sm text-ink-primary"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-[10px] uppercase tracking-wide text-ink-tertiary">Source</label>
          <select
            name="source"
            defaultValue={sp.source ?? ''}
            className="h-8 rounded-md border border-line-subtle bg-bg px-2 text-sm text-ink-primary"
          >
            <option value="">All</option>
            <option value="bounce">Bounce</option>
            <option value="complaint">Complaint</option>
            <option value="manual">Manual</option>
            <option value="unsubscribe">Unsubscribe</option>
            <option value="tcpa_stop">TCPA stop</option>
          </select>
        </div>
        <button
          type="submit"
          className="h-8 rounded-md border border-line-subtle bg-bg px-3 text-sm text-ink-primary hover:bg-surface-hover"
        >
          Apply
        </button>
        <Link
          href="/admin/email-center/suppression"
          className="text-xs text-ink-tertiary underline-offset-4 hover:underline"
        >
          Reset
        </Link>
      </form>

      <Card>
        <CardContent className="overflow-hidden p-0">
          {rows.length === 0 ? (
            <EmptyState
              icon={<Ban />}
              title="No suppressed addresses match"
              description="Loosen the filter or add a manual entry."
            />
          ) : (
            <Table rows={initial} canRemove={canRemove} />
          )}
        </CardContent>
      </Card>
    </ListPageShell>
  )
}
