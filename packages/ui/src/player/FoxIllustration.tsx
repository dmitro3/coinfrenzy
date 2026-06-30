import Image from 'next/image'

import { cn } from '../lib/utils'

// Renders one of the green-screen fox JPGs with the SVG chroma-key
// filter so the green background drops out without us having to
// pre-process the source. When a transparent PNG eventually lands, swap
// the `chromaKey` default to `false` (or delete the prop) and the same
// component still works.

export type FoxVariant =
  | 'coins-half'
  | 'coins-full'
  | 'duo'
  | 'standing'
  | 'tall'
  | 'auth-modal'
  // The laying-back tuxedo + sunglasses fox from the live coinfrenzy.com
  // empty/404/no-data states. Already a transparent PNG (alpha
  // pre-baked), so `chromaKey` should be false when rendering it.
  | 'laying'

const SRC: Record<FoxVariant, string> = {
  'coins-half': '/brand/fox/fox-coins-half.jpg',
  'coins-full': '/brand/fox/fox-coins-full.jpg',
  'auth-modal': '/brand/fox/auth-img.webp',
  duo: '/brand/fox/fox-duo.jpg',
  standing: '/brand/fox/fox-standing.jpg',
  tall: '/brand/fox/fox-tall.jpg',
  laying: '/brand/fox/fox-laying.png',
}

interface FoxIllustrationProps {
  variant?: FoxVariant
  className?: string
  width?: number
  height?: number
  priority?: boolean
  /** Apply the SVG chroma-key filter to knock out the green background. */
  chromaKey?: boolean
  alt?: string
  /** Use Next.js fill mode — parent must be position:relative with defined dimensions. */
  fill?: boolean
}

export function FoxIllustration({
  variant = 'coins-half',
  className,
  width = 480,
  height = 320,
  priority,
  chromaKey = true,
  alt = 'Coin Frenzy fox mascot',
  fill = false,
}: FoxIllustrationProps) {
  const baseClass = cn(chromaKey && 'cf-chroma-key', 'select-none', className)

  if (fill) {
    return (
      <Image
        src={SRC[variant]}
        alt={alt}
        fill
        priority={priority}
        className={baseClass}
        unoptimized
      />
    )
  }

  return (
    <Image
      src={SRC[variant]}
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      className={baseClass}
      unoptimized
    />
  )
}
