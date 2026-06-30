import { Lock } from 'lucide-react'

import { requirePlayerSession } from '@/lib/player-session'

import { AccountSubnav } from '../_subnav'
import { PasswordForm } from './_password-form'

export const dynamic = 'force-dynamic'

// M5 — Account / Password tab. Wires the same six-tile subnav as the
// rest of /account/* and renders a single "Reset Your Password" card
// matching the live coinfrenzy.com screen. The form is in a client
// component so eye-toggles and field validation feel snappy.

export default async function SecurityPage() {
  await requirePlayerSession('/account/security')

  return (
    <div className="mx-auto max-w-6xl py-4">
      <header className="cf-fade-up mb-4 flex items-center justify-between">
        <h1 className="cf-headline flex items-center gap-2 text-2xl font-bold uppercase tracking-wider text-white">
          <Lock className="h-6 w-6 text-[var(--cf-gold-light)]" />
          Account
        </h1>
      </header>

      <AccountSubnav />

      <section className="cf-fade-up mt-6" style={{ ['--cf-fade-delay' as string]: '180ms' }}>
        <h2 className="cf-headline mb-3 text-lg font-bold uppercase tracking-wider text-white">
          Password
        </h2>
        <div className="cf-account-card max-w-2xl p-6">
          <PasswordForm />
        </div>
      </section>
    </div>
  )
}
