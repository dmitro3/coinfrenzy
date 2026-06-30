import Link from 'next/link'

import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'
import { Card } from '@coinfrenzy/ui/primitives/card'
import { EventsFeed } from '@coinfrenzy/ui/admin/crm'

export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <ListPageShell
      title="Live events"
      subtitle="Real-time CRM activity"
      description="Streaming feed of every send, open, click, unsubscribe, and lifecycle change. Polls every 5 seconds."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'CRM', href: '/admin/crm' },
        { label: 'Live events' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
    >
      <Card>
        <EventsFeed limit={100} pollMs={5000} />
      </Card>
    </ListPageShell>
  )
}
