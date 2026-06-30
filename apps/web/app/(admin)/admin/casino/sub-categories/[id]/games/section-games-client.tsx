'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Layers, Search, Sparkles, X } from 'lucide-react'

import { Button } from '@coinfrenzy/ui/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@coinfrenzy/ui/primitives/card'
import { StatusPill } from '@coinfrenzy/ui/admin'

interface AddedGame {
  id: string
  slug: string
  displayName: string
  providerName: string
  providerSlug: string
  status: string
  customerFacing: boolean
  rtp: string | null
}

interface AvailableGame {
  id: string
  slug: string
  displayName: string
  providerId: string
  providerName: string
  providerSlug: string
  status: string
  customerFacing: boolean
  rtp: string | null
}

interface Provider {
  id: string
  slug: string
  displayName: string
}

interface Props {
  sectionId: string
  sectionName: string
  addedGames: AddedGame[]
  availableGames: AvailableGame[]
  providers: Provider[]
}

export function SectionGamesClient({
  sectionId,
  sectionName,
  addedGames,
  availableGames,
  providers,
}: Props) {
  const router = useRouter()
  const [addedSearch, setAddedSearch] = React.useState('')
  const [availableSearch, setAvailableSearch] = React.useState('')
  const [providerFilter, setProviderFilter] = React.useState<string>('all')
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'active' | 'inactive'>('all')
  const [customerFacingFilter, setCustomerFacingFilter] = React.useState<'all' | 'yes' | 'no'>(
    'all',
  )
  const [selectedAvailable, setSelectedAvailable] = React.useState<Set<string>>(new Set())
  const [working, setWorking] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)

  const filteredAdded = React.useMemo(() => {
    const q = addedSearch.trim().toLowerCase()
    if (q === '') return addedGames
    return addedGames.filter(
      (g) => g.displayName.toLowerCase().includes(q) || g.providerName.toLowerCase().includes(q),
    )
  }, [addedGames, addedSearch])

  const filteredAvailable = React.useMemo(() => {
    const q = availableSearch.trim().toLowerCase()
    return availableGames.filter((g) => {
      if (providerFilter !== 'all' && g.providerSlug !== providerFilter) return false
      if (statusFilter !== 'all' && g.status !== statusFilter) return false
      if (customerFacingFilter === 'yes' && !g.customerFacing) return false
      if (customerFacingFilter === 'no' && g.customerFacing) return false
      if (q === '') return true
      return (
        g.displayName.toLowerCase().includes(q) ||
        g.providerName.toLowerCase().includes(q) ||
        g.slug.toLowerCase().includes(q)
      )
    })
  }, [availableGames, providerFilter, statusFilter, customerFacingFilter, availableSearch])

  const toggleAvailable = (id: string) => {
    setSelectedAvailable((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllVisible = () => {
    setSelectedAvailable((prev) => {
      const next = new Set(prev)
      for (const g of filteredAvailable) next.add(g.id)
      return next
    })
  }

  const clearSelection = () => {
    setSelectedAvailable(new Set())
  }

  const addSelected = async () => {
    if (selectedAvailable.size === 0) return
    setWorking(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/admin/casino/sub-categories/${sectionId}/games`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ gameIds: Array.from(selectedAvailable) }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? 'add_failed')
        return
      }
      setNotice(`Added ${body.added} games (${body.skipped} skipped).`)
      setSelectedAvailable(new Set())
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown_error')
    } finally {
      setWorking(false)
    }
  }

  const addAllVisible = async () => {
    if (filteredAvailable.length === 0) return
    if (!window.confirm(`Add all ${filteredAvailable.length} visible games to "${sectionName}"?`)) {
      return
    }
    setWorking(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/admin/casino/sub-categories/${sectionId}/games`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ gameIds: filteredAvailable.map((g) => g.id) }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? 'add_failed')
        return
      }
      setNotice(`Added ${body.added} games (${body.skipped} skipped).`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown_error')
    } finally {
      setWorking(false)
    }
  }

  const bulkAddByProvider = async () => {
    if (providerFilter === 'all') return
    const provider = providers.find((p) => p.slug === providerFilter)
    if (!provider) return
    if (
      !window.confirm(
        `Add every game from ${provider.displayName} to "${sectionName}"? Games already in this section are skipped.`,
      )
    )
      return
    setWorking(true)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(
        `/api/admin/casino/sub-categories/${sectionId}/bulk-add-by-provider`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ providerId: provider.id }),
        },
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? 'bulk_add_failed')
        return
      }
      setNotice(`Added ${body.added} games from ${provider.displayName} (${body.skipped} skipped).`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown_error')
    } finally {
      setWorking(false)
    }
  }

  const removeGame = async (gameId: string) => {
    setWorking(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/casino/sub-categories/${sectionId}/games`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ gameId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'remove_failed')
        return
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown_error')
    } finally {
      setWorking(false)
    }
  }

  return (
    <>
      {error ? (
        <div className="rounded-md border border-critical/30 bg-critical/10 px-4 py-2 text-sm text-critical">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-md border border-positive/30 bg-positive/10 px-4 py-2 text-sm text-positive">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Added games — left pane */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="h-4 w-4 text-positive" />
              In this section ({addedGames.length})
            </CardTitle>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-ink-tertiary" />
              <input
                type="search"
                value={addedSearch}
                onChange={(e) => setAddedSearch(e.target.value)}
                placeholder="Filter…"
                className="h-8 w-44 rounded-md border border-line-subtle bg-surface pl-8 pr-2 text-xs text-ink-primary placeholder:text-ink-tertiary focus:border-line-default focus:outline-none"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filteredAdded.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-tertiary">
                {addedGames.length === 0
                  ? 'No games in this section yet. Add some from the right.'
                  : 'No games match the filter.'}
              </p>
            ) : (
              <ul className="divide-y divide-line-subtle">
                {filteredAdded.map((g) => (
                  <li
                    key={g.id}
                    className="flex items-center gap-3 bg-surface px-3 py-2 hover:bg-surface-hover"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink-primary">
                        {g.displayName}
                      </div>
                      <div className="truncate text-xs text-ink-tertiary">
                        {g.providerName}
                        {g.rtp ? ` · ${(Number(g.rtp) * 100).toFixed(1)}% RTP` : ''}
                      </div>
                    </div>
                    {g.status === 'active' ? (
                      <StatusPill status="active" />
                    ) : (
                      <StatusPill status="custom" color="neutral" label={g.status} />
                    )}
                    <button
                      type="button"
                      onClick={() => removeGame(g.id)}
                      disabled={working}
                      title="Remove from section"
                      className="inline-flex items-center gap-1 rounded-md border border-line-subtle bg-surface px-2 py-1 text-xs font-medium text-ink-secondary hover:bg-critical/15 hover:text-critical disabled:opacity-50"
                    >
                      <ArrowRight className="h-3 w-3" />
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Available games — right pane */}
        <Card>
          <CardHeader className="flex flex-col gap-2 pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-amber-500" />
                Available games ({filteredAvailable.length})
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addAllVisible}
                  disabled={working || filteredAvailable.length === 0}
                  title="Add every game matching current filters"
                >
                  Add all visible
                </Button>
                <Button
                  size="sm"
                  onClick={addSelected}
                  disabled={working || selectedAvailable.size === 0}
                >
                  <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                  Add {selectedAvailable.size}
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-ink-tertiary" />
                <input
                  type="search"
                  value={availableSearch}
                  onChange={(e) => setAvailableSearch(e.target.value)}
                  placeholder="Search games or providers…"
                  className="h-8 w-56 rounded-md border border-line-subtle bg-surface pl-8 pr-2 text-xs text-ink-primary placeholder:text-ink-tertiary focus:border-line-default focus:outline-none"
                />
              </div>
              <select
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value)}
                className="h-8 rounded-md border border-line-subtle bg-surface px-2 text-xs text-ink-primary focus:border-line-default focus:outline-none"
              >
                <option value="all">All providers</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.slug}>
                    {p.displayName}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
                className="h-8 rounded-md border border-line-subtle bg-surface px-2 text-xs text-ink-primary focus:border-line-default focus:outline-none"
              >
                <option value="all">All status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <select
                value={customerFacingFilter}
                onChange={(e) => setCustomerFacingFilter(e.target.value as 'all' | 'yes' | 'no')}
                className="h-8 rounded-md border border-line-subtle bg-surface px-2 text-xs text-ink-primary focus:border-line-default focus:outline-none"
              >
                <option value="all">Customer-facing?</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
              {providerFilter !== 'all' ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={bulkAddByProvider}
                  disabled={working}
                  title={`Add every game from ${providers.find((p) => p.slug === providerFilter)?.displayName ?? ''}`}
                >
                  Bulk add provider
                </Button>
              ) : null}
              <button
                type="button"
                onClick={selectAllVisible}
                disabled={filteredAvailable.length === 0}
                className="rounded-md border border-line-subtle bg-surface px-2 py-1 text-xs font-medium text-ink-secondary hover:bg-elevated hover:text-ink-primary disabled:opacity-50"
              >
                Select all visible
              </button>
              {selectedAvailable.size > 0 ? (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="rounded-md border border-line-subtle bg-surface px-2 py-1 text-xs font-medium text-ink-tertiary hover:text-ink-primary"
                >
                  Clear ({selectedAvailable.size})
                </button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {filteredAvailable.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-tertiary">
                No games match these filters, or all matching games are already in this section.
              </p>
            ) : (
              <ul className="divide-y divide-line-subtle max-h-[640px] overflow-y-auto">
                {filteredAvailable.slice(0, 500).map((g) => {
                  const isSelected = selectedAvailable.has(g.id)
                  return (
                    <li key={g.id}>
                      <label
                        className={
                          'flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors ' +
                          (isSelected ? 'bg-elevated' : 'hover:bg-surface-hover')
                        }
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleAvailable(g.id)}
                          className="h-4 w-4 accent-positive"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-ink-primary">
                            {g.displayName}
                          </div>
                          <div className="truncate text-xs text-ink-tertiary">
                            {g.providerName}
                            {g.rtp ? ` · ${(Number(g.rtp) * 100).toFixed(1)}% RTP` : ''}
                            {g.status !== 'active' ? ` · ${g.status}` : ''}
                            {!g.customerFacing ? ' · hidden' : ''}
                          </div>
                        </div>
                      </label>
                    </li>
                  )
                })}
                {filteredAvailable.length > 500 ? (
                  <li className="px-4 py-3 text-center text-xs text-ink-tertiary">
                    Showing first 500 of {filteredAvailable.length} matches. Narrow your filters to
                    see more.
                  </li>
                ) : null}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
