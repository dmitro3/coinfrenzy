import { FoxIllustration } from '@coinfrenzy/ui/player'

export const metadata = {
  title: 'About | Coin Frenzy',
}

// docs/10 §3 — public About page. Premium short-form copy that mirrors
// the brand voice on the live site: confident, fun, transparent about
// compliance.

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
      <header className="grid items-center gap-10 md:grid-cols-[1.4fr_1fr]">
        <div>
          <h1 className="cf-headline cf-gold-text text-4xl font-extrabold uppercase tracking-wide sm:text-5xl">
            About Coin Frenzy
          </h1>
          <p className="mt-4 text-base text-white">
            Coin Frenzy is a play-for-fun social casino with sweepstakes prizes. Gold Coins are for
            entertainment; Sweepstakes Coins can be redeemed for real prizes — no purchase ever
            necessary.
          </p>
          <p className="mt-4 text-sm text-[var(--cf-gray-light)]">
            We&apos;re a small team with decades of combined experience operating real-money and
            social casinos. We&apos;re building the operator we always wanted to use — premium look
            and feel, audited ledger, fast payouts, and a fox in a red velvet suit.
          </p>
        </div>
        <div className="hidden justify-center md:flex">
          <FoxIllustration variant="standing" width={280} height={320} className="h-80 w-auto" />
        </div>
      </header>

      <section className="mt-12 rounded-lg border border-[var(--cf-border-default)] bg-[var(--cf-bg-card)] p-6">
        <h2 className="cf-headline text-xl font-bold uppercase tracking-wider text-white">
          Compliance Posture
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-[var(--cf-gray-light)]">
          <li>
            <span className="font-bold text-white">39 US states</span> — see our FAQ for excluded
            states.
          </li>
          <li>
            Identity verification by <span className="font-bold text-white">Footprint</span>.
          </li>
          <li>
            Payments &amp; payouts by <span className="font-bold text-white">Finix</span>.
          </li>
          <li>
            Games provided by <span className="font-bold text-white">Alea</span> and partner
            studios.
          </li>
          <li>Free mail-in entry available — see the AMOE rules.</li>
        </ul>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Games" value="450+" />
        <Stat label="Providers" value="40+" />
        <Stat label="Payout time" value="1–3 days" />
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--cf-border-default)] bg-[var(--cf-bg-card)] p-5 text-center">
      <div className="cf-gold-text font-mono text-3xl font-extrabold" data-numeric="true">
        {value}
      </div>
      <div className="mt-1 text-xs font-bold uppercase tracking-wider text-[var(--cf-gray-light)]">
        {label}
      </div>
    </div>
  )
}
