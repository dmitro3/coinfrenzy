import Link from 'next/link'
import { eq } from 'drizzle-orm'
import { CircleUserRound, Mail, Phone } from 'lucide-react'

import { getDb, schema } from '@coinfrenzy/db'

import { FoxIllustration } from '@coinfrenzy/ui/player'

import { getPlayerWallets } from '@/lib/player-data'
import { requirePlayerSession } from '@/lib/player-session'
import { formatCoins } from '@/lib/format'

import { AccountSubnav } from './_subnav'

export const dynamic = 'force-dynamic'

// docs/10 §4.2 + M5 — Account / My Account screen. Matches the live
// site's settings page exactly: the 6-tile subnav, then the "My
// Account" card with the fox avatar + username + verified pills + the
// three editable fields (Username / Email / Phone) in their own
// rounded cards. The lower "Personal Details" form is the existing
// settings page; it remains at /account/settings.

export default async function AccountHomePage() {
  const session = await requirePlayerSession('/account')
  const wallets = await getPlayerWallets(session.player.id)
  const db = getDb()
  const [profile] = await db
    .select({
      username: schema.players.username,
      phone: schema.players.phone,
      kycLevel: schema.players.kycLevel,
    })
    .from(schema.players)
    .where(eq(schema.players.id, session.player.id))
    .limit(1)

  const sc = wallets.find((w) => w.currency === 'SC')
  const gc = wallets.find((w) => w.currency === 'GC')
  const username = profile?.username ?? session.player.email.split('@')[0] ?? 'player'
  const kycVerified = (profile?.kycLevel ?? 0) >= 2
  const emailVerified = session.user.emailVerified

  return (
    <div className="mx-auto max-w-6xl py-4">
      <header className="cf-fade-up mb-4 flex items-center justify-between">
        <h1 className="cf-headline text-2xl font-bold uppercase tracking-wider text-white">
          Account
        </h1>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--cf-gray-light)]">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--cf-gold-medium)] text-[#1a1a1a]">
            ▶
          </span>
          Take a Tour
        </span>
      </header>

      <AccountSubnav />

      <section
        className="cf-account-card cf-fade-up mt-6 p-5 sm:p-6"
        style={{ ['--cf-fade-delay' as string]: '220ms' }}
      >
        <h2 className="cf-headline cf-gold-text text-lg font-bold uppercase tracking-[0.14em]">
          My Account
        </h2>

        <div className="mt-4 grid gap-4 lg:grid-cols-[280px_1fr]">
          <div className="relative flex flex-col items-center gap-3 rounded-lg border border-[var(--cf-gold-deep)]/35 bg-gradient-to-b from-[#1a1305] to-[var(--cf-bg-elevated)] p-4 shadow-[inset_0_1px_0_rgba(255,245,200,0.06),0_8px_24px_-12px_rgba(0,0,0,0.6)]">
            <div
              className="absolute inset-x-6 top-0 h-px"
              style={{
                background:
                  'linear-gradient(90deg, transparent, rgba(245, 208, 102, 0.55), transparent)',
              }}
              aria-hidden="true"
            />
            <div className="relative">
              <FoxIllustration
                variant="standing"
                width={140}
                height={140}
                className="h-32 w-32 rounded-md object-cover ring-1 ring-[var(--cf-gold-deep)]/50"
                chromaKey={false}
              />
            </div>
            <div className="text-center">
              <div className="text-base font-bold text-white">
                <span className="text-[var(--cf-gold-light)]">@</span>
                {username}
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
                {kycVerified && (
                  <span className="inline-flex items-center gap-1 rounded-sm bg-[var(--cf-green)]/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--cf-green-bright)]">
                    ✓ KYC Verified
                  </span>
                )}
                {emailVerified && (
                  <span className="inline-flex items-center gap-1 rounded-sm bg-[var(--cf-gold-deep)]/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--cf-gold-light)]">
                    ✓ Email
                  </span>
                )}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-[var(--cf-gray-light)]">
                {session.player.email}
                {profile?.phone ? (
                  <>
                    <br />
                    {profile.phone}
                  </>
                ) : null}
              </p>
            </div>
            <div className="w-full border-t border-[var(--cf-border-default)]/70 pt-3">
              <p className="text-center text-[10px] uppercase tracking-[0.16em] text-[var(--cf-gray-light)]">
                Account balance
              </p>
              <div className="mt-1.5 space-y-1 text-center">
                <p
                  className='text-sm font-bold tabular-nums tracking-tight text-[var(--cf-green-bright)] [font-feature-settings:"tnum"_1]'
                  data-numeric="true"
                >
                  <span className="mr-1 text-[var(--cf-green)]">●</span>
                  {formatCoins(sc?.totalBalance ?? 0n)} SC
                </p>
                <p
                  className='text-sm font-bold tabular-nums tracking-tight text-[var(--cf-gold-light)] [font-feature-settings:"tnum"_1]'
                  data-numeric="true"
                >
                  <span className="mr-1 text-[var(--cf-gold-medium)]">●</span>
                  {formatCoins(gc?.totalBalance ?? 0n)} GC
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <FieldCard
              icon={<CircleUserRound className="h-5 w-5" />}
              label="Username"
              description="Your public handle. Click below to update it."
              value={username}
              actionLabel="Change Username"
              actionHref="/account/security#username"
              delay="300ms"
            />
            <FieldCard
              icon={<Mail className="h-5 w-5" />}
              label="Email"
              description="Set the email to access your account anytime."
              value={session.player.email}
              actionLabel="Change Email"
              actionHref="/account/security#email"
              verified={emailVerified}
              delay="360ms"
            />
            <FieldCard
              icon={<Phone className="h-5 w-5" />}
              label="Phone"
              description="Keep your contact updated for easy & secure access."
              value={profile?.phone ?? 'Not provided'}
              actionLabel="Change Phone"
              actionHref="/account/security#phone"
              delay="420ms"
            />
          </div>
        </div>
      </section>

      <section
        className="cf-account-card cf-fade-up mt-6 p-5 sm:p-6"
        style={{ ['--cf-fade-delay' as string]: '480ms' }}
      >
        <h2 className="cf-headline cf-gold-text text-lg font-bold uppercase tracking-[0.14em]">
          Personal Details
        </h2>
        <p className="mt-2 text-sm text-[var(--cf-gray-light)]">
          The full personal-details editor (name, date of birth, address) lands in a follow-up
          prompt. For now, contact{' '}
          <Link href="/live-support" className="text-[var(--cf-gold-light)] underline">
            live support
          </Link>{' '}
          to update these fields.
        </p>
      </section>
    </div>
  )
}

function FieldCard({
  icon,
  label,
  description,
  value,
  actionLabel,
  actionHref,
  verified,
  delay,
}: {
  icon: React.ReactNode
  label: string
  description: string
  value: string
  actionLabel: string
  actionHref: string
  verified?: boolean
  delay?: string
}) {
  return (
    <div
      className="cf-fade-up group relative rounded-lg border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] p-4 transition-colors duration-200 hover:border-[var(--cf-gold-medium)]/50"
      style={delay ? ({ ['--cf-fade-delay' as string]: delay } as React.CSSProperties) : undefined}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[var(--cf-gold-light)]">{icon}</span>
        <span className="text-sm font-bold uppercase tracking-wider text-white">{label}</span>
        {verified && (
          <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] font-bold text-[var(--cf-green-bright)]">
            ✓ Verified
          </span>
        )}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[var(--cf-gray-light)]">{description}</p>
      <div className="mt-2 rounded-sm border border-[var(--cf-border-default)]/60 bg-[var(--cf-bg-base)] px-3 py-2 text-sm text-white">
        {value}
      </div>
      <Link
        href={actionHref}
        className="mt-3 inline-flex h-8 items-center rounded-sm border border-[var(--cf-border-default)] bg-[var(--cf-bg-base)] px-3 text-xs font-semibold text-white transition-colors duration-150 hover:border-[var(--cf-gold-medium)] hover:text-[var(--cf-gold-light)]"
      >
        {actionLabel}
      </Link>
    </div>
  )
}
