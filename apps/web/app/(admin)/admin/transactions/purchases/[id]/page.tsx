import Link from 'next/link'
import { notFound } from 'next/navigation'

import { DetailLayout, KeyValueGrid, PageHeader, StatTile, StatusPill } from '@coinfrenzy/ui/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@coinfrenzy/ui/primitives/card'

import { requireAdminSession } from '@/lib/admin-session'
import { formatCoins, formatUsd } from '@/lib/format'

import { fetchPurchaseDetail } from '../../_data'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PurchaseDetailPage({ params }: PageProps) {
  await requireAdminSession()
  const { id } = await params
  const detail = await fetchPurchaseDetail(id)
  if (!detail) notFound()
  const { purchase, ledgerEntries } = detail

  return (
    <div className="space-y-8 px-8 py-8">
      <PageHeader
        title={`Purchase ${purchase.id.slice(0, 8)}`}
        subtitle={purchase.playerEmail}
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'Transactions' },
          { label: 'Purchases', href: '/admin/transactions/purchases' },
          { label: purchase.id.slice(0, 8) },
        ]}
        renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      />

      <DetailLayout
        primary={
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile
                label="Amount"
                value={formatUsd(purchase.amountUsd.toString())}
                unit="USD"
              />
              <StatTile
                label="GC granted"
                value={formatCoins(BigInt(purchase.baseGc) + BigInt(purchase.bonusGc))}
                unit="GC"
              />
              <StatTile
                label="SC granted"
                value={formatCoins(BigInt(purchase.baseSc) + BigInt(purchase.bonusSc))}
                unit="SC"
              />
              <StatTile
                label="Status"
                value={<StatusPill status="custom" color="neutral" label={purchase.status} />}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Ledger entries</CardTitle>
              </CardHeader>
              <CardContent>
                {ledgerEntries.length === 0 ? (
                  <p className="text-sm text-ink-tertiary">
                    No ledger entries linked to this purchase.
                  </p>
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
                      {ledgerEntries.map((e) => (
                        <tr key={e.id} className="border-b border-line-subtle last:border-b-0">
                          <td className="py-2.5 pr-3 text-sm text-ink-primary">{e.source}</td>
                          <td className="py-2.5 pr-3 text-sm capitalize text-ink-secondary">
                            {e.leg}
                          </td>
                          <td className="py-2.5 pr-3 text-sm text-ink-secondary">{e.currency}</td>
                          <td className="py-2.5 pl-3 text-right text-sm tabular-nums text-ink-primary">
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
                <CardTitle>Purchase</CardTitle>
              </CardHeader>
              <CardContent>
                <KeyValueGrid
                  items={[
                    {
                      label: 'ID',
                      value: <span className="font-mono text-xs">{purchase.id}</span>,
                    },
                    {
                      label: 'When',
                      value: new Date(purchase.createdAt).toLocaleString(),
                    },
                    { label: 'Package', value: purchase.packageName ?? 'Custom' },
                    { label: 'Promo code', value: purchase.promoCode ?? '—' },
                    {
                      label: 'Card',
                      value: purchase.cardBrand
                        ? `${purchase.cardBrand} ···· ${purchase.cardLast4 ?? '****'}`
                        : '—',
                    },
                    {
                      label: 'Finix transfer',
                      value: purchase.finixTransferId ? (
                        <span className="font-mono text-xs">{purchase.finixTransferId}</span>
                      ) : (
                        '—'
                      ),
                    },
                    {
                      label: 'Completed at',
                      value: purchase.completedAt
                        ? new Date(purchase.completedAt).toLocaleString()
                        : '—',
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
                    { label: 'Email', value: purchase.playerEmail },
                    {
                      label: 'View',
                      value: (
                        <Link
                          href={`/admin/players/${purchase.playerId}`}
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
            {purchase.failureReason ? (
              <Card>
                <CardHeader>
                  <CardTitle>Failure</CardTitle>
                </CardHeader>
                <CardContent>
                  <KeyValueGrid
                    items={[
                      { label: 'Reason', value: purchase.failureReason },
                      { label: 'Message', value: purchase.failureMessage ?? '—' },
                    ]}
                  />
                </CardContent>
              </Card>
            ) : null}
          </>
        }
      />
    </div>
  )
}
