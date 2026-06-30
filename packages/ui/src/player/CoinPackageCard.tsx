import { cn } from '../lib/utils'

import { GoldButton } from './GoldButton'

// Single coin package on the /shop page. Matches the dark-card rows in
// the live site's Shop modal: small coin-stack icon on the left, GC
// amount on the gold-text line, SC bonus on the green line, price on
// the right with a "BUY NOW" CTA.

interface CoinPackageCardProps {
  goldCoins: string
  bonusSweeps?: string | null
  priceUsd: string
  badge?: string | null
  onBuy?: () => void
  buyHref?: string
  className?: string
}

export function CoinPackageCard({
  goldCoins,
  bonusSweeps,
  priceUsd,
  badge,
  onBuy,
  buyHref,
  className,
}: CoinPackageCardProps) {
  return (
    <article
      className={cn(
        'relative flex items-center gap-4 rounded-md border bg-[var(--cf-bg-card)] p-4',
        badge
          ? 'border-[var(--cf-gold-medium)] shadow-[0_0_18px_rgba(204,153,51,0.18)]'
          : 'border-[var(--cf-border-default)]',
        className,
      )}
    >
      {badge ? (
        <span className="absolute -top-2 left-4 rounded-sm bg-[var(--cf-red-primary)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
          {badge}
        </span>
      ) : null}

      <CoinStackGlyph />

      <div className="min-w-0 flex-1">
        <div
          className="font-mono text-lg font-bold text-[var(--cf-gold-light)]"
          data-numeric="true"
        >
          {goldCoins} <span className="text-xs font-semibold uppercase tracking-wider">GC</span>
        </div>
        {bonusSweeps ? (
          <div
            className="font-mono text-sm font-semibold text-[var(--cf-green-bright)]"
            data-numeric="true"
          >
            + {bonusSweeps} SC Free
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-[var(--cf-gray-light)]">
            Price
          </div>
          <div
            className="rounded-sm border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] px-2 py-1 font-mono text-sm font-bold tabular-nums text-white"
            data-numeric="true"
          >
            {priceUsd}
          </div>
        </div>
        {buyHref ? (
          <GoldButton size="sm" href={buyHref}>
            Buy Now
          </GoldButton>
        ) : onBuy ? (
          <GoldButton size="sm" onClick={onBuy}>
            Buy Now
          </GoldButton>
        ) : null}
      </div>
    </article>
  )
}

function CoinStackGlyph() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <defs>
        <linearGradient id="cf-pkg-coin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fce5a8" />
          <stop offset="50%" stopColor="#c69032" />
          <stop offset="100%" stopColor="#5a3f0e" />
        </linearGradient>
        <linearGradient id="cf-pkg-coin-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff1bf" />
          <stop offset="50%" stopColor="#e6b558" />
          <stop offset="100%" stopColor="#8a5f17" />
        </linearGradient>
      </defs>
      <ellipse cx="24" cy="36" rx="18" ry="6" fill="url(#cf-pkg-coin)" />
      <ellipse cx="24" cy="33" rx="18" ry="6" fill="#1a0c02" stroke="#8a5f17" />
      <ellipse cx="24" cy="26" rx="18" ry="6" fill="url(#cf-pkg-coin)" />
      <ellipse cx="24" cy="23" rx="18" ry="6" fill="#1a0c02" stroke="#8a5f17" />
      <ellipse cx="24" cy="16" rx="18" ry="6" fill="url(#cf-pkg-coin-top)" />
      <ellipse
        cx="24"
        cy="13"
        rx="18"
        ry="6"
        fill="url(#cf-pkg-coin-top)"
        stroke="#fce5a8"
        strokeWidth="0.8"
      />
      <ellipse cx="20" cy="11.5" rx="6" ry="1.4" fill="#fff5d0" opacity="0.65" />
      <text
        x="24"
        y="16.5"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="900"
        fontSize="9"
        fill="#3a2407"
      >
        CF
      </text>
    </svg>
  )
}
