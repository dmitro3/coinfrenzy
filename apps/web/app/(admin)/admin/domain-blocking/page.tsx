import 'server-only'

import Link from 'next/link'
import { ShieldOff } from 'lucide-react'
import { desc } from 'drizzle-orm'

import { canDeleteBlocklists, canManageBlocklists } from '@coinfrenzy/core/auth'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'
import { EmptyState, StatusPill } from '@coinfrenzy/ui/admin'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'
import { Button } from '@coinfrenzy/ui/primitives/button'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'

import { ExportCsvButton } from '@/components/export-csv-button'
import { requireAdminSession } from '@/lib/admin-session'
import { AddDomainDialog, RemoveDomainButton } from './_client'

export const dynamic = 'force-dynamic'

const TONE_FOR_REASON: Record<
  string,
  'positive' | 'attention' | 'critical' | 'notice' | 'neutral'
> = {
  disposable: 'notice',
  risky: 'attention',
  competitor: 'neutral',
  fraud: 'critical',
}

function categorize(reason: string): string {
  const r = reason.toLowerCase()
  if (/dispos|temp|burner|guerrilla|trash|10minute/.test(r)) return 'disposable'
  if (/risk|abuse/.test(r)) return 'risky'
  if (/competitor/.test(r)) return 'competitor'
  if (/fraud|chargeback/.test(r)) return 'fraud'
  return 'other'
}

export default async function Page() {
  const session = await requireAdminSession('/admin/domain-blocking')
  const role = session.payload.role
  const canAdd = canManageBlocklists(role)
  const canRemove = canDeleteBlocklists(role)
  const db = getDb()

  const rows = await db
    .select({
      domain: schema.blockedDomains.domain,
      reason: schema.blockedDomains.reason,
      addedAt: schema.blockedDomains.addedAt,
    })
    .from(schema.blockedDomains)
    .orderBy(desc(schema.blockedDomains.addedAt))
    .limit(500)

  const recent30d = rows.filter((r) => Date.now() - r.addedAt.getTime() < 30 * 86_400_000).length

  const categoryCounts = new Map<string, number>()
  for (const r of rows) {
    const c = categorize(r.reason)
    categoryCounts.set(c, (categoryCounts.get(c) ?? 0) + 1)
  }
  const top = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0]

  return (
    <ListPageShell
      title="Domain blocking"
      subtitle={`${rows.length.toLocaleString()} blocked`}
      description="Email-domain blocklist. Used at signup to refuse risky/disposable email providers."
      breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Domain blocking' }]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      actions={
        <div className="flex items-center gap-2">
          <ExportCsvButton href="/api/admin/blocked-domains/export" />
          {canAdd ? <AddDomainDialog trigger={<Button>+ Add domain</Button>} /> : null}
        </div>
      }
      insights={[
        { label: 'Total blocked', value: rows.length.toLocaleString(), tone: 'neutral' },
        {
          label: 'Added (30d)',
          value: recent30d.toLocaleString(),
          tone: recent30d > 0 ? 'attention' : 'neutral',
        },
        {
          label: 'Top category',
          value: top ? top[0] : '—',
          delta: top ? `${top[1].toLocaleString()} domains` : undefined,
          tone: 'neutral',
        },
        {
          label: 'Categories',
          value: categoryCounts.size.toLocaleString(),
          tone: 'neutral',
        },
      ]}
    >
      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              icon={<ShieldOff />}
              title="No domains blocked"
              description="Add domains here to refuse signups from disposable/risky providers."
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line-subtle text-left text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                  <th className="px-4 py-2">Domain</th>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2">Reason</th>
                  <th className="px-4 py-2">Added</th>
                  {canRemove ? <th className="px-4 py-2 text-right">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const cat = categorize(r.reason)
                  return (
                    <tr
                      key={r.domain}
                      className="border-b border-line-subtle text-sm last:border-b-0 hover:bg-surface-hover"
                    >
                      <td className="px-4 py-3 font-mono text-ink-primary">{r.domain}</td>
                      <td className="px-4 py-3">
                        <StatusPill
                          status="custom"
                          color={TONE_FOR_REASON[cat] ?? 'neutral'}
                          label={cat}
                        />
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-secondary">{r.reason}</td>
                      <td className="px-4 py-3 text-xs text-ink-tertiary">
                        {r.addedAt.toLocaleString()}
                      </td>
                      {canRemove ? (
                        <td className="px-4 py-3 text-right">
                          <RemoveDomainButton domain={r.domain} />
                        </td>
                      ) : null}
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
