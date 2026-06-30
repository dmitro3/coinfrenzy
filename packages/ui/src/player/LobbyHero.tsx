import Image from 'next/image'
import Link from 'next/link'

import { cn } from '../lib/utils'

// The wide hero banner shown at the top of the lobby. Uses the
// brand-supplied "Welcome to the Frenzy" artwork (gold metallic text +
// fox cut-out on the right, sparkles, dark gradient background). The
// mobile variant is a shorter crop; the desktop variant fills the full
// content width. The H1 inside is visually-hidden so screen readers and
// SEO crawlers still see real heading text.

interface LobbyHeroProps {
  headline?: string
  subhead?: string
  className?: string
  /** Optional alternate art — e.g. /brand/banners/new-offer-30sc.png. */
  desktopSrc?: string
  mobileSrc?: string
  alt?: string
  href?: string
}

export function LobbyHero({
  headline = 'Welcome to the Frenzy',
  subhead,
  className,
  desktopSrc = '/brand/banners/hero_section_banner.webp',
  // desktopSrc = '/brand/banners/welcome-desktop.png',
  mobileSrc = '/brand/banners/welcome-mobile.png',
  alt = 'Welcome to the Frenzy — get free Sweep and Gold Coins daily',
  href,
}: LobbyHeroProps) {
  const inner = (
    <>
      <h1 className="sr-only">{headline}</h1>

      <picture>
        <source media="(min-width: 640px)" srcSet={desktopSrc} />
        <Image
          src={mobileSrc}
          alt={alt}
          width={1024}
          height={244}
          className="block w-full h-auto"
          priority
        />
      </picture>

      {subhead ? <p className="sr-only">{subhead}</p> : null}
    </>
  )

  return (
    <section className={cn('relative overflow-hidden rounded-lg bg-black', className)}>
      {href ? (
        <Link
          href={href}
          aria-label={alt}
          className="block cursor-pointer focus-visible:outline-none"
        >
          {inner}
        </Link>
      ) : (
        inner
      )}
    </section>
  )
}
