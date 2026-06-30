import 'server-only'

import Link from 'next/link'
import { Lock } from 'lucide-react'
import { desc } from 'drizzle-orm'

import { canDeleteBlocklists, canManageBlocklists } from '@coinfrenzy/core/auth'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'
import { EmptyState } from '@coinfrenzy/ui/admin'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'
import { Button } from '@coinfrenzy/ui/primitives/button'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'

import { ExportCsvButton } from '@/components/export-csv-button'
import { requireAdminSession } from '@/lib/admin-session'
import { BlockCodeDialog, RemovePromoCodeButton } from './_client'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const session = await requireAdminSession('/admin/promocode-blocking')
  const role = session.payload.role
  const canAdd = canManageBlocklists(role)
  const canRemove = canDeleteBlocklists(role)
  const db = getDb()

  const rows = await db
    .select({
      code: schema.blockedPromoCodes.code,
      reason: schema.blockedPromoCodes.reason,
      addedAt: schema.blockedPromoCodes.addedAt,
    })
    .from(schema.blockedPromoCodes)
    .orderBy(desc(schema.blockedPromoCodes.addedAt))
    .limit(500)

  const recent30d = rows.filter((r) => Date.now() - r.addedAt.getTime() < 30 * 86_400_000).length

  return (
    <ListPageShell
      title="Promo code blocking"
      subtitle={`${rows.length.toLocaleString()} blocked`}
      description="Codes that the bonus engine refuses outright. Use for leaked codes, fraud campaigns, or staff-only codes."
      breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Promo code blocking' }]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      actions={
        <div className="flex items-center gap-2">
          <ExportCsvButton href="/api/admin/blocked-promo-codes/export" />
          {canAdd ? <BlockCodeDialog trigger={<Button>+ Block code</Button>} /> : null}
        </div>
      }
      insights={[
        { label: 'Total blocked', value: rows.length.toLocaleString(), tone: 'neutral' },
        {
          label: 'Added (30d)',
          value: recent30d.toLocaleString(),
          tone: recent30d > 0 ? 'attention' : 'neutral',
        },
      ]}
    >
      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              icon={<Lock />}
              title="No promo codes blocked"
              description="Block codes here when you discover leaks or fraud campaigns."
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line-subtle text-left text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                  <th className="px-4 py-2">Code</th>
                  <th className="px-4 py-2">Reason</th>
                  <th className="px-4 py-2">Blocked</th>
                  {canRemove ? <th className="px-4 py-2 text-right">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.code}
                    className="border-b border-line-subtle text-sm last:border-b-0 hover:bg-surface-hover"
                  >
                    <td className="px-4 py-3 font-mono text-ink-primary">{r.code}</td>
                    <td className="px-4 py-3 text-xs text-ink-secondary">{r.reason}</td>
                    <td className="px-4 py-3 text-xs text-ink-tertiary">
                      {r.addedAt.toLocaleString()}
                    </td>
                    {canRemove ? (
                      <td className="px-4 py-3 text-right">
                        <RemovePromoCodeButton code={r.code} />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </ListPageShell>
  )
}
