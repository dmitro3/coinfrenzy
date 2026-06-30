import 'server-only'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { asc, sql } from 'drizzle-orm'

import { auth as coreAuth, system as systemMod } from '@coinfrenzy/core'
import { getDb, schema } from '@coinfrenzy/db'

import { buildAdminRscContext } from '@/lib/admin-rsc-context'
import { PageHeader } from '@coinfrenzy/ui/admin/layout/PageHeader'

import { requireAdminSession } from '@/lib/admin-session'

import { DEFAULT_TIER_VALUES, TierForm } from '../_form'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const session = await requireAdminSession('/admin/tiers/new')
  if (!coreAuth.hasAtLeast(session.payload.role, 'manager')) {
    redirect('/admin/tiers')
  }

  const db = getDb()
  const rscCtx = buildAdminRscContext()
  const [maxLevelRow, capsRaw] = await Promise.all([
    db
      .select({ max: sql<number>`coalesce(max(${schema.tiers.level}), 0)` })
      .from(schema.tiers)
      .orderBy(asc(schema.tiers.level)),
    systemMod.getTierCaps(rscCtx),
  ])
  const nextLevel = (maxLevelRow[0]?.max ?? 0) + 1
  const caps = {
    weeklyScMax: Number(capsRaw.weeklyScMax / 10_000n),
    monthlyScMax: Number(capsRaw.monthlyScMax / 10_000n),
    loginMultMax: capsRaw.loginMultMax,
    cashbackPctMax: capsRaw.cashbackPctMax,
  }

  return (
    <div className="space-y-6 px-8 py-8">
      <PageHeader
        title="New tier"
        description="Define a new loyalty tier. Safety caps prevent typos that would bleed the bonus pool."
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'Tiers', href: '/admin/tiers' },
          { label: 'New' },
        ]}
        renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      />
      <TierForm mode="create" initial={{ ...DEFAULT_TIER_VALUES, level: nextLevel }} caps={caps} />
    </div>
  )
}
