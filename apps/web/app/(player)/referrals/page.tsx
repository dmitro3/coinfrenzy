import Link from 'next/link'
import { Gift, Users } from 'lucide-react'

import { GoldButton, LobbyHero } from '@coinfrenzy/ui/player'

import { requirePlayerSession } from '@/lib/player-session'

import { CopyButtonClient } from './_copy-button'

export const dynamic = 'force-dynamic'

// Referrals page — public link sharing. The bonus engine awards SC+GC
// when an invited friend signs up and makes a qualifying purchase
// (docs/06 §5). We surface the player's stable referral code and the
// CTA copy from the live site.

export default async function ReferralsPage() {
  const session = await requirePlayerSession('/referrals')
  const code = (session.player.email.split('@')[0] || 'CF').slice(0, 8).toUpperCase()
  const link = `https://coinfrenzy.com/signup?ref=${code}`

  return (
    <div className="py-4">
      <h1 className="cf-headline text-2xl font-bold uppercase tracking-wider text-white">
        Referrals
      </h1>
      <LobbyHero
        headline="Refer Friends. Earn Coins."
        subhead="Earn bonus coins when friends play"
        alt="Refer Friends. Earn Coins. — earn bonus coins when friends play"
        desktopSrc="/brand/banners/referral-banner.webp"
        mobileSrc="/brand/banners/referral-banner.webp"
      />

      <div className="mt-6 overflow-hidden rounded-lg border border-[var(--cf-border-default)] bg-[var(--cf-bg-card)]">
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--cf-gold-light)]">
              Your referral code
            </h3>
            <div className="mt-2 flex h-12 items-center gap-2 rounded-md border border-[var(--cf-gold-medium)] bg-[var(--cf-bg-elevated)] px-4">
              <span className="font-mono text-lg font-extrabold tracking-widest text-white">
                {code}
              </span>
              <CopyButton text={code} />
            </div>
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--cf-gold-light)]">
              Your invite link
            </h3>
            <div className="mt-2 flex h-12 items-center gap-2 rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] px-3">
              <span className="flex-1 truncate text-sm text-white">{link}</span>
              <CopyButton text={link} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat icon={<Users className="h-5 w-5" />} label="Friends invited" value="0" />
        <Stat icon={<Gift className="h-5 w-5" />} label="Bonus earned" value="0.00 SC" />
        <Stat icon={<Gift className="h-5 w-5" />} label="Lifetime earned" value="0.00 SC" />
      </div>

      <p className="mt-6 text-center text-xs text-[var(--cf-gray-light)]">
        See the full{' '}
        <Link className="underline hover:text-white" href="/terms#referrals">
          referral terms
        </Link>
        .
      </p>

      <div className="mt-6 flex justify-center">
        <GoldButton href="/promotions" size="md">
          See more promotions
        </GoldButton>
      </div>
    </div>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-card)] p-4">
      <div className="flex items-center gap-2 text-[var(--cf-gold-medium)]">{icon}</div>
      <div className="mt-2 text-xs uppercase tracking-wider text-[var(--cf-gray-light)]">
        {label}
      </div>
      <div className="mt-1 font-mono text-xl font-bold text-white" data-numeric="true">
        {value}
      </div>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  return <CopyButtonClient text={text} />
}
