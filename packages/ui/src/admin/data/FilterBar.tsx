'use client'

import * as React from 'react'
import { ChevronDown, Search, X } from 'lucide-react'

import { cn } from '../../lib/utils'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../primitives/dropdown-menu'
import { Input } from '../../primitives/input'

export interface FilterBarSearch {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export interface FilterDropdownOption {
  value: string
  label: string
}

export interface FilterDropdown {
  key: string
  label: string
  value: string
  onChange: (value: string) => void
  options: FilterDropdownOption[]
  /** Optional separator after this option (e.g. divider before "Blocked States"). */
  separators?: number[]
}

export interface QuickFilter {
  label: string
  value: string
  active?: boolean
  onClick?: () => void
}

interface FilterBarProps {
  search?: FilterBarSearch
  filters?: FilterDropdown[]
  quickFilters?: QuickFilter[]
  /** Total before filtering — used for "X of Y" copy. */
  totalCount?: number
  /** Count after filters applied. */
  filteredCount?: number
  /** Singular noun for count text (e.g. "player"). Plural is auto-generated. */
  countNoun?: string
  /** Reset action shown when any filter is non-default. */
  onReset?: () => void
  className?: string
}

/**
 * Chip-based filter bar for list views. Sits above tables; reads URL state
 * via the parent's controlled value/onChange pairs.
 */
export function FilterBar({
  search,
  filters,
  quickFilters,
  totalCount,
  filteredCount,
  countNoun,
  onReset,
  className,
}: FilterBarProps) {
  const showCount = totalCount != null
  const filtered = filteredCount != null && totalCount != null && filteredCount !== totalCount

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {search ? (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
          <Input
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder ?? 'Search…'}
            className="h-10 border-line-subtle bg-surface pl-10 text-md placeholder:text-ink-tertiary focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand"
          />
          {search.value ? (
            <button
              type="button"
              onClick={() => search.onChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-ink-tertiary hover:bg-surface-hover hover:text-ink-secondary"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {quickFilters && quickFilters.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {quickFilters.map((qf) => (
              <button
                key={qf.value}
                type="button"
                onClick={qf.onClick}
                className={cn(
                  'inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors',
                  qf.active
                    ? 'border border-line-default bg-elevated text-ink-primary'
                    : 'border border-transparent text-ink-secondary hover:bg-surface-hover hover:text-ink-primary',
                )}
              >
                {qf.label}
              </button>
            ))}
          </div>
        ) : null}

        {filters && filters.length > 0 ? (
          <div
            className={cn(
              'flex flex-wrap items-center gap-1.5',
              quickFilters && quickFilters.length > 0 && 'border-l border-line-subtle pl-3',
            )}
          >
            {filters.map((f) => (
              <FilterDropdownTrigger key={f.key} filter={f} />
            ))}
          </div>
        ) : null}

        <div className="ml-auto flex items-center gap-3">
          {onReset && filtered ? (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm text-ink-secondary hover:bg-surface-hover hover:text-ink-primary"
            >
              <X className="h-3.5 w-3.5" />
              Reset
            </button>
          ) : null}
          {showCount ? (
            <span className="text-sm tabular-nums text-ink-tertiary">
              {filtered ? (
                <>
                  <span className="text-ink-secondary">{filteredCount?.toLocaleString()}</span> of{' '}
                  {totalCount?.toLocaleString()}
                </>
              ) : (
                <span>{totalCount?.toLocaleString()}</span>
              )}{' '}
              {countNounLabel(countNoun, totalCount ?? 0)}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function FilterDropdownTrigger({ filter }: { filter: FilterDropdown }) {
  const selected = filter.options.find((o) => o.value === filter.value)
  const isDefault = !selected || filter.options[0]?.value === filter.value
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors',
            isDefault
              ? 'border-line-subtle bg-surface text-ink-secondary hover:border-line-default hover:text-ink-primary'
              : 'border-line-default bg-elevated text-ink-primary',
          )}
        >
          <span className="text-ink-tertiary">{filter.label}:</span>
          <span>{selected?.label ?? 'All'}</span>
          <ChevronDown className="h-3.5 w-3.5 text-ink-tertiary" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
        <DropdownMenuLabel>{filter.label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {filter.options.map((opt, idx) => (
          <React.Fragment key={opt.value}>
            <DropdownMenuCheckboxItem
              checked={filter.value === opt.value}
              onCheckedChange={(checked) => {
                if (checked) filter.onChange(opt.value)
              }}
            >
              {opt.label}
            </DropdownMenuCheckboxItem>
            {filter.separators?.includes(idx) ? <DropdownMenuSeparator /> : null}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function countNounLabel(noun: string | undefined, count: number): string {
  if (!noun) return ''
  return count === 1 ? noun : noun.endsWith('s') ? noun : `${noun}s`
}
