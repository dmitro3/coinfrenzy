import Link from 'next/link'

import { canManageBonuses } from '@coinfrenzy/core/auth'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'

import { requireAdminSession } from '@/lib/admin-session'

import { fetchBlockedCodes, fetchPromoCodeDomainBlocks } from '../_data'

import { RestrictionsPanel } from './_restrictions-panel'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const session = await requireAdminSession('/admin/promo-codes/restrictions')
  const [blockedCodes, domainBlocks] = await Promise.all([
    fetchBlockedCodes(),
    fetchPromoCodeDomainBlocks(),
  ])

  const distinctDomains = new Set(domainBlocks.map((r) => r.domain)).size
  const distinctCodes = new Set([
    ...blockedCodes.map((r) => r.code),
    ...domainBlocks.map((r) => r.code),
  ]).size

  return (
    <ListPageShell
      title="Promo code restrictions"
      subtitle="Hard-blocked codes and per-code domain blocks"
      description="Two layers: hard-blocked codes (immediate kill switch) and per-code email-domain blocks (anti-abuse against throwaway addresses)."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'Promo codes' },
        { label: 'Restrictions' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      insights={[
        {
          label: 'Hard-blocked codes',
          value: blockedCodes.length.toLocaleString(),
          tone: blockedCodes.length > 0 ? 'critical' : 'neutral',
        },
        {
          label: 'Domain blocks',
          value: domainBlocks.length.toLocaleString(),
          tone: 'neutral',
        },
        {
          label: 'Affected codes',
          value: distinctCodes.toLocaleString(),
          tone: 'neutral',
        },
        {
          label: 'Affected domains',
          value: distinctDomains.toLocaleString(),
          tone: distinctDomains > 0 ? 'attention' : 'neutral',
        },
      ]}
    >
      <RestrictionsPanel
        canManage={canManageBonuses(session.payload.role)}
        blockedCodes={blockedCodes.map((r) => ({
          code: r.code,
          reason: r.reason,
          addedAt: r.addedAt.toISOString(),
        }))}
        domainBlocks={domainBlocks.map((r) => ({
          id: r.id,
          domain: r.domain,
          code: r.code,
          promoCodeId: r.promoCodeId,
          updatedAt: r.updatedAt.toISOString(),
        }))}
      />
    </ListPageShell>
  )
}
