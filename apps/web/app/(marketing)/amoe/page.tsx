import { Mail } from 'lucide-react'

import { FoxIllustration } from '@coinfrenzy/ui/player'

export const metadata = {
  title: 'Free Entry (AMOE) | Coin Frenzy',
}

// docs/06 §AMOE — public AMOE explanation page. Operations supplies
// the final mailing address, allotment per envelope, and any per-period
// limits before launch. The placeholder copy is clearly marked.

export default function AmoePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
      <header className="grid items-center gap-10 md:grid-cols-[1.4fr_1fr]">
        <div>
          <h1 className="cf-headline cf-gold-text flex items-center gap-2 text-4xl font-extrabold uppercase tracking-wide sm:text-5xl">
            <Mail className="h-9 w-9 text-[var(--cf-gold-light)]" />
            Free Entry (AMOE)
          </h1>
          <p className="mt-3 text-base text-white">
            Alternate method of entry. No purchase ever necessary to receive Sweepstakes Coins.
          </p>
        </div>
        <div className="hidden justify-center md:flex">
          <FoxIllustration variant="standing" width={240} height={280} className="h-72 w-auto" />
        </div>
      </header>

      <section className="mt-10 rounded-lg border border-[var(--cf-border-default)] bg-[var(--cf-bg-card)] p-6">
        <h2 className="cf-headline text-xl font-bold uppercase tracking-wider text-white">
          How it works
        </h2>
        <ol className="mt-3 space-y-3 text-sm text-[var(--cf-gray-light)]">
          <li className="flex gap-3">
            <Step n={1} />
            <span>
              Hand-write a request on a 3″ × 5″ index card with your name, address, email, and date
              of birth.
            </span>
          </li>
          <li className="flex gap-3">
            <Step n={2} />
            <span>
              Place the card in a plain envelope and mail to:{' '}
              <span className="font-bold text-white">
                Coin Frenzy AMOE Requests, [P.O. Box TBD].
              </span>
            </span>
          </li>
          <li className="flex gap-3">
            <Step n={3} />
            <span>
              Each valid envelope earns you free SC credited to your account within 14 days of
              receipt.
            </span>
          </li>
        </ol>
      </section>

      <p className="mt-6 rounded-md border border-dashed border-[var(--cf-gold-medium)]/50 bg-[var(--cf-gold-deep)]/10 p-4 text-sm text-[var(--cf-gold-light)]">
        Placeholder copy. Operations will supply the final mailing address, SC allotment per
        envelope, and any per-period limits before launch.
      </p>
    </div>
  )
}

function Step({ n }: { n: number }) {
  return (
    <span className="cf-gold-gradient grid h-7 w-7 shrink-0 place-items-center rounded-full font-bold text-[#1a1a1a]">
      {n}
    </span>
  )
}
