import Link from 'next/link'

import { casino } from '@coinfrenzy/core'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'

import { requireAdminSession } from '@/lib/admin-session'
import { buildAdminRscContext } from '@/lib/admin-rsc-context'

import { SubCategoriesClient } from './sub-categories-client'

export const dynamic = 'force-dynamic'

export default async function SubCategoriesPage() {
  await requireAdminSession('/admin/casino/sub-categories')
  const ctx = buildAdminRscContext()
  const rows = await casino.listSubCategories(ctx)

  const total = rows.length
  const inLobby = rows.filter((r) => r.inLobby && r.status === 'active').length
  const totalGames = rows.reduce((sum, r) => sum + r.gameCount, 0)
  const types = new Set(rows.map((r) => r.type)).size

  return (
    <ListPageShell
      title="Sub Categories"
      subtitle={`${total} categories`}
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'Casino' },
        { label: 'Sub Categories' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      insights={[
        { label: 'In lobby', value: inLobby.toLocaleString(), tone: 'positive' },
        { label: 'Total categories', value: total.toLocaleString(), tone: 'neutral' },
        { label: 'Type buckets', value: types.toLocaleString(), tone: 'neutral' },
        { label: 'Games categorised', value: totalGames.toLocaleString(), tone: 'positive' },
      ]}
    >
      <SubCategoriesClient initialRows={rows} />
    </ListPageShell>
  )
}
