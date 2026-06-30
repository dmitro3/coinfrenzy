import Link from 'next/link'
import { Instagram } from 'lucide-react'

import { cn } from '../lib/utils'

import { CoinFrenzyLogo } from './CoinFrenzyLogo'

const LEGAL_LINKS = [
  { href: '/responsible-gaming', label: 'Responsible Social Gaming' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms & Conditions' },
  { href: '/sweepstakes-rules', label: 'Sweepstake Rules' },
]

// Footer shown on the lobby surface. Matches the live footer structure:
// centered brand + tagline, Instagram on the same band, legal links,
// the 18+ badge, and the compliance disclaimer.
export function PlayerFooter({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        'w-full bg-[#121212] p-7 pb-[104px] text-[#AAB9B4] transition-all duration-300 md:px-[50px] md:py-8',
        className,
      )}
    >
      <div className="mx-auto flex max-w-[1506px] flex-col items-center gap-7">
        <div className="relative flex w-full flex-col items-center gap-4 border-b border-[var(--cf-border-subtle)] pb-8">
          <CoinFrenzyLogo variant="wordmark" width={150} height={48} />

          <p className="text-center text-sm font-extrabold text-white sm:text-base">
            Play free. Win real. That&apos;s the Frenzy.
          </p>

          <a
            href="https://www.instagram.com/playcoinfrenzy"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Coin Frenzy on Instagram"
            className={cn(
              'inline-flex items-center gap-2 text-xs font-semibold text-[#AAB9B4]',
              'transition-colors hover:text-white',
              'md:absolute md:right-0 md:top-0 md:mt-0',
            )}
          >
            <Instagram className="h-5 w-5" /> Instagram
          </a>
        </div>

        <nav className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm md:gap-x-12 md:text-base">
          {LEGAL_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="font-semibold text-white transition-colors hover:text-[#E1B144]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <span className="grid h-10 w-10 place-items-center rounded-full bg-[#FDB72E] text-sm font-bold text-[#0B0816] md:h-12 md:w-12 md:text-xl">
          18+
        </span>

        <div className="flex w-full flex-col items-center gap-6 border-t border-[var(--cf-border-subtle)] pt-8">
          <p className="max-w-[1043px] text-center text-[10px] font-medium leading-relaxed tracking-wider text-[#AAB9B4]/60 md:text-xs">
            <span className="font-bold uppercase text-[#AAB9B4]">No Purchase Necessary</span> to
            play. CoinFrenzy is a play-for-fun social gaming platform intended for entertainment
            purposes only. CoinFrenzy does not offer real-money gambling. Void where prohibited by
            law. Must be 18+ to participate. For complete rules, see our{' '}
            <Link className="underline hover:text-white" href="/sweepstakes-rules">
              Sweepstakes Rules
            </Link>{' '}
            and{' '}
            <Link className="underline hover:text-white" href="/terms">
              Terms &amp; Conditions
            </Link>
            .
          </p>

          <p className="text-[10px] font-medium text-[#AAB9B4]/50 md:text-xs">
            &copy; {new Date().getFullYear()} Coinfrenzy | All Rights Reserved
          </p>
        </div>
      </div>
    </footer>
  )
}
