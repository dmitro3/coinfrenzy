'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'

interface CasinoGamesSearchFormProps {
  defaultQuery: string
  defaultProvider: string
  categorySlug: string | null
  providers: { slug: string; displayName: string }[]
}

export function CasinoGamesSearchForm({
  defaultQuery,
  defaultProvider,
  categorySlug,
  providers,
}: CasinoGamesSearchFormProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const searchParams = useSearchParams()
  const router = useRouter()

  React.useEffect(() => {
    function onFocusRequest() {
      inputRef.current?.focus()
    }
    window.addEventListener('coinfrenzy:focus-casino-search', onFocusRequest)
    return () => window.removeEventListener('coinfrenzy:focus-casino-search', onFocusRequest)
  }, [])

  React.useEffect(() => {
    if (searchParams.get('focus') !== 'search') return

    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus()
    })

    const next = new URLSearchParams(searchParams.toString())
    next.delete('focus')
    const qs = next.toString()
    router.replace(`/casino-games${qs ? `?${qs}` : ''}`, { scroll: false })

    return () => cancelAnimationFrame(frame)
  }, [searchParams, router])

  return (
    <form className="mt-4 flex flex-wrap items-center gap-3">
      <div className="relative min-w-[260px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cf-gray-light)]" />
        <input
          ref={inputRef}
          name="q"
          defaultValue={defaultQuery}
          placeholder="Search"
          className="h-11 w-full rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] pl-10 pr-3 text-sm text-white placeholder:text-[var(--cf-gray-light)] focus:border-[var(--cf-gold-medium)] focus:outline-none"
        />
      </div>
      <select
        name="provider"
        defaultValue={defaultProvider}
        className="h-11 min-w-[180px] rounded-md border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] px-3 text-sm text-white focus:border-[var(--cf-gold-medium)] focus:outline-none"
      >
        <option value="">All Providers</option>
        {providers.map((p) => (
          <option key={p.slug} value={p.slug}>
            {p.displayName}
          </option>
        ))}
      </select>
      {categorySlug && <input type="hidden" name="category" value={categorySlug} />}
      <button
        type="submit"
        className="cf-gold-gradient h-11 rounded-md px-5 text-sm font-bold uppercase tracking-wider text-[#1a1a1a]"
      >
        Apply
      </button>
    </form>
  )
}
