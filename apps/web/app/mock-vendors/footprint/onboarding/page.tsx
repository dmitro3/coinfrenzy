import FootprintOnboardingClient from './client'

type SearchParams = Promise<{
  fp_id?: string
  token?: string
  email?: string
  outcome?: 'pass' | 'fail' | 'review'
  successUrl?: string
  /** When set the page renders in iframe-embed mode and posts the
   * outcome back via postMessage instead of full-page navigation. */
  embedded?: string
  theme?: string
}>

export default async function MockFootprintOnboardingPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  return (
    <FootprintOnboardingClient
      fpId={params.fp_id ?? 'fp_demo'}
      token={params.token ?? 'tok_demo'}
      email={params.email ?? null}
      outcome={params.outcome ?? 'pass'}
      successUrl={params.successUrl ?? '/account/kyc?status=completed'}
      embedded={params.embedded === '1'}
      theme={params.theme === 'dark' ? 'dark' : 'light'}
    />
  )
}
