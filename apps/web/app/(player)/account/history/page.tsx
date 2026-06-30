import { Receipt } from 'lucide-react'

import { AccountSubnav } from '../_subnav'
import { HistoryTabs } from './_tabs'

export const dynamic = 'force-dynamic'

// M5 — Account / Transactions tab. Mirrors the live coinfrenzy.com
// Transactions screen: three sub-tabs (Awarded Gifts / Purchase /
// Redeem), date-range pickers on the right, then the per-tab table.

export default function HistoryPage() {
  return (
    <div className="mx-auto max-w-6xl py-4">
      <header className="cf-fade-up mb-4 flex items-center justify-between">
        <h1 className="cf-headline flex items-center gap-2 text-2xl font-bold uppercase tracking-wider text-white">
          <Receipt className="h-6 w-6 text-[var(--cf-gold-light)]" />
          Account
        </h1>
      </header>

      <AccountSubnav />

      <section className="cf-fade-up mt-6" style={{ ['--cf-fade-delay' as string]: '180ms' }}>
        <h2 className="cf-headline mb-3 text-lg font-bold uppercase tracking-wider text-white">
          Transactions
        </h2>
        <HistoryTabs />
      </section>
    </div>
  )
}
