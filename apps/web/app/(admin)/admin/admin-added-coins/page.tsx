import 'server-only'

import Link from 'next/link'
import { ChevronRight, Coins } from 'lucide-react'
import { desc, eq, ilike, or, sql } from 'drizzle-orm'

import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'
import { EmptyState, StatusPill } from '@coinfrenzy/ui/admin'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'
import { Input } from '@coinfrenzy/ui/primitives/input'

import { ExportCsvButton } from '@/components/export-csv-button'
import { requireAdminSession } from '@/lib/admin-session'
import { formatCoins } from '@/lib/format'

export const dynamic = 'force-dynamic'

// Color the bucket pill so credit-vs-bonus-vs-promo tells a fast visual story.
// Allowed values mirror the admin_adjustments.sub_bucket CHECK constraint.
const SUB_BUCKET_TONE: Record<
  string,
  'positive' | 'attention' | 'critical' | 'notice' | 'neutral'
> = {
  purchased: 'neutral',
  bonus: 'positive',
  promo: 'notice',
  earned: 'attention',
}

interface PageProps {
  searchParams: Promise<{ currency?: string; direction?: string; q?: string }>
}

export default async function Page({ searchParams }: PageProps) {
  await requireAdminSession('/admin/admin-added-coins')
  const sp = await searchParams
  const currencyFilter = sp.currency
  const directionFilter = sp.direction
  const search = sp.q?.trim() ?? ''

  const db = getDb()

  // Aggregates for the insights tiles
  const [agg] = (await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM admin_adjustments WHERE created_at::date = current_date) AS today,
      coalesce((SELECT sum(amount)::text FROM admin_adjustments
        WHERE currency = 'GC' AND direction = 'credit' AND created_at::date = current_date), '0') AS gc_added_today,
      coalesce((SELECT sum(amount)::text FROM admin_adjustments
        WHERE currency = 'SC' AND direction = 'credit' AND created_at::date = current_date), '0') AS sc_added_today
  `)) as unknown as Array<{ today: number; gc_added_today: string; sc_added_today: string }>

  // Top admin by adjustment count this week
  const topRows = (await db.execute(sql`
    SELECT a.admin_id, count(*)::int AS n
    FROM admin_adjustments a
    WHERE a.created_at > now() - interval '7 days'
    GROUP BY a.admin_id
    ORDER BY n DESC
    LIMIT 1
  `)) as unknown as Array<{ admin_id: string; n: number }>

  let topAdmin: { name: string; n: number } | null = null
  if (topRows[0]) {
    const adminInfo = await db
      .select({
        id: schema.admins.id,
        displayName: schema.admins.displayName,
        email: schema.admins.email,
      })
      .from(schema.admins)
      .where(eq(schema.admins.id, topRows[0].admin_id))
      .limit(1)
    topAdmin = {
      name: adminInfo[0]?.displayName ?? adminInfo[0]?.email ?? 'unknown',
      n: topRows[0].n,
    }
  }

  // Recent adjustments
  const wheres = []
  if (currencyFilter && currencyFilter !== 'all') {
    wheres.push(eq(schema.adminAdjustments.currency, currencyFilter))
  }
  if (directionFilter && directionFilter !== 'all') {
    wheres.push(eq(schema.adminAdjustments.direction, directionFilter))
  }
  if (search.length >= 2) {
    const q = `%${search}%`
    wheres.push(
      or(
        ilike(schema.players.email, q),
        ilike(schema.players.username, q),
        ilike(schema.players.displayName, q),
      )!,
    )
  }

  const rows = await db
    .select({
      id: schema.adminAdjustments.id,
      playerId: schema.adminAdjustments.playerId,
      adminId: schema.adminAdjustments.adminId,
      amount: schema.adminAdjustments.amount,
      currency: schema.adminAdjustments.currency,
      subBucket: schema.adminAdjustments.subBucket,
      direction: schema.adminAdjustments.direction,
      reason: schema.adminAdjustments.reason,
      reasonCategory: schema.adminAdjustments.reasonCategory,
      createdAt: schema.adminAdjustments.createdAt,
      playerEmail: schema.players.email,
      playerDisplayName: schema.players.displayName,
      playerUsername: schema.players.username,
    })
    .from(schema.adminAdjustments)
    .leftJoin(schema.players, sql`${schema.players.id} = ${schema.adminAdjustments.playerId}`)
    .where(wheres.length > 0 ? sql.join(wheres, sql` and `) : undefined)
    .orderBy(desc(schema.adminAdjustments.createdAt))
    .limit(200)

  // Resolve admin names
  const adminIds = Array.from(new Set(rows.map((r) => r.adminId)))
  const adminMap = new Map<string, string>()
  if (adminIds.length > 0) {
    const adminRows = await db
      .select({
        id: schema.admins.id,
        displayName: schema.admins.displayName,
        email: schema.admins.email,
      })
      .from(schema.admins)
      .where(
        sql`${schema.admins.id} in (${sql.join(
          adminIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      )
    for (const a of adminRows) {
      adminMap.set(a.id, a.displayName ?? a.email)
    }
  }

  return (
    <ListPageShell
      title="Admin added coins"
      subtitle={`${rows.length.toLocaleString()} loaded`}
      description="Audit trail of every manual balance adjustment. Each row corresponds to a paired ledger entry."
      breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Admin added coins' }]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      actions={<ExportCsvButton href="/api/admin/admin-adjustments/export" />}
      insights={[
        { label: 'Adjustments today', value: (agg?.today ?? 0).toLocaleString(), tone: 'neutral' },
        {
          label: 'GC added today',
          value: formatCoins(agg?.gc_added_today ?? '0'),
          tone: 'positive',
        },
        {
          label: 'SC added today',
          value: formatCoins(agg?.sc_added_today ?? '0'),
          tone: 'positive',
        },
        {
          label: 'Top admin (7d)',
          value: topAdmin ? topAdmin.name : '—',
          delta: topAdmin ? `${topAdmin.n.toLocaleString()} adjustments` : undefined,
          tone: 'notice',
        },
      ]}
    >
      <form
        method="get"
        className="flex flex-wrap items-center gap-2 rounded-md border border-line-subtle bg-surface p-3"
      >
        <Input
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Search player (email, username, name)"
          className="h-9 w-72 text-sm"
        />
        <select
          name="currency"
          defaultValue={currencyFilter ?? 'all'}
          className="h-9 rounded-md border border-line-subtle bg-bg px-3 text-sm text-ink-primary"
        >
          <option value="all">All currencies</option>
          <option value="GC">GC</option>
          <option value="SC">SC</option>
        </select>
        <select
          name="direction"
          defaultValue={directionFilter ?? 'all'}
          className="h-9 rounded-md border border-line-subtle bg-bg px-3 text-sm text-ink-primary"
        >
          <option value="all">All directions</option>
          <option value="credit">Credit</option>
          <option value="debit">Debit</option>
        </select>
        <button
          type="submit"
          className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent/90"
        >
          Apply
        </button>
        {search || currencyFilter || directionFilter ? (
          <Link
            href="/admin/admin-added-coins"
            className="h-9 inline-flex items-center text-xs text-ink-tertiary hover:text-ink-primary"
          >
            Clear
          </Link>
        ) : null}
      </form>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              icon={<Coins />}
              title="No adjustments match"
              description={
                search
                  ? `No adjustments found for "${search}". Try a broader query or clear the filter.`
                  : 'Try clearing the filters.'
              }
            />
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line-subtle text-left font-medium uppercase tracking-wide text-ink-tertiary">
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Admin</th>
                  <th className="px-3 py-2">Player credited</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Bucket</th>
                  <th className="px-3 py-2">Reason</th>
                  <th className="px-3 py-2 text-right">Profile</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isCredit = r.direction === 'credit'
                  const sign = isCredit ? '+' : '−'
                  const playerLabel =
                    r.playerDisplayName?.trim() ||
                    r.playerUsername?.trim() ||
                    r.playerEmail ||
                    r.playerId.slice(0, 8)
                  const hasSecondaryLine =
                    (r.playerDisplayName?.trim() || r.playerUsername?.trim()) && r.playerEmail
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-line-subtle last:border-b-0 hover:bg-surface-hover"
                    >
                      <td
                        className="px-3 py-2 tabular-nums text-ink-secondary"
                        title={r.createdAt.toISOString() + ` • adjustment id ${r.id}`}
                      >
                        {r.createdAt.toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-3 py-2 text-ink-primary">
                        {adminMap.get(r.adminId) ?? r.adminId.slice(0, 8)}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/players/${r.playerId}`}
                          className="block leading-tight hover:underline"
                          title="Open player profile"
                        >
                          <div className="font-medium text-ink-primary">{playerLabel}</div>
                          {hasSecondaryLine ? (
                            <div className="text-[11px] text-ink-tertiary">{r.playerEmail}</div>
                          ) : null}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <span
                          className={
                            'tabular-nums font-semibold ' +
                            (isCredit ? 'text-emerald-500' : 'text-red-500')
                          }
                        >
                          {sign}
                          {formatCoins(r.amount.toString())}
                        </span>
                        <span className="ml-1 text-[10px] font-medium uppercase tracking-wide text-ink-tertiary">
                          {r.currency}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <StatusPill
                          status="custom"
                          color={SUB_BUCKET_TONE[r.subBucket ?? ''] ?? 'neutral'}
                          label={(r.subBucket ?? '—').toUpperCase()}
                        />
                      </td>
                      <td className="px-3 py-2 text-ink-secondary">
                        <div className="line-clamp-1">{r.reason}</div>
                        <div className="text-[10px] uppercase tracking-wide text-ink-tertiary">
                          {r.reasonCategory}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          href={`/admin/players/${r.playerId}`}
                          className="inline-flex items-center gap-0.5 text-xs font-medium text-ink-primary hover:underline"
                        >
                          Open
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </ListPageShell>
  )
}
