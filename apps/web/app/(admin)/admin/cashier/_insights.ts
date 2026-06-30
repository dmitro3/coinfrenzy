import 'server-only'

import type { QuickInsight } from '@coinfrenzy/ui/admin'

import { formatUsd } from '@/lib/format'

import type { RedemptionListRow } from './_data'

export function computePendingInsights(rows: RedemptionListRow[]): QuickInsight[] {
  const pendingReview = rows.filter((r) => r.status === 'pending_review').length
  const kycPending = rows.filter((r) => r.status === 'kyc_pending').length
  const totalPendingUsd = rows.reduce((s, r) => s + r.amountUsd, 0n)

  let oldestHours = 0
  for (const r of rows) {
    const h = (Date.now() - r.createdAt.getTime()) / 3600_000
    if (h > oldestHours) oldestHours = h
  }

  return [
    {
      label: 'Total waiting',
      value: rows.length.toLocaleString(),
      tone: rows.length > 0 ? 'attention' : 'neutral',
    },
    {
      label: 'Pending review',
      value: pendingReview.toLocaleString(),
      tone: pendingReview > 0 ? 'attention' : 'neutral',
    },
    {
      label: 'KYC pending',
      value: kycPending.toLocaleString(),
      tone: kycPending > 0 ? 'notice' : 'neutral',
    },
    {
      label: 'Oldest in queue',
      value: oldestHours > 0 ? `${oldestHours.toFixed(1)}h` : '—',
      tone: oldestHours > 4 ? 'critical' : oldestHours > 0 ? 'attention' : 'neutral',
    },
    {
      label: 'Total $ pending',
      value: formatUsd(totalPendingUsd.toString()),
      tone: 'neutral',
    },
  ]
}

export function computeApprovedInsights(rows: RedemptionListRow[]): QuickInsight[] {
  const paid = rows.filter((r) => r.status === 'paid').length
  const submitted = rows.filter(
    (r) => r.status === 'submitted' || r.status === 'awaiting_webhook',
  ).length
  const totalUsd = rows.reduce((s, r) => s + r.amountUsd, 0n)
  let avgApprovalMs = 0
  let avgApprovalCount = 0
  for (const r of rows) {
    if (r.approvedAt) {
      avgApprovalMs += r.approvedAt.getTime() - r.createdAt.getTime()
      avgApprovalCount++
    }
  }
  const avgApprovalHours = avgApprovalCount > 0 ? avgApprovalMs / avgApprovalCount / 3600_000 : 0
  return [
    { label: 'Total approved', value: rows.length.toLocaleString(), tone: 'positive' },
    { label: 'Paid', value: paid.toLocaleString(), tone: 'positive' },
    { label: 'In transit', value: submitted.toLocaleString(), tone: 'notice' },
    {
      label: 'Avg approval time',
      value: avgApprovalHours > 0 ? `${avgApprovalHours.toFixed(1)}h` : '—',
      tone: 'neutral',
    },
    {
      label: 'Total approved $',
      value: formatUsd(totalUsd.toString()),
      tone: 'neutral',
    },
  ]
}

export function computeCancelledInsights(rows: RedemptionListRow[]): QuickInsight[] {
  const rejected = rows.filter((r) => r.status === 'rejected').length
  const failed = rows.filter((r) => r.status === 'failed').length
  const cancelled = rows.filter((r) => r.status === 'cancelled').length
  const totalUsd = rows.reduce((s, r) => s + r.amountUsd, 0n)
  return [
    { label: 'Total cancelled', value: rows.length.toLocaleString(), tone: 'neutral' },
    { label: 'Rejected', value: rejected.toLocaleString(), tone: 'critical' },
    { label: 'Failed', value: failed.toLocaleString(), tone: 'critical' },
    { label: 'Cancelled', value: cancelled.toLocaleString(), tone: 'neutral' },
    { label: 'Total $', value: formatUsd(totalUsd.toString()), tone: 'neutral' },
  ]
}

export function computeAmlInsights(rows: RedemptionListRow[]): QuickInsight[] {
  const totalUsd = rows.reduce((s, r) => s + r.amountUsd, 0n)
  let oldestHours = 0
  for (const r of rows) {
    const h = (Date.now() - r.createdAt.getTime()) / 3600_000
    if (h > oldestHours) oldestHours = h
  }
  return [
    {
      label: 'AML hold',
      value: rows.length.toLocaleString(),
      tone: rows.length > 0 ? 'critical' : 'neutral',
    },
    {
      label: 'Oldest hold',
      value: oldestHours > 0 ? `${oldestHours.toFixed(1)}h` : '—',
      tone: oldestHours > 24 ? 'critical' : oldestHours > 0 ? 'attention' : 'neutral',
    },
    { label: 'Total $ on hold', value: formatUsd(totalUsd.toString()), tone: 'critical' },
  ]
}
