import { redirect } from 'next/navigation'

import { listRedemptionsByStatuses, loadRedemptionDetail } from '../_data'
import { computePendingInsights } from '../_insights'
import { CashierSplitView } from '../_split-view'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// docs/08 §7.1 — Pending Redemptions split view. Cashiers live here.
//
// The list pane on the left shows every row in `pending_review` and
// `kyc_pending`. Selecting one populates the right pane with the player
// context (KYC, geo, history, flags) and the action row.

type SearchParams = Promise<{ id?: string }>

export default async function CashierPendingPage({ searchParams }: { searchParams: SearchParams }) {
  const list = await listRedemptionsByStatuses(['pending_review', 'kyc_pending'])
  const params = await searchParams
  const selectedId = params.id ?? list[0]?.id ?? null

  if (selectedId && !list.some((r) => r.id === selectedId)) {
    // Selected row no longer in the queue — drop the param.
    redirect('/admin/cashier/pending')
  }

  const detail = selectedId ? await loadRedemptionDetail(selectedId) : null

  return (
    <CashierSplitView
      title="Pending Redemptions"
      basePath="/admin/cashier/pending"
      list={list}
      detail={detail}
      mode="pending"
      insights={computePendingInsights(list)}
    />
  )
}
