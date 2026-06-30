import Link from 'next/link'
import { desc, eq } from 'drizzle-orm'

import { canManageBonuses } from '@coinfrenzy/core/auth'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'

import { requireAdminSession } from '@/lib/admin-session'

import { ArchivedPanel, type ArchivedRow } from './_archived-panel'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const session = await requireAdminSession('/admin/promo-codes/archived')
  const db = getDb()
  const rows = await db
    .select({
      id: schema.promoCodes.id,
      code: schema.promoCodes.code,
      description: schema.promoCodes.description,
      bonusName: schema.bonuses.displayName,
      usesCount: schema.promoCodes.usesCount,
      validUntil: schema.promoCodes.validUntil,
      updatedAt: schema.promoCodes.updatedAt,
      status: schema.promoCodes.status,
    })
    .from(schema.promoCodes)
    .innerJoin(schema.bonuses, eq(schema.promoCodes.bonusId, schema.bonuses.id))
    .where(eq(schema.promoCodes.status, 'archived'))
    .orderBy(desc(schema.promoCodes.updatedAt))
    .limit(500)

  const serialized: ArchivedRow[] = rows.map((r) => ({
    id: r.id,
    code: r.code,
    description: r.description,
    bonusName: r.bonusName,
    usesCount: r.usesCount,
    validUntil: r.validUntil ? r.validUntil.toISOString() : null,
    updatedAt: r.updatedAt.toISOString(),
  }))

  const totalUses = serialized.reduce((s, r) => s + r.usesCount, 0)

  return (
    <ListPageShell
      title="Archived promo codes"
      subtitle={`${serialized.length.toLocaleString()} loaded`}
      description="Codes pulled from circulation. Kept for historical lookup. Restore puts a code back into the active list (validity window still applies)."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'Promo codes' },
        { label: 'Archived' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      insights={[
        { label: 'Archived', value: serialized.length.toLocaleString(), tone: 'neutral' },
        { label: 'Lifetime uses', value: totalUses.toLocaleString(), tone: 'neutral' },
      ]}
    >
      <ArchivedPanel rows={serialized} canManage={canManageBonuses(session.payload.role)} />
    </ListPageShell>
  )
}
