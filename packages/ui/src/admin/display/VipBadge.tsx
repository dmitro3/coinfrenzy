import * as React from 'react'
import { Crown, Diamond, Sparkles, UserPlus } from 'lucide-react'

import { cn } from '../../lib/utils'

// M4 — VIP status pill. Mirrors StatusPill aesthetics but is dedicated so
// the icon + color mapping live in one place and stay consistent across
// admin and host portals.

export type VipStatus = 'none' | 'candidate' | 'vip' | 'high_roller'

interface VipBadgeProps {
  status: VipStatus
  /** Set to true to render a smaller variant suitable for tables. */
  compact?: boolean
  className?: string
}

const META: Record<
  VipStatus,
  { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }
> = {
  none: {
    label: 'Standard',
    icon: UserPlus,
    cls: 'bg-elevated text-ink-tertiary',
  },
  candidate: {
    label: 'Candidate',
    icon: Sparkles,
    cls: 'bg-notice-bg text-notice',
  },
  vip: {
    label: 'VIP',
    icon: Crown,
    cls: 'bg-attention-bg text-attention',
  },
  high_roller: {
    label: 'High Roller',
    icon: Diamond,
    cls: 'bg-brand-bg text-brand',
  },
}

export function VipBadge({ status, compact = false, className }: VipBadgeProps) {
  const m = META[status]
  const Icon = m.icon
  if (status === 'none' && compact) {
    // Don't render a noisy "Standard" tag in compact mode — hosts and admins
    // already know "no badge = standard player".
    return null
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm font-medium',
        compact ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs',
        m.cls,
        className,
      )}
    >
      <Icon className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
      {m.label}
    </span>
  )
}
