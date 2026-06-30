import { eq } from 'drizzle-orm'
import { CheckCircle2, ShieldCheck } from 'lucide-react'

import { getDb, schema } from '@coinfrenzy/db'

import { requirePlayerSession } from '@/lib/player-session'

import { AccountSubnav } from '../_subnav'
import { KycPopupHandler } from './_popup-handler'
import { StartKycButton } from './_start'

export const dynamic = 'force-dynamic'

const LEVELS: Array<{ level: number; title: string; blurb: string }> = [
  { level: 0, title: 'Unverified', blurb: 'You can play Gold Coins right away.' },
  {
    level: 1,
    title: 'Basic',
    blurb: 'Email confirmed + state captured. Required to play SC.',
  },
  {
    level: 2,
    title: 'Identity verified',
    blurb: 'Footprint confirmed your identity documents. Required to redeem SC.',
  },
  {
    level: 3,
    title: 'Enhanced (EDD)',
    blurb: 'Higher redemption limits and faster payouts.',
  },
]

type SearchParams = Promise<{ status?: string }>

export default async function KycPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requirePlayerSession('/account/kyc')
  const params = await searchParams

  const db = getDb()
  const [playerRow] = await db
    .select({
      kycLevel: schema.players.kycLevel,
      kycVerifiedAt: schema.players.kycVerifiedAt,
    })
    .from(schema.players)
    .where(eq(schema.players.id, session.player.id))
    .limit(1)
  const currentLevel = playerRow?.kycLevel ?? 0

  const justReturned = params.status === 'completed'
  const verified = currentLevel >= 2

  return (
    <div className="mx-auto max-w-4xl py-4">
      <KycPopupHandler status={params.status} />
      <header className="mb-4">
        <h1 className="cf-headline flex items-center gap-2 text-2xl font-bold uppercase tracking-wider text-white">
          <ShieldCheck className="h-6 w-6 text-[var(--cf-gold-light)]" />
          Identity verification
        </h1>
      </header>
      <AccountSubnav />

      {justReturned && verified ? (
        <div className="mt-4 rounded-lg border border-[var(--cf-green)]/40 bg-[var(--cf-green)]/10 px-4 py-3 text-sm text-[var(--cf-green-bright)]">
          Identity verified — you can now redeem Sweeps Coins.
        </div>
      ) : null}
      {justReturned && !verified ? (
        <div className="mt-4 rounded-lg border border-[var(--cf-gold-medium)]/40 bg-[var(--cf-gold-deep)]/10 px-4 py-3 text-sm text-[var(--cf-gold-light)]">
          Verification didn&apos;t complete. You can try again below.
        </div>
      ) : null}

      <div className="mt-6 space-y-3">
        {LEVELS.map((level) => {
          const reached = currentLevel >= level.level
          return (
            <div
              key={level.level}
              className="flex items-start gap-3 rounded-lg border border-[var(--cf-border-default)] bg-[var(--cf-bg-card)] p-4"
            >
              <CheckCircle2
                className={`mt-0.5 h-5 w-5 ${reached ? 'text-[var(--cf-green-bright)]' : 'text-[var(--cf-gray-light)]/40'}`}
              />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-white">
                    Level {level.level} — {level.title}
                  </div>
                  {reached && (
                    <span className="text-xs font-bold text-[var(--cf-green-bright)]">Done</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-[var(--cf-gray-light)]">{level.blurb}</p>
              </div>
            </div>
          )
        })}
      </div>

      {currentLevel < 2 ? (
        <div className="mt-6 rounded-lg border border-[var(--cf-border-default)] bg-[var(--cf-bg-card)] p-5">
          <h2 className="cf-headline font-bold uppercase tracking-wider text-white">
            Start verification
          </h2>
          <p className="mt-1 text-sm text-[var(--cf-gray-light)]">
            Verification is handled by Footprint. We&apos;ll open the verification flow in a secure
            window — most players finish in under two minutes.
          </p>
          <div className="mt-4">
            <StartKycButton email={session.player.email} />
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-lg border border-[var(--cf-border-default)] bg-[var(--cf-bg-card)] p-5">
          <h2 className="cf-headline font-bold uppercase tracking-wider text-white">
            You&apos;re verified
          </h2>
          <p className="mt-1 text-sm text-[var(--cf-gray-light)]">
            Identity verification is complete. To raise your redemption limits, ask support about
            Enhanced (EDD) verification.
          </p>
        </div>
      )}
    </div>
  )
}
