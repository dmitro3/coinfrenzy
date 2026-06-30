import { listRedemptionsByStatuses, loadRedemptionDetail } from '../_data'
import { computeCancelledInsights } from '../_insights'
import { CashierSplitView } from '../_split-view'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// docs/08 §7.3 — Cancelled / Rejected redemptions. Useful for support
// when a player asks "what happened to my redemption?"

type SearchParams = Promise<{ id?: string }>

export default async function CashierCancelledPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const list = await listRedemptionsByStatuses(['rejected', 'cancelled', 'failed'])
  const params = await searchParams
  const selectedId = params.id ?? list[0]?.id ?? null
  const detail = selectedId ? await loadRedemptionDetail(selectedId) : null

  return (
    <CashierSplitView
      title="Cancelled & Rejected Redemptions"
      basePath="/admin/cashier/cancelled"
      list={list}
      detail={detail}
      mode="cancelled"
      insights={computeCancelledInsights(list)}
    />
  )
}
