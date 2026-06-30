import Link from 'next/link'

import { PageHeader } from '@coinfrenzy/ui/admin/layout/PageHeader'

import { buildIntegrityFrame } from './_snapshot'
import { IntegrityClient } from './integrity-client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// docs/05 §8 + docs/12 §5.3 — Integration health dashboard.
//
// Operator-facing answer to "is anything broken right now?". Tiles show a
// per-vendor adapter state plus the pending webhook queue (so backups are
// visible) plus the open AML review queue (so KYC escalations don't get
// silently dropped). Live values stream over SSE every 30s; on first paint
// we already have a fresh frame thanks to the RSC fetch below.

export default async function IntegrityPage() {
  const initial = await buildIntegrityFrame()
  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Integration health"
        subtitle="Live status for every external vendor + the queues that back them"
        breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Integration health' }]}
        renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      />
      <IntegrityClient initialFrame={initial} />
    </div>
  )
}
