import 'server-only'

import Link from 'next/link'

import { legal as coreLegal } from '@coinfrenzy/core'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'

import { buildAdminRscContext } from '@/lib/admin-rsc-context'
import { requireAdminSession } from '@/lib/admin-session'

import { TermsManagerClient } from './terms-manager-client'

export const dynamic = 'force-dynamic'

// docs/09 §3.7 — versioned terms acceptance admin.
//
// Master can publish any slug. Manager can publish tos / privacy. Once
// published, every player will see the acceptance banner on next load.

export default async function Page() {
  const session = await requireAdminSession('/admin/settings/terms')
  const role = session.payload.role
  const ctx = buildAdminRscContext()

  const [tos, privacy, rg, history] = await Promise.all([
    coreLegal.getCurrentTerms(ctx.db, 'tos'),
    coreLegal.getCurrentTerms(ctx.db, 'privacy'),
    coreLegal.getCurrentTerms(ctx.db, 'rg_policy'),
    coreLegal.listTermsVersions(ctx.db),
  ])

  const canPublishStandard = role === 'manager' || role === 'master'
  const canPublishRg = role === 'master'

  return (
    <ListPageShell
      title="Terms & policies"
      subtitle="Versioned legal documents"
      description="Publish a new version to force every player to re-accept before transacting. Every publish + acceptance is audited."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'Settings', href: '/admin/settings' },
        { label: 'Terms & policies' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      insights={[
        { label: 'TOS version', value: tos ? `v${tos.version}` : 'unset', tone: 'neutral' },
        {
          label: 'Privacy version',
          value: privacy ? `v${privacy.version}` : 'unset',
          tone: 'neutral',
        },
        { label: 'RG policy version', value: rg ? `v${rg.version}` : 'unset', tone: 'neutral' },
      ]}
    >
      <TermsManagerClient
        current={{ tos, privacy, rg }}
        history={history}
        canPublishStandard={canPublishStandard}
        canPublishRg={canPublishRg}
      />
    </ListPageShell>
  )
}
