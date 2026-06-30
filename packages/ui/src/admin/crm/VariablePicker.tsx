'use client'

import * as React from 'react'
import { Variable, ChevronDown, Search } from 'lucide-react'

import { Button } from '../../primitives/button'
import { Input } from '../../primitives/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '../../primitives/dropdown-menu'
import { cn } from '../../lib/utils'

export interface VariablePickerVariable {
  key: string
  label: string
  category: string
  example: string
}

interface VariablePickerProps {
  variables: VariablePickerVariable[]
  onPick: (key: string) => void
  buttonLabel?: string
  className?: string
}

/**
 * Compact picker that lists every available template variable,
 * grouped by category, with a search box. Clicking a row inserts
 * `{{ key }}` into the host editor via the `onPick` callback.
 */
export function VariablePicker({
  variables,
  onPick,
  buttonLabel = 'Insert variable',
  className,
}: VariablePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [filter, setFilter] = React.useState('')

  const filtered = React.useMemo(() => {
    const f = filter.trim().toLowerCase()
    if (!f) return variables
    return variables.filter(
      (v) => v.key.toLowerCase().includes(f) || v.label.toLowerCase().includes(f),
    )
  }, [variables, filter])

  const grouped = React.useMemo(() => {
    const out = new Map<string, VariablePickerVariable[]>()
    for (const v of filtered) {
      const list = out.get(v.category) ?? []
      list.push(v)
      out.set(v.category, list)
    }
    return [...out.entries()]
  }, [filtered])

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className={cn('h-8', className)}>
          <Variable className="mr-1.5 h-3.5 w-3.5" />
          {buttonLabel}
          <ChevronDown className="ml-1 h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80 p-0">
        <div className="relative border-b border-line-subtle p-2">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search variables…"
            className="h-8 pl-7 text-xs"
            autoFocus
          />
        </div>
        <div className="max-h-80 overflow-y-auto py-1">
          {grouped.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-ink-tertiary">No matches</div>
          ) : (
            grouped.map(([cat, items]) => (
              <div key={cat} className="py-1">
                <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-ink-tertiary">
                  {cat}
                </div>
                {items.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => {
                      onPick(v.key)
                      setOpen(false)
                      setFilter('')
                    }}
                    className="flex w-full items-start gap-2 px-3 py-1.5 text-left transition-colors hover:bg-surface-hover"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-ink-primary">{v.label}</div>
                      <div className="truncate font-mono text-[11px] text-ink-tertiary">
                        {`{{${v.key}}}`}
                      </div>
                    </div>
                    <div className="text-[10px] text-ink-tertiary">{v.example}</div>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
