import Link from 'next/link'
import { ChevronRight, HelpCircle, MessageCircle, Search, Mail } from 'lucide-react'

import { CoinFrenzyLogo, FoxIllustration } from '@coinfrenzy/ui/player'

export const dynamic = 'force-dynamic'

// Coin Frenzy Support — the corner help widget from the live site. We
// render it inline at /live-support instead of as a floating popover.
// Same layout: top spade + Coin Frenzy logo + "How can we help?"
// header, then the question button, the search box, and the list of
// common FAQ links. The "Messages" / "Help" tabs at the bottom of the
// widget are stubbed; full Intercom-style chat lands with the support
// integration (docs/09 §11).

const FAQ = [
  { question: 'How Long Does It Take to Receive a Redemption?', href: '/faq#redemption-timing' },
  { question: 'Frequently Asked Questions', href: '/faq' },
  { question: 'What is Playthrough?', href: '/faq#playthrough' },
  { question: 'What Is the New Player Offer?', href: '/faq#new-player-offer' },
]

export default function LiveSupportPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="overflow-hidden rounded-lg border border-[var(--cf-border-default)] bg-[radial-gradient(ellipse_at_top,#3a0a0c_0%,#1a0608_50%,#000_100%)]">
        <div className="flex flex-col items-center px-6 py-8 text-center">
          <span className="text-4xl text-[var(--cf-red-primary)]">♠</span>
          <div className="mt-2">
            <CoinFrenzyLogo variant="wordmark" width={180} height={56} />
          </div>
          <p className="mt-2 text-xs font-bold uppercase tracking-[0.3em] text-[var(--cf-gold-light)]">
            Support
          </p>
          <p className="mt-6 text-sm text-white">
            Hi there <span aria-hidden="true">👋</span>
          </p>
          <h1 className="cf-headline text-2xl font-bold text-white">How can we help?</h1>
        </div>

        <div className="space-y-3 px-4 pb-6 sm:px-6">
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-card)] px-4 py-3 text-left text-sm text-white hover:border-[var(--cf-gold-medium)]"
          >
            Ask a question
            <span className="flex items-center gap-1 text-[var(--cf-gray-light)]">
              <FoxIllustration
                variant="standing"
                width={20}
                height={20}
                className="h-5 w-5 rounded-full"
              />
              <span>·</span>
              <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--cf-bg-elevated)] text-[10px] font-bold">
                CS
              </span>
            </span>
          </button>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cf-gray-light)]" />
            <input
              placeholder="Search for help"
              className="h-11 w-full rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] pl-10 pr-3 text-sm text-white placeholder:text-[var(--cf-gray-light)] focus:border-[var(--cf-gold-medium)] focus:outline-none"
            />
          </div>

          <ul className="space-y-2">
            {FAQ.map((item) => (
              <li key={item.question}>
                <Link
                  href={item.href}
                  className="flex items-center justify-between rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-card)] px-4 py-3 text-sm text-white hover:border-[var(--cf-gold-medium)]"
                >
                  {item.question}
                  <ChevronRight className="h-4 w-4 text-[var(--cf-gray-light)]" />
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-2 rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-card)] p-4 text-sm">
            <h2 className="cf-headline text-base font-bold uppercase tracking-wider text-white">
              Still need a hand?
            </h2>
            <p className="mt-1 text-[var(--cf-gray-light)]">
              Email <span className="font-bold text-white">support@coinfrenzy.com</span> and our
              team will reply within 24 hours.
            </p>
            <div className="mt-3 flex gap-2">
              <a
                href="mailto:support@coinfrenzy.com"
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] px-3 text-xs font-bold uppercase tracking-wider text-white hover:bg-[var(--cf-bg-card-hover)]"
              >
                <Mail className="h-3.5 w-3.5" /> Email Us
              </a>
              <Link
                href="/faq"
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] px-3 text-xs font-bold uppercase tracking-wider text-white hover:bg-[var(--cf-bg-card-hover)]"
              >
                <HelpCircle className="h-3.5 w-3.5" /> FAQ
              </Link>
            </div>
          </div>
        </div>

        <div className="flex border-t border-[var(--cf-border-default)] bg-[var(--cf-bg-base)]">
          <button
            type="button"
            className="flex flex-1 flex-col items-center gap-1 py-3 text-xs font-semibold text-[var(--cf-gold-light)]"
          >
            <span className="grid h-5 w-5 place-items-center rounded-md bg-[var(--cf-gold-deep)] text-[#1a1a1a]">
              ●
            </span>
            Home
          </button>
          <button
            type="button"
            className="flex flex-1 flex-col items-center gap-1 py-3 text-xs text-[var(--cf-gray-light)]"
          >
            <MessageCircle className="h-5 w-5" /> Messages
          </button>
          <Link
            href="/faq"
            className="flex flex-1 flex-col items-center gap-1 py-3 text-xs text-[var(--cf-gray-light)]"
          >
            <HelpCircle className="h-5 w-5" /> Help
          </Link>
        </div>
      </div>
    </div>
  )
}
