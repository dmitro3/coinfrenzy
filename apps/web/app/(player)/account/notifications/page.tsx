import { Settings } from 'lucide-react'

import { requirePlayerSession } from '@/lib/player-session'

import { AccountSubnav } from '../_subnav'
import { PreferencesForm } from './_form'

export const dynamic = 'force-dynamic'

// M5 — Account / Preferences tab. Marketing opt-ins + incognito mode.
// Mirrors the live coinfrenzy.com Preferences screen. Persistence
// endpoint is wired in a follow-up; the toggles animate optimistically.

export default async function NotificationsPage() {
  await requirePlayerSession('/account/notifications')

  return (
    <div className="mx-auto max-w-6xl py-4">
      <header className="cf-fade-up mb-4 flex items-center justify-between">
        <h1 className="cf-headline flex items-center gap-2 text-2xl font-bold uppercase tracking-wider text-white">
          <Settings className="h-6 w-6 text-[var(--cf-gold-light)]" />
          Account
        </h1>
      </header>

      <AccountSubnav />

      <section className="cf-fade-up mt-6" style={{ ['--cf-fade-delay' as string]: '180ms' }}>
        <h2 className="cf-headline mb-3 text-lg font-bold uppercase tracking-wider text-white">
          Preferences
        </h2>
        <div className="cf-account-card max-w-full p-6">
          <PreferencesForm />
        </div>

        <p className="mt-4 max-w-3xl rounded-md border border-[var(--cf-border-default)]/60 bg-[var(--cf-bg-card)]/50 p-3 text-xs text-[var(--cf-gray-light)]">
          Account &amp; security notifications can&apos;t be fully disabled — we still reach you for
          login alerts, redemption confirmations, and KYC requests.
        </p>
      </section>
    </div>
  )
}
