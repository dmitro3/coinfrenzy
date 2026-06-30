import Link from 'next/link'
import { Gift } from 'lucide-react'

import { EmptyState } from '@coinfrenzy/ui/admin'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'

import { requireAdminSession } from '@/lib/admin-session'
import { formatCoins } from '@/lib/format'

import { fetchPromoBonusMappings } from '../_data'

export const dynamic = 'force-dynamic'

export default async function Page() {
  await requireAdminSession('/admin/promo-codes/bonus')
  const rows = await fetchPromoBonusMappings()

  const overrides = rows.filter(
    (r) => r.overrideMultiplier !== null || r.overrideWindowHours !== null,
  ).length
  const totalUses = rows.reduce((s, r) => s + r.usesCount, 0)
  const distinctBonuses = new Set(rows.map((r) => r.bonusName)).size

  return (
    <ListPageShell
      title="Promo code → Bonus mapping"
      subtitle="Which codes trigger which bonus templates"
      description="Cross-reference view. Each promo code is bound to one bonus template; per-code overrides can adjust the playthrough multiplier or window."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'Promo codes' },
        { label: 'Bonus mapping' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      insights={[
        { label: 'Mapped codes', value: rows.length.toLocaleString(), tone: 'neutral' },
        { label: 'Distinct bonuses', value: distinctBonuses.toLocaleString(), tone: 'neutral' },
        {
          label: 'With overrides',
          value: overrides.toLocaleString(),
          tone: overrides > 0 ? 'notice' : 'neutral',
        },
        { label: 'Total redemptions', value: totalUses.toLocaleString(), tone: 'positive' },
      ]}
    >
      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              icon={<Gift />}
              title="No promo code mappings"
              description="Create a promo code from the Active tab to map it to a bonus template."
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line-subtle text-left text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                  <th className="px-4 py-2">Code</th>
                  <th className="px-4 py-2">Bonus</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2 text-right">Award</th>
                  <th className="px-4 py-2 text-right">Multiplier</th>
                  <th className="px-4 py-2 text-right">Window</th>
                  <th className="px-4 py-2 text-right">Per player</th>
                  <th className="px-4 py-2 text-right">Uses</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const effectiveMultiplier = r.overrideMultiplier
                    ? Number(r.overrideMultiplier)
                    : Number(r.bonusMultiplier)
                  const multiplierOverridden = r.overrideMultiplier !== null
                  const windowOverridden = r.overrideWindowHours !== null
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-line-subtle text-sm last:border-b-0 hover:bg-surface-hover"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/promo-codes/active?search=${encodeURIComponent(r.code)}`}
                          className="font-mono text-ink-primary hover:underline"
                        >
                          {r.code}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-ink-secondary">
                        <Link
                          href="/admin/bonus/templates"
                          className="hover:underline"
                          title="Open bonus templates"
                        >
                          {r.bonusName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs uppercase tracking-wide text-ink-tertiary">
                        {r.bonusType}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink-primary">
                        {r.bonusSc > 0n ? `${formatCoins(r.bonusSc.toString())} SC` : '—'}
                        {r.bonusGc > 0n ? (
                          <div className="text-xs text-ink-tertiary">
                            + {formatCoins(r.bonusGc.toString())} GC
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span
                          className={multiplierOverridden ? 'text-notice' : 'text-ink-secondary'}
                        >
                          {effectiveMultiplier.toFixed(1)}×
                        </span>
                        {multiplierOverridden ? (
                          <div className="text-[10px] uppercase tracking-wide text-notice">
                            override
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink-secondary">
                        {r.overrideWindowHours ? (
                          <>
                            <span className="text-notice">{r.overrideWindowHours}h</span>
                            <div className="text-[10px] uppercase tracking-wide text-notice">
                              override
                            </div>
                          </>
                        ) : (
                          <span className="text-ink-tertiary">
                            {windowOverridden ? '—' : 'template'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink-secondary">
                        {r.maxPerPlayer ?? '∞'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink-primary">
                        {r.usesCount.toLocaleString()}
                        {r.maxTotalUses ? (
                          <span className="text-ink-tertiary"> / {r.maxTotalUses}</span>
                        ) : null}
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
