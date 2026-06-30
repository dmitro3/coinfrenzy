import Link from 'next/link'
import { Instagram } from 'lucide-react'

import { cn } from '../lib/utils'
import { CoinFrenzyLogo } from '../player/CoinFrenzyLogo'

// Marketing footer — three-column layout (Quick Links / Legal / Support)
// plus the brand block. Matches the unauthenticated footer from the
// live site.

const QUICK = [
  { href: '/lobby', label: 'Play Games' },
  { href: '/promotions', label: 'Promotions' },
  { href: '/about', label: 'About Us' },
  { href: '/faq', label: 'FAQ' },
]
const LEGAL = [
  { href: '/terms', label: 'Terms & Conditions' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/sweepstakes-rules', label: 'Sweepstakes Rules' },
  { href: '/amoe', label: 'Free Entry (AMOE)' },
  { href: '/responsible-gaming', label: 'Responsible Gaming' },
]
const SUPPORT = [
  { href: '/live-support', label: 'Live Support' },
  { href: '/contact', label: 'Contact Us' },
  { href: 'mailto:support@coinfrenzy.com', label: 'support@coinfrenzy.com' },
]

export function MarketingFooter({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        'border-t border-[var(--cf-border-subtle)] bg-[var(--cf-bg-base)] px-4 py-12 sm:px-8',
        className,
      )}
    >
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
        <div>
          <CoinFrenzyLogo variant="wordmark" width={150} height={48} />
          <p className="mt-4 text-sm font-medium text-white">
            Play free. Win real. That&apos;s the Frenzy.
          </p>
          <p className="mt-4 max-w-xs text-xs leading-relaxed text-[var(--cf-gray-light)]">
            Free-to-play social casino with sweepstakes prizes. No purchase necessary to enter or
            win. Must be 18+ to participate.
          </p>
          <a
            href="https://instagram.com/coinfrenzy"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Coin Frenzy on Instagram"
            className="mt-4 inline-flex items-center gap-1.5 text-xs text-[var(--cf-gray-light)] hover:text-[var(--cf-gold-light)]"
          >
            <Instagram className="h-4 w-4" /> @coinfrenzy
          </a>
        </div>
        <FooterColumn title="Quick Links" items={QUICK} />
        <FooterColumn title="Legal" items={LEGAL} />
        <FooterColumn title="Support" items={SUPPORT} />
      </div>

      <div className="mx-auto mt-10 flex max-w-6xl flex-col items-center gap-4 border-t border-[var(--cf-border-subtle)] pt-6 text-center">
        <span className="grid h-9 w-9 place-items-center rounded-full cf-gold-gradient text-xs font-extrabold text-[#1a1a1a]">
          18+
        </span>
        <p className="max-w-3xl text-xs leading-relaxed text-[var(--cf-gray-light)]">
          <span className="font-bold uppercase text-white">No Purchase Necessary</span> to play.
          Coin Frenzy is a play-for-fun social gaming platform intended for entertainment purposes
          only. Coin Frenzy does not offer real-money gambling. Void where prohibited by law. For
          complete rules see our{' '}
          <Link className="underline hover:text-white" href="/sweepstakes-rules">
            Sweepstakes Rules
          </Link>
          .
        </p>
        <p className="text-xs text-[var(--cf-gray-light)]">
          © {new Date().getFullYear()} Coinfrenzy | All Rights Reserved
        </p>
      </div>
    </footer>
  )
}

function FooterColumn({
  title,
  items,
}: {
  title: string
  items: { href: string; label: string }[]
}) {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--cf-gold-light)]">
        {title}
      </h3>
      <ul className="mt-3 space-y-2 text-sm">
        {items.map((item) => (
          <li key={item.href + item.label}>
            <Link href={item.href} className="text-[var(--cf-gray-light)] hover:text-white">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
