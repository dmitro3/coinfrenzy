import * as React from 'react'

import { cn } from '../../lib/utils'

export type StatusPillTone = 'positive' | 'attention' | 'critical' | 'notice' | 'neutral'

export type StatusPillStatus =
  // Common shorthands — automatically map to a tone + label
  | 'active'
  | 'suspended'
  | 'self-excluded'
  | 'closed'
  | 'banned'
  | 'pending'
  | 'kyc-pending'
  | 'kyc-verified'
  | 'kyc-unverified'
  | 'completed'
  | 'paid'
  | 'rejected'
  | 'failed'
  | 'cancelled'
  | 'approved'
  | 'submitted'
  | 'requested'
  // Generic — provide your own label + color
  | 'custom'

export interface StatusPillProps {
  status: StatusPillStatus
  /** Override the label text. Required when status='custom'. */
  label?: string
  /** Required when status='custom' to pick the tone. */
  color?: StatusPillTone
  /** Show a small leading dot indicator. */
  dot?: boolean
  className?: string
}

const STATUS_MAP: Record<
  Exclude<StatusPillStatus, 'custom'>,
  { tone: StatusPillTone; label: string }
> = {
  active: { tone: 'positive', label: 'Active' },
  suspended: { tone: 'critical', label: 'Suspended' },
  'self-excluded': { tone: 'attention', label: 'Self-excluded' },
  closed: { tone: 'neutral', label: 'Closed' },
  banned: { tone: 'critical', label: 'Banned' },
  pending: { tone: 'attention', label: 'Pending' },
  'kyc-pending': { tone: 'attention', label: 'KYC pending' },
  'kyc-verified': { tone: 'positive', label: 'KYC verified' },
  'kyc-unverified': { tone: 'neutral', label: 'KYC unverified' },
  completed: { tone: 'positive', label: 'Completed' },
  paid: { tone: 'positive', label: 'Paid' },
  rejected: { tone: 'critical', label: 'Rejected' },
  failed: { tone: 'critical', label: 'Failed' },
  cancelled: { tone: 'neutral', label: 'Cancelled' },
  approved: { tone: 'positive', label: 'Approved' },
  submitted: { tone: 'notice', label: 'Submitted' },
  requested: { tone: 'notice', label: 'Requested' },
}

const TONE_CLASSES: Record<StatusPillTone, { bg: string; text: string; dot: string }> = {
  positive: { bg: 'bg-positive-bg', text: 'text-positive', dot: 'bg-positive' },
  attention: { bg: 'bg-attention-bg', text: 'text-attention', dot: 'bg-attention' },
  critical: { bg: 'bg-critical-bg', text: 'text-critical', dot: 'bg-critical' },
  notice: { bg: 'bg-notice-bg', text: 'text-notice', dot: 'bg-notice' },
  neutral: { bg: 'bg-elevated', text: 'text-ink-secondary', dot: 'bg-ink-tertiary' },
}

export function StatusPill({ status, label, color, dot = false, className }: StatusPillProps) {
  const resolved =
    status === 'custom'
      ? { tone: color ?? 'neutral', label: label ?? 'Unknown' }
      : { tone: STATUS_MAP[status].tone, label: label ?? STATUS_MAP[status].label }

  const tone = TONE_CLASSES[resolved.tone]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs font-medium',
        tone.bg,
        tone.text,
        className,
      )}
    >
      {dot ? (
        <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} aria-hidden="true" />
      ) : null}
      {resolved.label}
    </span>
  )
}
