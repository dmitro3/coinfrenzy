import Link from 'next/link'
import { notFound } from 'next/navigation'

import { DetailLayout, KeyValueGrid, PageHeader, StatTile, StatusPill } from '@coinfrenzy/ui/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@coinfrenzy/ui/primitives/card'

import { requireAdminSession } from '@/lib/admin-session'
import { formatCoins, formatUsd } from '@/lib/format'

import { fetchRedemptionDetailFull } from '../../_data'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function RedemptionDetailPage({ params }: PageProps) {
  await requireAdminSession()
  const { id } = await params
  const detail = await fetchRedemptionDetailFull(id)
  if (!detail) notFound()
  const { row, drainPlan, ledger, player } = detail

  return (
    <div className="space-y-8 px-8 py-8">
      <PageHeader
        title={`Redemption ${row.id.slice(0, 8)}`}
        subtitle={player.email}
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'Transactions' },
          { label: 'Redemptions', href: '/admin/transactions/redemptions' },
          { label: row.id.slice(0, 8) },
        ]}
        renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      />

      <DetailLayout
        primary={
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile label="USD" value={formatUsd(row.amountUsd.toString())} />
              <StatTile label="SC source" value={formatCoins(row.amountSc.toString())} unit="SC" />
              <StatTile label="Method" value={row.method === 'finix_ach' ? 'Finix ACH' : 'Debit'} />
              <StatTile
                label="Status"
                value={<StatusPill status="custom" color="neutral" label={row.status} />}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Drain plan</CardTitle>
              </CardHeader>
              <CardContent>
                {drainPlan.length === 0 ? (
                  <p className="text-sm text-ink-tertiary">No drain plan recorded.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line-subtle text-left text-xs font-medium text-ink-tertiary">
                        <th className="py-2 pr-3">Bucket</th>
                        <th className="py-2 pl-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drainPlan.map((d, i) => (
                        <tr key={i} className="border-b border-line-subtle last:border-b-0">
                          <td className="py-2.5 pr-3 capitalize text-ink-primary">{d.bucket}</td>
                          <td className="py-2.5 pl-3 text-right tabular-nums text-ink-primary">
                            {formatCoins(d.amount)} SC
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Ledger entries</CardTitle>
              </CardHeader>
              <CardContent>
                {ledger.length === 0 ? (
                  <p className="text-sm text-ink-tertiary">No ledger entries linked.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line-subtle text-left text-xs font-medium text-ink-tertiary">
                        <th className="py-2 pr-3">Source</th>
                        <th className="py-2 pr-3">Leg</th>
                        <th className="py-2 pr-3">Currency</th>
                        <th className="py-2 pl-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.map((e) => (
                        <tr key={e.id} className="border-b border-line-subtle last:border-b-0">
                          <td className="py-2.5 pr-3 text-ink-primary">{e.source}</td>
                          <td className="py-2.5 pr-3 capitalize text-ink-secondary">{e.leg}</td>
                          <td className="py-2.5 pr-3 text-ink-secondary">{e.currency}</td>
                          <td className="py-2.5 pl-3 text-right tabular-nums text-ink-primary">
                            {formatCoins(e.amount.toString())}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>
        }
        sidebar={
          <>
            <Card>
              <CardHeader>
                <CardTitle>Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <KeyValueGrid
                  items={[
                    { label: 'Requested', value: new Date(row.createdAt).toLocaleString() },
                    {
                      label: 'Approved',
                      value: row.approvedAt ? new Date(row.approvedAt).toLocaleString() : '—',
                    },
                    {
                      label: 'Paid',
                      value: row.paidAt ? new Date(row.paidAt).toLocaleString() : '—',
                    },
                  ]}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Player</CardTitle>
              </CardHeader>
              <CardContent>
                <KeyValueGrid
                  items={[
                    { label: 'Email', value: player.email },
                    { label: 'State', value: player.state ?? '—' },
                    {
                      label: 'KYC',
                      value: (
                        <StatusPill
                          status="custom"
                          color={player.kycLevel >= 2 ? 'positive' : 'attention'}
                          label={`L${player.kycLevel}`}
                        />
                      ),
                    },
                    {
                      label: 'Status',
                      value: <StatusPill status="custom" color="neutral" label={player.status} />,
                    },
                    {
                      label: 'View',
                      value: (
                        <Link
                          href={`/admin/players/${row.playerId}`}
                          className="text-brand hover:underline"
                        >
                          Open profile →
                        </Link>
                      ),
                    },
                  ]}
                />
              </CardContent>
            </Card>
          </>
        }
      />
    </div>
  )
}
