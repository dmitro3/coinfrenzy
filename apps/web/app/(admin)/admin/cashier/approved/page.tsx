import { listRedemptionsByStatuses, loadRedemptionDetail } from '../_data'
import { computeApprovedInsights } from '../_insights'
import { CashierSplitView } from '../_split-view'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// docs/08 §7.2 — Approved Redemptions. Read-only audit view. Includes
// every status that has cleared cashier review: approved (queued for
// Finix), submitted, awaiting_webhook, paid.

type SearchParams = Promise<{ id?: string }>

export default async function CashierApprovedPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const list = await listRedemptionsByStatuses([
    'approved',
    'submitted',
    'awaiting_webhook',
    'paid',
  ])
  const params = await searchParams
  const selectedId = params.id ?? list[0]?.id ?? null
  const detail = selectedId ? await loadRedemptionDetail(selectedId) : null

  return (
    <CashierSplitView
      title="Approved Redemptions"
      basePath="/admin/cashier/approved"
      list={list}
      detail={detail}
      mode="approved"
      insights={computeApprovedInsights(list)}
    />
  )
}
