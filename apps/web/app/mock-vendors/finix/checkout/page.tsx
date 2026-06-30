import { redirect } from 'next/navigation'

import FinixCheckoutClient from './client'

type SearchParams = Promise<{
  purchaseId?: string
  transferId?: string
  amount?: string
  currency?: string
  packageName?: string
  successUrl?: string
  cancelUrl?: string
  demo?: string
  embedded?: string
  theme?: string
}>

export default async function MockFinixCheckoutPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const demo = params.demo === '1'
  if (!demo && (!params.transferId || !params.purchaseId)) {
    redirect('/mock-vendors')
  }

  const embedded = params.embedded === '1'
  const theme = params.theme === 'dark' || embedded ? 'dark' : 'light'

  return (
    <FinixCheckoutClient
      transferId={params.transferId ?? 'TR_demo123'}
      purchaseId={params.purchaseId ?? 'demo'}
      amount={Number(params.amount ?? 999)}
      currency={params.currency ?? 'USD'}
      packageName={params.packageName ?? 'Demo Package'}
      successUrl={params.successUrl ?? '/wallet?status=success'}
      cancelUrl={params.cancelUrl ?? '/wallet?status=canceled'}
      embedded={embedded}
      theme={theme}
    />
  )
}
