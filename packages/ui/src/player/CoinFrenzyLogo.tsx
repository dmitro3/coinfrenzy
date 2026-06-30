import Image from 'next/image'
import Link from 'next/link'

import { cn } from '../lib/utils'

// The "Coin Frenzy" wordmark per the brand guide MUST be rendered as an
// image — never retyped as a font. This wrapper centralises the path and
// the optional gold-halo + sparkle treatment used in the sidebar.
//
// The halo/sparkle markup and CSS are ported verbatim from the live
// /welcome and /dalt funnels at coinfrenzy.com (see
// `CoinFrenzy Welcome/styles.css` §"Header logo" and the matching block
// in `CF x Degen Dalt Giveway funnel/styles.css`). Three sparkles, a
// soft breathing halo, no background plate.

export type CfLogoVariant = 'wordmark' | 'main' | 'mono' | 'gold-bg' | 'dotcom'

const SRC: Record<CfLogoVariant, string> = {
  wordmark: '/brand/logos/coin-frenzy-wordmark.png',
  main: '/brand/logos/coin-frenzy-logo-main.png',
  mono: '/brand/logos/coin-frenzy-mono.png',
  'gold-bg': '/brand/logos/coin-frenzy-gold-bg.png',
  dotcom: '/brand/logos/coin-frenzy-dotcom.png',
}

interface CoinFrenzyLogoProps {
  variant?: CfLogoVariant
  /** Rendered pixel width of the wordmark. */
  width?: number
  /** Rendered pixel height of the wordmark. */
  height?: number
  href?: string
  className?: string
  priority?: boolean
  /** When true (default) wraps the image in the gold halo + sparkles shell. */
  glow?: boolean
}

export function CoinFrenzyLogo({
  variant = 'wordmark',
  width = 166,
  height = 80,
  href,
  className,
  priority,
  glow = true,
}: CoinFrenzyLogoProps) {
  const img = (
    <Image
      src={SRC[variant]}
      alt="Coin Frenzy"
      width={width}
      height={height}
      className={cn('h-auto w-auto select-none', className)}
      style={{ height, width: 'auto' }}
      priority={priority}
    />
  )

  // Sparkle glyph is U+2736 (six-pointed black star, &#10038;). This is
  // the exact character used in the funnel headers — do NOT swap for
  // ✦ (U+2726) which renders slightly chunkier.
  const sparkle = '\u2736'

  const content = glow ? (
    <span className="cf-brand">
      <span className="cf-brand__sparkle cf-brand__sparkle--1" aria-hidden="true">
        {sparkle}
      </span>
      <span className="cf-brand__sparkle cf-brand__sparkle--2" aria-hidden="true">
        {sparkle}
      </span>
      <span className="cf-brand__sparkle cf-brand__sparkle--3" aria-hidden="true">
        {sparkle}
      </span>
      {img}
    </span>
  ) : (
    img
  )

  if (href) {
    return (
      <Link href={href} aria-label="Coin Frenzy home" className="inline-flex">
        {content}
      </Link>
    )
  }
  return content
}
