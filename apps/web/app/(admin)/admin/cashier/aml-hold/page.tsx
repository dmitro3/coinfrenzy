import { redirect } from 'next/navigation'

import { hasAtLeast, type AdminRoleSlug } from '@coinfrenzy/core/auth'

import { requireAdminSession } from '@/lib/admin-session'

import { listRedemptionsByStatuses, loadRedemptionDetail } from '../_data'
import { computeAmlInsights } from '../_insights'
import { CashierSplitView } from '../_split-view'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// docs/07 §7.3 — Manager+ AML hold queue. Each row links to the same split
// view used by the cashier pages, with the AML action set surfaced.

type SearchParams = Promise<{ id?: string }>

export default async function CashierAmlHoldPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireAdminSession('/admin/cashier/aml-hold')
  if (!hasAtLeast(session.payload.role as AdminRoleSlug, 'manager')) {
    redirect('/admin/cashier/pending')
  }

  const list = await listRedemptionsByStatuses(['aml_hold'])
  const params = await searchParams
  const selectedId = params.id ?? list[0]?.id ?? null
  const detail = selectedId ? await loadRedemptionDetail(selectedId) : null

  return (
    <CashierSplitView
      title="AML Hold Queue"
      basePath="/admin/cashier/aml-hold"
      list={list}
      detail={detail}
      mode="aml"
      insights={computeAmlInsights(list)}
    />
  )
}
