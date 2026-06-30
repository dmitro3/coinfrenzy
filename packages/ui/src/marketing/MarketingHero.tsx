import { cn } from '../lib/utils'
import { GoldButton } from '../player/GoldButton'
import { FoxIllustration } from '../player/FoxIllustration'
import { CoinFrenzyLogo } from '../player/CoinFrenzyLogo'

// Marketing hero — large hero block for the unauthenticated home page.
// Coin Frenzy gold logo, big tagline ("Play Free. Win Real."), Sign Up
// CTA, and the fox mascot anchored on the right.

interface MarketingHeroProps {
  className?: string
}

export function MarketingHero({ className }: MarketingHeroProps) {
  return (
    <section
      className={cn(
        'relative overflow-hidden border-b border-[var(--cf-border-subtle)]',
        'bg-[radial-gradient(ellipse_at_left,#2a0508_0%,#0a0204_55%,#000_100%)]',
        className,
      )}
    >
      {/* Sparkles */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'radial-gradient(rgba(235,205,124,0.6) 1px, transparent 1.5px), radial-gradient(rgba(235,205,124,0.3) 1px, transparent 1.5px)',
          backgroundSize: '40px 36px, 80px 70px',
        }}
      />

      <div className="relative mx-auto grid max-w-7xl items-center gap-8 px-4 py-16 sm:px-6 sm:py-24 md:grid-cols-[1.1fr_320px] lg:px-8">
        <div className="z-10 max-w-2xl">
          <CoinFrenzyLogo variant="wordmark" width={220} height={80} priority />
          <h1 className="cf-headline cf-gold-text mt-6 text-4xl font-extrabold uppercase leading-[1.05] tracking-wide sm:text-5xl lg:text-6xl">
            Play Free. Win Real. <br /> That&apos;s the Frenzy.
          </h1>
          <p className="mt-5 max-w-xl text-base text-white sm:text-lg">
            Hundreds of slot games, live dealers, originals and game shows. Earn{' '}
            <span className="text-[var(--cf-gold-light)] font-semibold">Gold Coins</span> for fun,{' '}
            <span className="text-[var(--cf-green-bright)] font-semibold">Sweepstakes Coins</span>{' '}
            for real prizes — no purchase necessary.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <GoldButton href="/signup" size="lg">
              Sign Up to Play
            </GoldButton>
            <a
              href="/amoe"
              className="inline-flex h-12 items-center gap-2 rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] px-6 text-sm font-semibold uppercase tracking-wider text-white hover:bg-[var(--cf-bg-card-hover)]"
            >
              Free Entry (AMOE)
            </a>
          </div>
        </div>

        <div className="relative hidden h-full items-end justify-center md:flex">
          <FoxIllustration
            variant="coins-half"
            width={380}
            height={420}
            priority
            className="h-[420px] w-auto"
          />
        </div>
      </div>
    </section>
  )
}
