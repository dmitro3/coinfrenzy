import type { ReactNode } from 'react'

import { cn } from '../lib/utils'

// Generic feature block used on the marketing home page — three to four
// columns of icon + heading + short body.

interface MarketingFeatureProps {
  title: string
  description: string
  icon: ReactNode
  className?: string
}

export function MarketingFeature({ title, description, icon, className }: MarketingFeatureProps) {
  return (
    <article
      className={cn(
        'rounded-lg border border-[var(--cf-border-default)] bg-[var(--cf-bg-card)] p-6',
        className,
      )}
    >
      <div className="grid h-12 w-12 place-items-center rounded-md cf-gold-gradient text-[#1a1a1a]">
        {icon}
      </div>
      <h3 className="cf-headline mt-4 text-base font-bold uppercase tracking-wider text-white">
        {title}
      </h3>
      <p className="mt-2 text-sm text-[var(--cf-gray-light)]">{description}</p>
    </article>
  )
}
