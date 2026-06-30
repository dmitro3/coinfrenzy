import 'server-only'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { and, desc, eq, sql } from 'drizzle-orm'

import { getDb, schema } from '@coinfrenzy/db'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'

import { requireAdminSession } from '@/lib/admin-session'

import { formatUsdCompact } from '../_shared.client'
import { TaxQueueClient, type TaxQueueRow } from './tax-queue-client'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

// docs/07 §10 — 1099-MISC review queue. Drives `tax_reports` rows from
// status=pending_generation → generated → delivered → filed (or
// cancelled). Master-only.

export default async function TaxReportsPage({ searchParams }: PageProps) {
  const session = await requireAdminSession('/admin/reports/tax')
  if (session.payload.role !== 'master') redirect('/admin/reports')

  const params = await searchParams
  const yearRaw = typeof params.year === 'string' ? params.year : undefined
  const statusFilter = typeof params.status === 'string' ? params.status : 'all'
  const today = new Date()
  const defaultYear = today.getUTCFullYear() - 1
  const year = yearRaw && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : defaultYear

  const db = getDb()

  const yearRows = await db
    .select({ year: schema.taxReports.taxYear })
    .from(schema.taxReports)
    .groupBy(schema.taxReports.taxYear)
    .orderBy(desc(schema.taxReports.taxYear))
  const years = Array.from(
    new Set([year, defaultYear, today.getUTCFullYear(), ...yearRows.map((r) => r.year)]),
  )
    .filter((y) => y > 2020)
    .sort((a, b) => b - a)

  const whereClauses = [eq(schema.taxReports.taxYear, year)]
  if (statusFilter !== 'all') {
    whereClauses.push(eq(schema.taxReports.status, statusFilter))
  }

  const rows = await db
    .select({
      id: schema.taxReports.id,
      playerId: schema.taxReports.playerId,
      playerEmail: schema.players.email,
      playerDisplayName: schema.players.displayName,
      taxYear: schema.taxReports.taxYear,
      formType: schema.taxReports.formType,
      totalAmountUsd: schema.taxReports.totalAmountUsd,
      redemptionCount: schema.taxReports.redemptionCount,
      status: schema.taxReports.status,
      generatedAt: schema.taxReports.generatedAt,
      deliveredAt: schema.taxReports.deliveredAt,
      filedAt: schema.taxReports.filedAt,
      deliveryMethod: schema.taxReports.deliveryMethod,
      createdAt: schema.taxReports.createdAt,
    })
    .from(schema.taxReports)
    .leftJoin(schema.players, eq(schema.players.id, schema.taxReports.playerId))
    .where(and(...whereClauses))
    .orderBy(desc(schema.taxReports.totalAmountUsd))

  const data: TaxQueueRow[] = rows.map((r) => ({
    id: r.id,
    playerId: r.playerId,
    playerEmail: r.playerEmail ?? '—',
    playerDisplayName: r.playerDisplayName ?? null,
    taxYear: r.taxYear,
    formType: r.formType,
    totalAmountUsd: r.totalAmountUsd.toString(),
    redemptionCount: r.redemptionCount,
    status: r.status,
    generatedAt: r.generatedAt ? r.generatedAt.toISOString() : null,
    deliveredAt: r.deliveredAt ? r.deliveredAt.toISOString() : null,
    filedAt: r.filedAt ? r.filedAt.toISOString() : null,
    deliveryMethod: r.deliveryMethod ?? null,
    createdAt: r.createdAt.toISOString(),
  }))

  const totals = await db
    .select({
      status: schema.taxReports.status,
      cnt: sql<string>`count(*)`.as('cnt'),
      total: sql<string>`coalesce(sum(${schema.taxReports.totalAmountUsd}), 0)`.as('total'),
    })
    .from(schema.taxReports)
    .where(eq(schema.taxReports.taxYear, year))
    .groupBy(schema.taxReports.status)

  const counts: Record<string, number> = {}
  let totalUsdAllStatuses = 0n
  for (const t of totals) {
    counts[t.status] = Number(t.cnt)
    totalUsdAllStatuses += parseNumeric(t.total)
  }
  const totalRows = Object.values(counts).reduce((acc, n) => acc + n, 0)

  return (
    <ListPageShell
      title="1099-MISC Tax Queue"
      subtitle={`Tax year ${year}`}
      description="Players whose paid redemptions hit $600 in the calendar year. Generate forms, mark delivered, file with IRS."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'Reports', href: '/admin/reports' },
        { label: '1099-MISC Tax Queue' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      insights={[
        { label: 'Tax year', value: String(year), tone: 'neutral' },
        { label: 'Total filings', value: String(totalRows), tone: 'neutral' },
        {
          label: 'Pending',
          value: String(counts['pending_generation'] ?? 0),
          tone: (counts['pending_generation'] ?? 0) > 0 ? 'notice' : 'positive',
        },
        {
          label: 'Filed',
          value: String(counts['filed'] ?? 0),
          tone: 'positive',
        },
        {
          label: 'Total $ owed',
          value: formatUsdCompact(totalUsdAllStatuses),
          tone: 'neutral',
        },
      ]}
    >
      <TaxQueueClient rows={data} year={year} years={years} statusFilter={statusFilter} />
    </ListPageShell>
  )
}

function parseNumeric(raw: string | number | bigint): bigint {
  if (typeof raw === 'bigint') return raw
  const str = typeof raw === 'number' ? raw.toString() : raw
  if (!str.includes('.')) return BigInt(str) * 10_000n
  const negative = str.startsWith('-')
  const abs = negative ? str.slice(1) : str
  const [whole = '0', frac = ''] = abs.split('.')
  const fracPadded = frac.padEnd(4, '0').slice(0, 4)
  const total = BigInt(whole) * 10_000n + BigInt(fracPadded || '0')
  return negative ? -total : total
}
