import Link from 'next/link'
import { Clock, HeartHandshake, ShieldAlert, Wallet } from 'lucide-react'

import { FoxIllustration, GoldButton } from '@coinfrenzy/ui/player'

export const metadata = {
  title: 'Responsible Gaming | Coin Frenzy',
}

// docs/09 §RG — public Responsible Gaming information page. The
// authenticated tools live at /account/responsible-gaming; this page
// explains the philosophy, lists the controls, and points players to
// the help resources required by every US sweepstakes jurisdiction.

const CONTROLS = [
  {
    icon: <Wallet className="h-5 w-5" />,
    title: 'Purchase Limits',
    description:
      'Set daily, weekly, or monthly caps on coin purchases. Decreases take effect immediately; increases honor a 24-hour cooling-off period.',
  },
  {
    icon: <Clock className="h-5 w-5" />,
    title: 'Session Limits',
    description:
      'Cap how long you stay logged in per session. We will sign you out automatically when you hit the limit.',
  },
  {
    icon: <ShieldAlert className="h-5 w-5" />,
    title: 'Self-Exclusion',
    description:
      'Take a break from a single day up to 5 years, or self-exclude permanently. We honor exclusions across all account access points.',
  },
  {
    icon: <HeartHandshake className="h-5 w-5" />,
    title: 'Reality Checks',
    description:
      'Periodic reminders during long sessions so you can take a break with full awareness of time and net result.',
  },
]

export default function ResponsibleGamingPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
      <header className="grid items-center gap-10 md:grid-cols-[1.4fr_1fr]">
        <div>
          <h1 className="cf-headline cf-gold-text text-4xl font-extrabold uppercase tracking-wide sm:text-5xl">
            Responsible Gaming
          </h1>
          <p className="mt-3 text-base text-white">
            Play should always feel good. Coin Frenzy gives you the controls to keep your play in
            your control.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <GoldButton href="/account/responsible-gaming" size="md">
              Manage My Limits
            </GoldButton>
            <Link
              href="tel:18004262537"
              className="inline-flex h-10 items-center rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] px-5 text-sm font-semibold text-white hover:bg-[var(--cf-bg-card-hover)]"
            >
              1-800-GAMBLER
            </Link>
          </div>
        </div>
        <div className="hidden justify-center md:flex">
          <FoxIllustration variant="standing" width={240} height={280} className="h-72 w-auto" />
        </div>
      </header>

      <section className="mt-12 grid gap-4 sm:grid-cols-2">
        {CONTROLS.map((c) => (
          <div
            key={c.title}
            className="rounded-lg border border-[var(--cf-border-default)] bg-[var(--cf-bg-card)] p-5"
          >
            <div className="flex items-center gap-2 text-[var(--cf-gold-light)]">
              {c.icon}
              <span className="cf-headline text-base font-bold uppercase tracking-wider text-white">
                {c.title}
              </span>
            </div>
            <p className="mt-2 text-sm text-[var(--cf-gray-light)]">{c.description}</p>
          </div>
        ))}
      </section>

      <section className="mt-10 rounded-lg border border-[var(--cf-border-default)] bg-[var(--cf-bg-card)] p-6">
        <h2 className="cf-headline text-xl font-bold uppercase tracking-wider text-white">
          Need to Talk to Someone?
        </h2>
        <p className="mt-2 text-sm text-[var(--cf-gray-light)]">
          The National Council on Problem Gambling operates a 24/7 confidential helpline. There is
          no fee, and they can connect you with local support.
        </p>
        <ul className="mt-3 space-y-1 text-sm text-white">
          <li>
            Helpline ·{' '}
            <a className="text-[var(--cf-gold-light)] underline" href="tel:18004262537">
              1-800-GAMBLER
            </a>
          </li>
          <li>
            Text ·{' '}
            <a className="text-[var(--cf-gold-light)] underline" href="sms:800-522-4700">
              800-522-4700
            </a>
          </li>
          <li>
            Web ·{' '}
            <a
              className="text-[var(--cf-gold-light)] underline"
              href="https://www.ncpgambling.org/"
              target="_blank"
              rel="noopener noreferrer"
            >
              ncpgambling.org
            </a>
          </li>
        </ul>
      </section>
    </div>
  )
}
