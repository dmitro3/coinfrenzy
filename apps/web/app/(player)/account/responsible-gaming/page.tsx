import { ShieldAlert } from 'lucide-react'

import { compliance } from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'

import { requirePlayerSession } from '@/lib/player-session'

import { AccountSubnav } from '../_subnav'
import { RgControls } from './_controls'

export const dynamic = 'force-dynamic'

export default async function ResponsibleGamingPage() {
  const session = await requirePlayerSession('/account/responsible-gaming')
  const state = await compliance.getRGState(getDb(), session.player.id)

  return (
    <div className="mx-auto max-w-6xl py-4">
      <header className="cf-fade-up mb-4 flex items-center justify-between">
        <h1 className="cf-headline flex items-center gap-2 text-2xl font-bold uppercase tracking-wider text-white">
          <ShieldAlert className="h-6 w-6 text-[var(--cf-gold-light)]" />
          Account
        </h1>
      </header>

      <AccountSubnav />

      <section className="cf-fade-up mt-6" style={{ ['--cf-fade-delay' as string]: '180ms' }}>
        <h2 className="cf-headline mb-3 text-lg font-bold uppercase tracking-wider text-white">
          Exclusion
        </h2>
        <div className="cf-account-card p-6">
          <RgControls
            initial={{
              status: state?.status ?? 'active',
              selfExcludedUntil: state?.selfExcludedUntil?.toISOString() ?? null,
              depositLimitDaily: state?.depositLimitDaily?.toString() ?? null,
              depositLimitWeekly: state?.depositLimitWeekly?.toString() ?? null,
              depositLimitMonthly: state?.depositLimitMonthly?.toString() ?? null,
              sessionLimitMin: state?.sessionLimitMin ?? null,
              pendingChanges:
                state?.pendingChanges.map((c) => ({
                  id: c.id,
                  limitKind: c.limitKind,
                  nextValue: c.nextValue,
                  applyAt: c.applyAt.toISOString(),
                  requestedAt: c.requestedAt.toISOString(),
                })) ?? [],
            }}
          />
        </div>
      </section>

      <div
        className="cf-fade-up mt-6 rounded-lg border border-[var(--cf-border-default)]/60 bg-[var(--cf-bg-card)]/50 p-4 text-sm text-[var(--cf-gray-light)]"
        style={{ ['--cf-fade-delay' as string]: '360ms' }}
      >
        Problem-gambling resources: National Council on Problem Gambling —{' '}
        <a className="text-[var(--cf-gold-light)] underline" href="tel:18004262537">
          1-800-GAMBLER
        </a>
        .
      </div>
    </div>
  )
}
