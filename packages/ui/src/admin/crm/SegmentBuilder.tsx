'use client'

import * as React from 'react'
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  Search,
  X,
  Zap,
  Loader2,
} from 'lucide-react'

import { Button } from '../../primitives/button'
import { Input } from '../../primitives/input'
import { cn } from '../../lib/utils'

import { SamplePlayerPreview, type SamplePlayer } from './SamplePlayerPreview'
import { SmartSuggestions, type SmartSuggestion } from './SmartSuggestions'

// ---------------------------------------------------------------------------
// Public types — mirror packages/core/src/crm/filter-tree.ts
// ---------------------------------------------------------------------------

export type GroupOp = 'AND' | 'OR' | 'NOT'

export interface AttributeLeaf {
  type: 'attribute'
  attributeKey: string
  operator: string
  value?: unknown
  /** Stable id used for drag handle / keyboard navigation. */
  _id?: string
}

export interface FilterGroup {
  operator: GroupOp
  conditions: TreeNode[]
  _id?: string
}

export type TreeNode = FilterGroup | AttributeLeaf | { type: string; [k: string]: unknown }

interface AttributeMeta {
  key: string
  label: string
  category: string
  valueType:
    | 'number'
    | 'string'
    | 'date'
    | 'boolean'
    | 'enum'
    | 'game'
    | 'provider'
    | 'category'
    | 'tier'
  operators: string[]
  description: string | null
  expensive: boolean
  enumOptions: string[] | null
}

interface RegistryResponse {
  attributes: AttributeMeta[]
  categoryLabels: Record<string, string>
  categoryOrder: string[]
  operatorLabels: Record<string, string>
}

interface PickerOption {
  id: string
  displayName: string
}

interface SegmentBuilderProps {
  initialTree?: FilterGroup
  /** Fired on every tree change. Parent owns persistence. */
  onChange?: (tree: FilterGroup) => void
  /** When true, sidebar is hidden (used inline in modals where space is tight). */
  hideSidebar?: boolean
  /** Optional caption shown above the builder. */
  title?: string
  className?: string
}

// ---------------------------------------------------------------------------
// Top-level component
// ---------------------------------------------------------------------------

export function SegmentBuilder({
  initialTree,
  onChange,
  hideSidebar = false,
  title,
  className,
}: SegmentBuilderProps) {
  const [tree, setTreeRaw] = React.useState<FilterGroup>(
    () => initialTree ?? { operator: 'AND', conditions: [] },
  )
  const [registry, setRegistry] = React.useState<RegistryResponse | null>(null)
  const [count, setCount] = React.useState<number | null>(null)
  const [countLoading, setCountLoading] = React.useState(false)
  const [samples, setSamples] = React.useState<SamplePlayer[]>([])
  const [samplesLoading, setSamplesLoading] = React.useState(false)
  const [insights, setInsights] = React.useState<SmartSuggestion[]>([])
  const [insightsLoading, setInsightsLoading] = React.useState(false)

  function setTree(next: FilterGroup) {
    setTreeRaw(next)
    onChange?.(next)
  }

  React.useEffect(() => {
    fetch('/api/admin/crm/attributes')
      .then((r) => r.json() as Promise<RegistryResponse>)
      .then(setRegistry)
      .catch(() => setRegistry(null))
  }, [])

  // Debounced live preview side-effect.
  React.useEffect(() => {
    let cancelled = false
    const handle = window.setTimeout(async () => {
      setCountLoading(true)
      setSamplesLoading(true)
      setInsightsLoading(true)
      try {
        const [countRes, sampleRes, insightsRes] = await Promise.all([
          fetch('/api/admin/crm/segments/count', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ filterTree: tree }),
          }),
          fetch('/api/admin/crm/segments/preview', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ filterTree: tree, limit: 5 }),
          }),
          fetch('/api/admin/crm/segments/insights', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ filterTree: tree }),
          }),
        ])
        if (cancelled) return
        if (countRes.ok) {
          const json = (await countRes.json()) as { count: number }
          setCount(json.count)
        }
        if (sampleRes.ok) {
          const json = (await sampleRes.json()) as { players: SamplePlayer[] }
          setSamples(json.players ?? [])
        }
        if (insightsRes.ok) {
          const json = (await insightsRes.json()) as { insights: SmartSuggestion[] }
          setInsights(json.insights ?? [])
        }
      } finally {
        if (!cancelled) {
          setCountLoading(false)
          setSamplesLoading(false)
          setInsightsLoading(false)
        }
      }
    }, 400)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [tree])

  return (
    <div className={cn('grid gap-6 lg:grid-cols-[1fr_320px]', className)}>
      <div className="min-w-0">
        {title ? <h2 className="mb-3 text-sm font-semibold text-ink-primary">{title}</h2> : null}
        <GroupView
          group={tree}
          registry={registry}
          isRoot
          onChange={(next) => setTree(next as FilterGroup)}
        />
      </div>

      {!hideSidebar ? (
        <aside className="space-y-3">
          <CountTile count={count} loading={countLoading} />
          <SamplePlayerPreview players={samples} loading={samplesLoading} />
          <SmartSuggestions suggestions={insights} loading={insightsLoading} />
        </aside>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Count tile — the killer feature: live audience size update
// ---------------------------------------------------------------------------

function CountTile({ count, loading }: { count: number | null; loading: boolean }) {
  return (
    <div className="rounded-lg border border-line-subtle bg-surface p-4">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-violet-400" />
        <span className="text-xs font-medium text-ink-secondary">Audience size</span>
        {loading ? <Loader2 className="ml-auto h-3 w-3 animate-spin text-ink-tertiary" /> : null}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums text-ink-primary">
          {count !== null ? count.toLocaleString() : '—'}
        </span>
        <span className="text-xs text-ink-tertiary">players match</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// GroupView — renders a logic group (AND/OR/NOT) with nested children
// ---------------------------------------------------------------------------

function GroupView({
  group,
  registry,
  isRoot,
  onChange,
  onRemove,
  depth = 0,
}: {
  group: FilterGroup
  registry: RegistryResponse | null
  isRoot?: boolean
  onChange: (next: FilterGroup) => void
  onRemove?: () => void
  depth?: number
}) {
  function setOperator(op: GroupOp) {
    onChange({ ...group, operator: op })
  }

  function addLeaf() {
    const first = registry?.attributes[0]
    if (!first) return
    const newLeaf: AttributeLeaf = {
      type: 'attribute',
      attributeKey: first.key,
      operator: first.operators[0] ?? '=',
      value: defaultValueFor(first),
    }
    onChange({ ...group, conditions: [...group.conditions, newLeaf as TreeNode] })
  }

  function addGroup() {
    const newGroup: FilterGroup = { operator: 'AND', conditions: [] }
    onChange({ ...group, conditions: [...group.conditions, newGroup as TreeNode] })
  }

  function updateChild(idx: number, next: TreeNode) {
    const copy = group.conditions.slice()
    copy[idx] = next
    onChange({ ...group, conditions: copy })
  }

  function removeChild(idx: number) {
    onChange({ ...group, conditions: group.conditions.filter((_, i) => i !== idx) })
  }

  return (
    <div
      className={cn(
        'space-y-2 rounded-lg border bg-elevated/30',
        isRoot ? 'border-line-subtle p-4' : 'border-violet-500/20 p-3',
      )}
      style={depth > 0 ? { marginLeft: 0 } : undefined}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs text-ink-tertiary">{isRoot ? 'Match' : 'Subgroup —'}</span>
        <OperatorChip op={group.operator} onChange={setOperator} />
        <span className="text-xs text-ink-tertiary">of the following</span>
        {!isRoot && onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="ml-auto text-ink-tertiary transition-colors hover:text-rose-400"
            aria-label="Remove group"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="space-y-2">
        {group.conditions.length === 0 ? (
          <div className="rounded-md border border-dashed border-line-subtle bg-surface px-3 py-4 text-center text-xs text-ink-tertiary">
            Add a condition to start defining the audience.
          </div>
        ) : null}
        {group.conditions.map((child, idx) => {
          if (isGroupNode(child)) {
            return (
              <GroupView
                key={(child as FilterGroup)._id ?? idx}
                group={child as FilterGroup}
                registry={registry}
                onChange={(next) => updateChild(idx, next as TreeNode)}
                onRemove={() => removeChild(idx)}
                depth={depth + 1}
              />
            )
          }
          if (isAttributeLeaf(child)) {
            return (
              <ConditionRow
                key={(child as AttributeLeaf)._id ?? idx}
                leaf={child as AttributeLeaf}
                registry={registry}
                onChange={(next) => updateChild(idx, next as TreeNode)}
                onRemove={() => removeChild(idx)}
              />
            )
          }
          // Legacy leaf type — render read-only summary.
          return (
            <div
              key={idx}
              className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-surface px-3 py-2 text-xs text-amber-400"
            >
              <span>
                Legacy condition (type: {String(child.type)}) — open in raw editor to edit
              </span>
              <button
                type="button"
                onClick={() => removeChild(idx)}
                className="ml-auto text-ink-tertiary hover:text-rose-400"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-line-subtle pt-2">
        <Button type="button" size="sm" variant="outline" onClick={addLeaf}>
          <Plus className="mr-1 h-3 w-3" />
          Add condition
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={addGroup}>
          <Plus className="mr-1 h-3 w-3" />
          Add subgroup
        </Button>
      </div>
    </div>
  )
}

function OperatorChip({ op, onChange }: { op: GroupOp; onChange: (next: GroupOp) => void }) {
  const opts: GroupOp[] = ['AND', 'OR', 'NOT']
  return (
    <div className="inline-flex items-center rounded-md border border-line-subtle bg-surface p-0.5 text-[11px] font-medium">
      {opts.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={cn(
            'rounded px-2 py-0.5 transition-colors',
            o === op ? 'bg-violet-500 text-white' : 'text-ink-tertiary hover:text-ink-primary',
          )}
        >
          {o === 'AND' ? 'ALL' : o === 'OR' ? 'ANY' : 'NONE'}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ConditionRow — attribute picker + operator + value
// ---------------------------------------------------------------------------

function ConditionRow({
  leaf,
  registry,
  onChange,
  onRemove,
}: {
  leaf: AttributeLeaf
  registry: RegistryResponse | null
  onChange: (next: AttributeLeaf) => void
  onRemove: () => void
}) {
  const attr = registry?.attributes.find((a) => a.key === leaf.attributeKey) ?? null
  const operatorOptions = attr?.operators ?? ['=']

  function pickAttribute(next: AttributeMeta) {
    const newOperator = next.operators[0] ?? '='
    onChange({
      ...leaf,
      attributeKey: next.key,
      operator: newOperator,
      value: defaultValueFor(next),
    })
  }

  function setOperator(op: string) {
    onChange({ ...leaf, operator: op })
  }

  function setValue(v: unknown) {
    onChange({ ...leaf, value: v })
  }

  return (
    <div className="group flex items-center gap-2 rounded-md border border-line-subtle bg-surface px-3 py-2">
      <GripVertical className="h-3.5 w-3.5 cursor-grab text-ink-tertiary opacity-0 transition-opacity group-hover:opacity-60" />

      <AttributePicker registry={registry} currentKey={leaf.attributeKey} onPick={pickAttribute} />

      <select
        value={leaf.operator}
        onChange={(e) => setOperator(e.target.value)}
        className="h-8 rounded-md border border-line-subtle bg-elevated px-2 text-xs text-ink-primary"
      >
        {operatorOptions.map((op) => (
          <option key={op} value={op}>
            {registry?.operatorLabels?.[op] ?? op}
          </option>
        ))}
      </select>

      <ValueInput
        attribute={attr}
        operator={leaf.operator}
        value={leaf.value}
        onChange={setValue}
      />

      <button
        type="button"
        onClick={onRemove}
        className="ml-auto text-ink-tertiary transition-colors hover:text-rose-400"
        aria-label="Remove condition"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AttributePicker — searchable dropdown grouped by category
// ---------------------------------------------------------------------------

function AttributePicker({
  registry,
  currentKey,
  onPick,
}: {
  registry: RegistryResponse | null
  currentKey: string
  onPick: (next: AttributeMeta) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const current = registry?.attributes.find((a) => a.key === currentKey)
  const filtered = React.useMemo(() => {
    if (!registry) return []
    const f = search.trim().toLowerCase()
    if (!f) return registry.attributes
    return registry.attributes.filter(
      (a) => a.key.toLowerCase().includes(f) || a.label.toLowerCase().includes(f),
    )
  }, [registry, search])

  const grouped = React.useMemo(() => {
    if (!registry) return [] as Array<[string, AttributeMeta[]]>
    const out = new Map<string, AttributeMeta[]>()
    for (const a of filtered) {
      const list = out.get(a.category) ?? []
      list.push(a)
      out.set(a.category, list)
    }
    return registry.categoryOrder
      .map((cat): [string, AttributeMeta[]] => [cat, out.get(cat) ?? []])
      .filter(([, items]) => items.length > 0)
  }, [filtered, registry])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 min-w-[180px] items-center gap-1 rounded-md border border-line-subtle bg-elevated px-2 text-xs text-ink-primary transition-colors hover:bg-surface-hover"
      >
        <span className="truncate">{current?.label ?? currentKey}</span>
        {open ? (
          <ChevronDown className="ml-auto h-3 w-3 opacity-60" />
        ) : (
          <ChevronRight className="ml-auto h-3 w-3 opacity-60" />
        )}
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-80 rounded-lg border border-line-subtle bg-surface shadow-lg">
          <div className="relative border-b border-line-subtle p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search attributes…"
              className="h-8 pl-7 text-xs"
              autoFocus
            />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {grouped.map(([cat, items]) => (
              <div key={cat} className="py-1">
                <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-ink-tertiary">
                  {registry?.categoryLabels?.[cat] ?? cat}
                </div>
                {items.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => {
                      onPick(a)
                      setOpen(false)
                      setSearch('')
                    }}
                    className={cn(
                      'flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-surface-hover',
                      a.key === currentKey && 'bg-violet-500/10 text-violet-300',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-ink-primary">{a.label}</div>
                      {a.description ? (
                        <div className="truncate text-[10px] text-ink-tertiary">
                          {a.description}
                        </div>
                      ) : null}
                    </div>
                    {a.expensive ? (
                      <span className="ml-1 rounded bg-amber-500/10 px-1 text-[9px] text-amber-400">
                        slow
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ))}
            {grouped.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-ink-tertiary">
                {registry ? 'No matches' : 'Loading attributes…'}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ValueInput — switches its concrete control based on attribute valueType
// ---------------------------------------------------------------------------

function ValueInput({
  attribute,
  operator,
  value,
  onChange,
}: {
  attribute: AttributeMeta | null
  operator: string
  value: unknown
  onChange: (v: unknown) => void
}) {
  if (!attribute) return <span className="text-xs text-ink-tertiary">—</span>

  // Operators that don't take a value
  if (operator === 'is_set' || operator === 'is_not_set') return null
  if (
    operator === 'is_true' &&
    attribute.valueType !== 'game' &&
    attribute.valueType !== 'provider' &&
    attribute.valueType !== 'category'
  )
    return null
  if (
    operator === 'is_false' &&
    attribute.valueType !== 'game' &&
    attribute.valueType !== 'provider' &&
    attribute.valueType !== 'category'
  )
    return null

  if (attribute.valueType === 'number' && operator === 'between') {
    const arr = (Array.isArray(value) ? (value as Array<string | number>) : ['', '']).slice(0, 2)
    return (
      <div className="flex items-center gap-1">
        <Input
          type="number"
          value={String(arr[0] ?? '')}
          onChange={(e) =>
            onChange([e.target.value === '' ? '' : Number(e.target.value), arr[1] ?? ''])
          }
          placeholder="min"
          className="h-8 w-24 text-xs"
        />
        <span className="text-[10px] text-ink-tertiary">to</span>
        <Input
          type="number"
          value={String(arr[1] ?? '')}
          onChange={(e) =>
            onChange([arr[0] ?? '', e.target.value === '' ? '' : Number(e.target.value)])
          }
          placeholder="max"
          className="h-8 w-24 text-xs"
        />
      </div>
    )
  }

  if (attribute.valueType === 'number') {
    return (
      <Input
        type="number"
        value={value === null || value === undefined ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        placeholder="value"
        className="h-8 w-32 text-xs"
      />
    )
  }

  if (attribute.valueType === 'date') {
    if (operator === 'in_last_n_days' || operator === 'more_than_n_days_ago') {
      return (
        <Input
          type="number"
          value={value === null || value === undefined ? '' : String(value)}
          onChange={(e) => onChange(Number(e.target.value))}
          placeholder="days"
          className="h-8 w-24 text-xs"
        />
      )
    }
    return (
      <Input
        type="datetime-local"
        value={value ? String(value).slice(0, 16) : ''}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-44 text-xs"
      />
    )
  }

  if (attribute.valueType === 'enum' && (operator === 'in_list' || operator === 'not_in_list')) {
    const arr = Array.isArray(value) ? (value as string[]) : []
    return <MultiPickEnum options={attribute.enumOptions ?? []} values={arr} onChange={onChange} />
  }

  if (attribute.valueType === 'enum') {
    const opts = attribute.enumOptions ?? []
    return (
      <select
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-md border border-line-subtle bg-elevated px-2 text-xs text-ink-primary"
      >
        <option value="">choose…</option>
        {opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    )
  }

  if (attribute.valueType === 'category') {
    return (
      <select
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-md border border-line-subtle bg-elevated px-2 text-xs text-ink-primary"
      >
        <option value="">choose…</option>
        {(attribute.enumOptions ?? ['slots', 'table', 'live', 'instant', 'crash']).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    )
  }

  if (attribute.valueType === 'game') {
    return (
      <RemotePicker
        endpoint="/api/admin/crm/games"
        value={value as string | null}
        onChange={onChange}
        placeholder="search game…"
      />
    )
  }

  if (attribute.valueType === 'provider') {
    return (
      <RemotePicker
        endpoint="/api/admin/crm/providers"
        value={value as string | null}
        onChange={onChange}
        placeholder="choose provider…"
      />
    )
  }

  if (attribute.valueType === 'tier') {
    return (
      <select
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-md border border-line-subtle bg-elevated px-2 text-xs text-ink-primary"
      >
        <option value="">choose…</option>
        {['bronze', 'silver', 'gold', 'platinum', 'diamond', 'legendary'].map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    )
  }

  if (attribute.valueType === 'string' && (operator === 'in_list' || operator === 'not_in_list')) {
    const csv = Array.isArray(value) ? (value as string[]).join(', ') : ''
    return (
      <Input
        value={csv}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
        placeholder="a, b, c"
        className="h-8 w-56 text-xs"
      />
    )
  }

  return (
    <Input
      value={value === null || value === undefined ? '' : String(value)}
      onChange={(e) => onChange(e.target.value)}
      placeholder="value"
      className="h-8 w-44 text-xs"
    />
  )
}

function MultiPickEnum({
  options,
  values,
  onChange,
}: {
  options: string[]
  values: string[]
  onChange: (v: string[]) => void
}) {
  function toggle(v: string) {
    if (values.includes(v)) onChange(values.filter((x) => x !== v))
    else onChange([...values, v])
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => toggle(o)}
          className={cn(
            'rounded-md border px-2 py-0.5 text-[10px]',
            values.includes(o)
              ? 'border-violet-500/40 bg-violet-500/10 text-violet-300'
              : 'border-line-subtle text-ink-tertiary hover:text-ink-primary',
          )}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

function RemotePicker({
  endpoint,
  value,
  onChange,
  placeholder,
}: {
  endpoint: string
  value: string | null
  onChange: (v: string | null) => void
  placeholder: string
}) {
  const [open, setOpen] = React.useState(false)
  const [q, setQ] = React.useState('')
  const [items, setItems] = React.useState<PickerOption[]>([])
  const [loaded, setLoaded] = React.useState(false)
  const [resolvedLabel, setResolvedLabel] = React.useState<string | null>(null)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  React.useEffect(() => {
    if (!open) return
    const url = new URL(endpoint, window.location.origin)
    if (q.trim().length > 0) url.searchParams.set('q', q.trim())
    fetch(url.toString())
      .then((r) => r.json())
      .then((j: { games?: PickerOption[]; providers?: PickerOption[] }) => {
        setItems((j.games ?? j.providers ?? []) as PickerOption[])
        setLoaded(true)
      })
      .catch(() => setItems([]))
  }, [open, q, endpoint])

  React.useEffect(() => {
    if (!value || resolvedLabel) return
    const found = items.find((i) => i.id === value)
    if (found) setResolvedLabel(found.displayName)
  }, [value, items, resolvedLabel])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 min-w-[180px] items-center gap-1 rounded-md border border-line-subtle bg-elevated px-2 text-xs text-ink-primary"
      >
        <span className="truncate">{value ? (resolvedLabel ?? value) : placeholder}</span>
        <ChevronDown className="ml-auto h-3 w-3 opacity-60" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded-lg border border-line-subtle bg-surface shadow-lg">
          <div className="relative border-b border-line-subtle p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Type to search…"
              className="h-8 pl-7 text-xs"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {!loaded ? (
              <div className="px-3 py-4 text-center text-xs text-ink-tertiary">Loading…</div>
            ) : items.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-ink-tertiary">No matches</div>
            ) : (
              items.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => {
                    onChange(i.id)
                    setResolvedLabel(i.displayName)
                    setOpen(false)
                    setQ('')
                  }}
                  className={cn(
                    'block w-full px-3 py-1.5 text-left text-xs text-ink-primary hover:bg-surface-hover',
                    value === i.id && 'bg-violet-500/10 text-violet-300',
                  )}
                >
                  {i.displayName}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isGroupNode(n: TreeNode): n is FilterGroup {
  return (
    n !== null &&
    typeof n === 'object' &&
    'operator' in (n as object) &&
    'conditions' in (n as object)
  )
}

function isAttributeLeaf(n: TreeNode): n is AttributeLeaf {
  return n !== null && typeof n === 'object' && (n as { type?: string }).type === 'attribute'
}

function defaultValueFor(a: AttributeMeta): unknown {
  switch (a.valueType) {
    case 'number':
      return 0
    case 'boolean':
      return true
    case 'date':
      return new Date().toISOString().slice(0, 16)
    case 'enum':
    case 'category':
    case 'tier':
      return a.enumOptions?.[0] ?? ''
    case 'game':
    case 'provider':
      return null
    default:
      return ''
  }
}
