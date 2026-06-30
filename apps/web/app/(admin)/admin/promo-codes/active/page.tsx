import Link from 'next/link'
import { redirect } from 'next/navigation'

import { canManageBonuses } from '@coinfrenzy/core/auth'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'

import { ExportCsvButton } from '@/components/export-csv-button'
import { requireAdminSession } from '@/lib/admin-session'

import { fetchActiveBonusTemplates, fetchPromoCodeInsights, fetchPromoCodes } from '../_data'

import { ActivePanel, type PromoCodeRow } from './_active-panel'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function Page({ searchParams }: PageProps) {
  const session = await requireAdminSession('/admin/promo-codes/active')
  if (!canManageBonuses(session.payload.role)) {
    // Read-only roles aren't blocked from viewing — but we want to redirect
    // away if you're literally locked out of the feature. canManageBonuses
    // already covers marketing/manager/master/owner, which matches the
    // existing canViewBonuses gate for everyone else.
    redirect('/admin')
  }
  const sp = await searchParams
  const status = typeof sp.status === 'string' ? sp.status : 'active'
  const context = typeof sp.context === 'string' ? sp.context : 'all'
  const schedule = typeof sp.schedule === 'string' ? sp.schedule : 'all'
  const search = typeof sp.search === 'string' ? sp.search : ''

  const [rows, insights, templates] = await Promise.all([
    fetchPromoCodes({
      status,
      context,
      schedule: schedule !== 'all' ? schedule : undefined,
      search: search || undefined,
    }),
    fetchPromoCodeInsights(),
    fetchActiveBonusTemplates(),
  ])

  const serialized: PromoCodeRow[] = rows.map((r) => ({
    id: r.id,
    code: r.code,
    description: r.description,
    status: r.status,
    bonusId: r.bonusId,
    bonusName: r.bonusName,
    bonusSc: r.bonusSc.toString(),
    bonusGc: r.bonusGc.toString(),
    bonusMultiplier: r.bonusMultiplier,
    context: r.context,
    usesCount: r.usesCount,
    maxTotalUses: r.maxTotalUses,
    maxPerPlayer: r.maxPerPlayer,
    validFrom: r.validFrom ? r.validFrom.toISOString() : null,
    validUntil: r.validUntil ? r.validUntil.toISOString() : null,
    playthroughMultiplier: r.playthroughMultiplier,
    playthroughWindowHours: r.playthroughWindowHours,
    blockedEmailDomains: r.blockedEmailDomains,
  }))

  return (
    <ListPageShell
      title="Promo codes"
      subtitle={`${serialized.length.toLocaleString()} loaded`}
      description="Players enter codes from signup, checkout, or the lightning-bolt rewards menu. Each code wraps a bonus template and adds context, validity, and usage limits."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'Promo codes' },
        { label: 'Active' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      actions={<ExportCsvButton href="/api/admin/promo-codes/export" />}
      insights={[
        { label: 'Active codes', value: insights.active.toLocaleString(), tone: 'positive' },
        {
          label: 'Scheduled',
          value: insights.scheduled.toLocaleString(),
          tone: insights.scheduled > 0 ? 'notice' : 'neutral',
        },
        {
          label: 'Expiring < 7d',
          value: insights.expiring7d.toLocaleString(),
          tone: insights.expiring7d > 0 ? 'attention' : 'neutral',
        },
        { label: 'Uses today', value: insights.usesToday.toLocaleString(), tone: 'neutral' },
        {
          label: 'Top performer',
          value: insights.topCode ? insights.topCode.code : '—',
          delta: insights.topCode ? `${insights.topCode.uses.toLocaleString()} uses` : undefined,
          tone: 'positive',
        },
      ]}
    >
      <ActivePanel
        rows={serialized}
        templates={templates}
        filters={{ status, context, schedule, search }}
        canManage
      />
    </ListPageShell>
  )
}
