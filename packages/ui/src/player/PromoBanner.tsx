import Image from 'next/image'
import Link from 'next/link'

import { cn } from '../lib/utils'

// Promo banner row on /promotions and embedded in the lobby. Three
// rendering modes work off a single shared frame so every banner has
// the same gold-bordered casino-card feel:
//
// 1. `imageSrc` — pixel-perfect mode: drops in a brand-supplied
//    Photoshop banner (refer-friends, daily-bonus, get-30-sc, etc.)
//    and renders it edge-to-edge inside the gold frame. Desktop bake
//    is 1024×244; mobile crop is shorter.
// 2. Programmatic — multi-layer gold + skyline gradient with a large
//    display headline, used when no baked art exists or the bake is
//    damaged. Supports an optional mascot PNG slot.
// 3. Both modes accept an optional `badge` (top-left pill — HOT, NEW,
//    DAILY, FEATURED) and `cta` (bottom-right glass pill) for the
//    extra "premium offer card" feel.

type BadgeTone = 'hot' | 'new' | 'daily' | 'featured' | 'vip'

interface PromoBadge {
  label: string
  tone?: BadgeTone
}

interface PromoCta {
  label: string
}

interface PromoBannerProps {
  title: string
  /** Split lines — rendered stacked in programmatic mode. Accepts a
   * readonly array so callers can hand off `as const` data without
   * stripping the readonly modifier. */
  titleLines?: readonly string[]
  subtitle?: string
  href?: string
  className?: string
  /** Brand-supplied banner artwork. When provided, this image replaces the programmatic layout. */
  imageSrc?: string
  /** Optional mobile crop for the same banner. */
  imageMobileSrc?: string
  alt?: string
  /** Pill in the top-left corner — short label, tone drives color. */
  badge?: PromoBadge
  /** Glass pill in the bottom-right with an arrow indicator. */
  cta?: PromoCta
  /** Optional transparent mascot PNG layered to the right in programmatic mode. */
  mascotSrc?: string
  /**
   * Visual size of the card:
   *  - `default` (≈244px desktop) — the live-site stack default
   *  - `hero` (≈300px desktop) — used for the top "featured" promo
   *  - `compact` (≈180px desktop) — used in lobby strips
   */
  size?: 'default' | 'hero' | 'compact'
  /** Programmatic-mode accent flavor — controls the underlying gradient. */
  accent?: 'midnight' | 'royal' | 'ember'
}

export function PromoBanner({
  title,
  titleLines,
  subtitle,
  href,
  className,
  imageSrc,
  imageMobileSrc,
  alt,
  badge,
  cta,
  mascotSrc,
  size = 'default',
  accent = 'midnight',
}: PromoBannerProps) {
  const heightClass =
    size === 'hero'
      ? 'min-h-[180px] sm:min-h-[240px] md:min-h-[300px]'
      : size === 'compact'
        ? 'min-h-[140px] sm:min-h-[160px] md:min-h-[180px]'
        : 'min-h-[156px] sm:min-h-[200px] md:min-h-[244px]'

  const body = (
    <article
      className={cn('cf-promo-card group relative isolate overflow-hidden', heightClass, className)}
    >
      {/* Corner gleams — quietly twinkle on idle. */}
      <CornerGleams />

      {imageSrc ? (
        <ImageBannerSurface
          imageSrc={imageSrc}
          imageMobileSrc={imageMobileSrc}
          alt={alt ?? title}
        />
      ) : (
        <ProgrammaticSurface
          title={title}
          titleLines={titleLines}
          subtitle={subtitle}
          mascotSrc={mascotSrc}
          accent={accent}
        />
      )}

      {/* Diagonal gold sweep on hover. Sits above the art but below
          the badge / CTA so it polishes without obscuring labels. */}
      <span aria-hidden="true" className="cf-promo-sweep" />

      {badge ? (
        <div className="pointer-events-none absolute left-3 top-3 z-20 sm:left-4 sm:top-4">
          <PromoBadgePill badge={badge} />
        </div>
      ) : null}

      {cta ? (
        <div className="pointer-events-none absolute bottom-3 right-3 z-20 sm:bottom-4 sm:right-4">
          <span className="cf-promo-cta">
            {cta.label}
            <ChevronRightGlyph />
          </span>
        </div>
      ) : null}
    </article>
  )

  return href ? (
    <Link href={href} className="block focus-visible:outline-none" aria-label={alt ?? title}>
      {body}
    </Link>
  ) : (
    body
  )
}

// -------- Pieces --------

function CornerGleams() {
  return (
    <>
      <span aria-hidden="true" className="cf-promo-gleam cf-promo-gleam--tl" />
      <span aria-hidden="true" className="cf-promo-gleam cf-promo-gleam--tr" />
      <span aria-hidden="true" className="cf-promo-gleam cf-promo-gleam--bl" />
      <span aria-hidden="true" className="cf-promo-gleam cf-promo-gleam--br" />
    </>
  )
}

function ImageBannerSurface({
  imageSrc,
  imageMobileSrc,
  alt,
}: {
  imageSrc: string
  imageMobileSrc?: string
  alt: string
}) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-[12px]">
      <picture>
        {imageMobileSrc ? <source media="(max-width: 639px)" srcSet={imageMobileSrc} /> : null}
        <Image
          src={imageSrc}
          alt={alt}
          width={1280}
          height={305}
          priority={false}
          className="block h-full w-full object-cover"
        />
      </picture>
      {/* Soft bottom vignette so the CTA pill stays legible on busy
          art (yacht skyline, penthouse scene, etc.). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/55 via-black/15 to-transparent"
      />
    </div>
  )
}

function ProgrammaticSurface({
  title,
  titleLines,
  subtitle,
  mascotSrc,
  accent,
}: {
  title: string
  titleLines?: readonly string[]
  subtitle?: string
  mascotSrc?: string
  accent: NonNullable<PromoBannerProps['accent']>
}) {
  const lines = titleLines ?? [title]
  const gradient =
    accent === 'royal'
      ? 'linear-gradient(120deg, #0b1430 0%, #07091e 50%, #04020a 100%)'
      : accent === 'ember'
        ? 'linear-gradient(120deg, #2a0608 0%, #150409 50%, #04020a 100%)'
        : 'linear-gradient(120deg, #1a0708 0%, #100408 50%, #04020a 100%)'
  const accentGlow =
    accent === 'royal'
      ? 'radial-gradient(circle at 22% 88%, rgba(40,72,160,0.45), transparent 58%)'
      : accent === 'ember'
        ? 'radial-gradient(circle at 22% 88%, rgba(160,28,46,0.45), transparent 58%)'
        : 'radial-gradient(circle at 22% 88%, rgba(127,16,21,0.42), transparent 60%)'

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-[12px]"
      style={{ background: gradient }}
    >
      {/* Bottom gold haze + accent glow for depth. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(to top, rgba(212,165,61,0.22), transparent 55%), ${accentGlow}`,
        }}
      />

      {/* Star field — quiet gold dots scattered across the dark base. */}
      <div aria-hidden="true" className="cf-promo-stars" />

      {/* A few brighter sparkle accents that gently pulse. */}
      <Sparkle x="14%" y="22%" size={10} />
      <Sparkle x="86%" y="18%" size={8} delay="900ms" />
      <Sparkle x="72%" y="74%" size={6} delay="1800ms" />
      <Sparkle x="32%" y="78%" size={6} delay="2400ms" />

      <div className="relative z-10 flex h-full items-center px-5 py-5 sm:px-8 sm:py-6 md:px-10">
        <div className="max-w-[68%] sm:max-w-[60%]">
          {lines.map((line, i) => (
            <span
              key={i}
              className="cf-headline cf-gold-text block text-2xl font-black uppercase leading-[1.05] tracking-wide drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)] sm:text-3xl md:text-5xl"
            >
              {line}
            </span>
          ))}
          {subtitle ? (
            <p className="mt-2 max-w-md text-xs font-semibold text-white/85 sm:text-sm md:text-base">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>

      {mascotSrc ? (
        <div className="pointer-events-none absolute bottom-0 right-2 hidden h-[110%] w-[35%] items-end justify-end sm:flex md:right-6">
          <Image
            src={mascotSrc}
            alt=""
            width={420}
            height={420}
            className="h-full w-auto object-contain object-bottom drop-shadow-[0_20px_30px_rgba(0,0,0,0.55)]"
          />
        </div>
      ) : null}
    </div>
  )
}

function Sparkle({ x, y, size, delay }: { x: string; y: string; size: number; delay?: string }) {
  return (
    <svg
      aria-hidden="true"
      className="cf-promo-spark pointer-events-none absolute"
      style={{ left: x, top: y, width: size, height: size, animationDelay: delay }}
      viewBox="0 0 24 24"
    >
      <defs>
        <radialGradient id="cf-promo-sparkle" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff5d0" stopOpacity="1" />
          <stop offset="55%" stopColor="#e6b558" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#e6b558" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path
        d="M12 0 L13.5 10.5 L24 12 L13.5 13.5 L12 24 L10.5 13.5 L0 12 L10.5 10.5 Z"
        fill="url(#cf-promo-sparkle)"
      />
    </svg>
  )
}

function ChevronRightGlyph() {
  return (
    <svg
      aria-hidden="true"
      width="10"
      height="10"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 2 L8 6 L4 10" />
    </svg>
  )
}

function PromoBadgePill({ badge }: { badge: PromoBadge }) {
  const tone = badge.tone ?? 'featured'
  const toneClass =
    tone === 'hot'
      ? 'border-[#a21f2b] bg-gradient-to-b from-[#3a0608] to-[#1a0204] text-[#ffb8c0]'
      : tone === 'new'
        ? 'border-[#16652a] bg-gradient-to-b from-[#0b2a14] to-[#04130a] text-[#a8f4be]'
        : tone === 'daily'
          ? 'border-[#0e6cb8] bg-gradient-to-b from-[#0a213a] to-[#04121e] text-[#bce6ff]'
          : tone === 'vip'
            ? 'border-[#723790] bg-gradient-to-b from-[#1d0a26] to-[#100513] text-[#e8c4ff]'
            : 'border-[var(--cf-gold-medium)] bg-gradient-to-b from-[#1a1305] to-[#08060a] text-[var(--cf-gold-pale)]'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.18em] shadow-[0_4px_14px_-6px_rgba(0,0,0,0.85)] backdrop-blur-sm',
        toneClass,
      )}
    >
      <BadgeDotGlyph tone={tone} />
      {badge.label}
    </span>
  )
}

function BadgeDotGlyph({ tone }: { tone: BadgeTone }) {
  const fill =
    tone === 'hot'
      ? '#ff5a6b'
      : tone === 'new'
        ? '#3dd870'
        : tone === 'daily'
          ? '#4ab6ff'
          : tone === 'vip'
            ? '#d287ff'
            : '#fce5a8'
  return (
    <svg aria-hidden="true" width="7" height="7" viewBox="0 0 8 8">
      <circle cx="4" cy="4" r="3" fill={fill}>
        <animate attributeName="opacity" values="0.4;1;0.4" dur="1.6s" repeatCount="indefinite" />
      </circle>
    </svg>
  )
}
