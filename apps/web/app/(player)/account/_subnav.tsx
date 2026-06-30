'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Clock, CircleUserRound, Lock, Receipt, Settings, UserMinus } from 'lucide-react'

import { cn } from '@coinfrenzy/ui/lib/utils'

// Matches the live coinfrenzy.com /settings subnav: a strip of 6 large
// square tiles (My Account / Password / Transactions / Game History /
// Self Exclusion / Preferences). Each tile is an icon-over-label card;
// the active one gets the bright gold inset + glow per `cf-subnav-active`.

const TABS = [
  { label: 'My Account', href: '/account', icon: CircleUserRound },
  { label: 'Password', href: '/account/security', icon: Lock },
  { label: 'Transactions', href: '/account/history', icon: Receipt },
  { label: 'Game History', href: '/account/game-history', icon: Clock },
  { label: 'Self Exclusion', href: '/account/responsible-gaming', icon: UserMinus },
  { label: 'Preferences', href: '/account/notifications', icon: Settings },
]

export function AccountSubnav() {
  const pathname = usePathname() ?? '/account'

  return (
    <nav
      aria-label="Account sections"
      className="cf-account-card cf-fade-up grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 md:grid-cols-6"
    >
      {TABS.map((tab, index) => {
        const Icon = tab.icon
        const active =
          tab.href === '/account'
            ? pathname === '/account' || pathname === '/account/settings'
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            style={{ ['--cf-fade-delay' as string]: `${40 + index * 30}ms` }}
            className={cn(
              'cf-fade-up group relative flex flex-col items-center justify-center gap-2 rounded-md',
              'border bg-[var(--cf-bg-elevated)] px-3 py-5 text-center',
              'transition-all duration-200',
              active
                ? 'cf-subnav-active'
                : 'border-[var(--cf-border-default)] hover:-translate-y-0.5 hover:border-[var(--cf-gold-medium)]/60 hover:shadow-[0_8px_22px_-12px_rgba(245,208,102,0.4)]',
            )}
          >
            <Icon
              className={cn(
                'h-7 w-7 transition-colors',
                active
                  ? 'text-[var(--cf-gold-light)] drop-shadow-[0_0_8px_rgba(245,208,102,0.6)]'
                  : 'text-[var(--cf-gray-light)] group-hover:text-[var(--cf-gold-light)]',
              )}
            />
            <span
              className={cn(
                'text-xs font-bold uppercase tracking-[0.12em] transition-colors',
                active ? 'text-white' : 'text-[var(--cf-gray-light)] group-hover:text-white',
              )}
            >
              {tab.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
