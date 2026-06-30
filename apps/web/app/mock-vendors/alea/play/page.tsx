import AleaPlayClient from './client'

type SearchParams = Promise<{
  session?: string
  game?: string
  token?: string
  currency?: 'GC' | 'SC'
  returnUrl?: string
}>

export default async function MockAleaPlayPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  return (
    <AleaPlayClient
      sessionId={params.session ?? 'sess_demo'}
      gameId={params.game ?? 'hacksaw-cosmic-cash'}
      token={params.token ?? 'tok_demo'}
      currency={(params.currency ?? 'GC') === 'SC' ? 'SC' : 'GC'}
      returnUrl={params.returnUrl ?? '/games'}
    />
  )
}
