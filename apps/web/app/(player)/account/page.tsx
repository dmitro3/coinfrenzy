import { eq } from 'drizzle-orm'

import { auth } from '@coinfrenzy/core'
import { getDb, schema } from '@coinfrenzy/db'

import { getPlayerWallets } from '@/lib/player-data'
import { requirePlayerSession } from '@/lib/player-session'
import { formatCoins } from '@/lib/format'

import { AccountSubnav } from './_subnav'
import { MyAccountSection } from './_my-account-section'
import { PersonalDetailsForm } from './_personal-details-form'
import type { PersonalDetailsInitialValues } from './_personal-details-form'

export const dynamic = 'force-dynamic'

function isPersonalDetailsComplete(profile: {
  firstName: string | null
  lastName: string | null
  dateOfBirth: string | null
  addressLine1: string | null
  city: string | null
  postalCode: string | null
  state: string | null
  metadata: unknown
}): boolean {
  const gender = auth.readGenderFromMetadata(profile.metadata)
  return Boolean(
    profile.firstName?.trim() &&
    profile.lastName?.trim() &&
    profile.dateOfBirth &&
    gender &&
    profile.addressLine1?.trim() &&
    profile.city?.trim() &&
    profile.postalCode?.trim() &&
    profile.state?.trim(),
  )
}

export default async function AccountHomePage() {
  const session = await requirePlayerSession('/account')
  const wallets = await getPlayerWallets(session.player.id)
  const db = getDb()
  const [profile] = await db
    .select({
      username: schema.players.username,
      phone: schema.players.phone,
      kycLevel: schema.players.kycLevel,
      firstName: schema.players.firstName,
      lastName: schema.players.lastName,
      dateOfBirth: schema.players.dateOfBirth,
      addressLine1: schema.players.addressLine1,
      city: schema.players.city,
      state: schema.players.state,
      postalCode: schema.players.postalCode,
      metadata: schema.players.metadata,
    })
    .from(schema.players)
    .where(eq(schema.players.id, session.player.id))
    .limit(1)

  const sc = wallets.find((w) => w.currency === 'SC')
  const gc = wallets.find((w) => w.currency === 'GC')
  const username = profile?.username ?? session.player.email.split('@')[0] ?? 'player'
  const kycLevel = profile?.kycLevel ?? 0
  const kycVerified = kycLevel >= 2
  const phoneVerified = kycLevel >= 1 && Boolean(profile?.phone)
  const emailVerified = session.user.emailVerified

  const personalDetails: PersonalDetailsInitialValues = {
    firstName: profile?.firstName ?? '',
    lastName: profile?.lastName ?? '',
    dateOfBirth: auth.formatUsDateOfBirth(profile?.dateOfBirth),
    gender: auth.readGenderFromMetadata(profile?.metadata) ?? '',
    addressLine1: profile?.addressLine1 ?? '',
    city: profile?.city ?? '',
    postalCode: profile?.postalCode ?? '',
    state: profile?.state ?? '',
  }

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
        <h2 className="cf-headline cf-gold-text mb-4 text-lg font-bold uppercase tracking-[0.14em]">
          My Account
        </h2>

        <MyAccountSection
          username={username}
          email={session.player.email}
          emailVerified={emailVerified}
          kycVerified={kycVerified}
          phone={profile?.phone ?? null}
          phoneVerified={phoneVerified}
          scBalance={formatCoins(sc?.totalBalance ?? 0n)}
          gcBalance={formatCoins(gc?.totalBalance ?? 0n)}
          personalDetails={personalDetails}
          personalDetailsComplete={profile ? isPersonalDetailsComplete(profile) : false}
        />
      </section>

      <section
        className="cf-account-card cf-fade-up mt-6 p-5 sm:p-6"
        style={{ ['--cf-fade-delay' as string]: '480ms' }}
      >
        <h2 className="cf-headline cf-gold-text text-lg font-bold uppercase tracking-[0.14em]">
          Personal Details
        </h2>
        <PersonalDetailsForm initial={personalDetails} />
      </section>
    </div>
  )
}
