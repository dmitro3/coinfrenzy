'use client'

import * as React from 'react'
import {
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Search,
} from 'lucide-react'

import { cn } from '../../lib/utils'
import { Button } from '../../primitives/button'
import { Input } from '../../primitives/input'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../primitives/dropdown-menu'

import { downloadCsv, rowsToCsv } from './csv'

export type DataTableSavedView = {
  id: string
  name: string
  filterConfig: {
    sorting?: SortingState
    filters?: ColumnFiltersState
    visibility?: VisibilityState
  }
  isShared?: boolean
}

export interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[]
  data: T[]

  /** Identifies this table for `admin_saved_views.scope` (docs/08 §15, §5.3). */
  scope: string

  /** Initial sort applied if no saved view is loaded. */
  defaultSort?: SortingState

  /** Free-text search across all columns. Set to false to suppress the search box. */
  globalFilterPlaceholder?: string | false

  /** Saved-view list to render in the picker. */
  savedViews?: DataTableSavedView[]
  onSaveView?: (view: Omit<DataTableSavedView, 'id'>) => void

  /**
   * Pagination strategy.
   *  - 'virtualized' (default) renders all rows and virtualizes the DOM
   *  - 'paginated' shows classic page buttons + rows-per-page picker
   */
  pagination?: 'virtualized' | 'paginated'
  /** Initial page size when `pagination='paginated'`. */
  pageSize?: number

  /** Show the CSV export button. */
  exportEnabled?: boolean

  /** Show the column-visibility menu. */
  columnsMenuEnabled?: boolean

  /** Compact row height. Useful for power users. */
  density?: 'comfortable' | 'compact'

  /** Element rendered when there are zero rows (overrides emptyMessage). */
  emptyContent?: React.ReactNode
  /** Empty-state message when emptyContent is not provided. */
  emptyMessage?: string

  /** Visible row count for skeleton-loading placeholders. */
  loading?: boolean

  /** Optional click handler — fires with the row's original data. */
  onRowClick?: (row: T) => void

  /** Suppress the toolbar entirely (search/columns/export). */
  hideToolbar?: boolean

  className?: string
}

/**
 * Stripe/Linear-quality data table — the centerpiece of the admin surface
 * (docs/08 §5.3, docs/10 §5.3). Built on TanStack Table v8.
 *
 * Visual rules:
 *  - Header is text-xs, sentence case, ink-tertiary (no uppercase block)
 *  - Row separator is a single subtle border between rows; no left/right borders
 *  - Hover lifts to surface-hover; no shifting, no border accent
 *  - Numbers right-aligned with tabular numerals (set on the column)
 */
export function DataTable<T>({
  columns,
  data,
  scope: _scope,
  defaultSort = [],
  globalFilterPlaceholder = 'Search…',
  savedViews,
  onSaveView,
  pagination = 'virtualized',
  pageSize = 25,
  exportEnabled = true,
  columnsMenuEnabled = true,
  density = 'comfortable',
  emptyContent,
  emptyMessage = 'No rows.',
  loading = false,
  onRowClick,
  hideToolbar = false,
  className,
}: DataTableProps<T>) {
  const [sorting, setSorting] = React.useState<SortingState>(defaultSort)
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [globalFilter, setGlobalFilter] = React.useState('')
  const [paginationState, setPaginationState] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  })

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter,
      ...(pagination === 'paginated' ? { pagination: paginationState } : {}),
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: pagination === 'paginated' ? setPaginationState : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: pagination === 'paginated' ? getPaginationRowModel() : undefined,
    globalFilterFn: 'includesString',
  })

  const rows = table.getRowModel().rows
  const allFilteredRows = table.getFilteredRowModel().rows
  const totalRowCount = data.length

  function handleExport() {
    const visibleCols = table
      .getVisibleFlatColumns()
      .filter((c) => c.id !== 'select' && c.id !== 'actions')
      .map((c) => ({
        id: c.id,
        header: typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id,
        accessor: (row: T) => {
          const ctx = { getValue: () => (row as Record<string, unknown>)[c.id] }
          const accessor = (c.columnDef as { accessorFn?: (row: T, i: number) => unknown })
            .accessorFn
          if (typeof accessor === 'function') return accessor(row, 0)
          return ctx.getValue()
        },
      }))
    const csv = rowsToCsv(
      allFilteredRows.map((r) => r.original),
      visibleCols,
    )
    downloadCsv(`${_scope}-${new Date().toISOString().slice(0, 10)}.csv`, csv)
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {!hideToolbar ? (
        <div className="flex flex-wrap items-center gap-2">
          {globalFilterPlaceholder !== false ? (
            <div className="relative w-72 max-w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
              <Input
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder={globalFilterPlaceholder}
                className="h-9 border-line-subtle bg-surface pl-9 text-sm placeholder:text-ink-tertiary"
              />
            </div>
          ) : null}

          {savedViews && savedViews.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9">
                  <Filter className="mr-1.5 h-3.5 w-3.5" />
                  Saved views
                  <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Saved views</DropdownMenuLabel>
                {savedViews.map((v) => (
                  <DropdownMenuCheckboxItem
                    key={v.id}
                    checked={false}
                    onCheckedChange={() => {
                      setSorting(v.filterConfig.sorting ?? [])
                      setColumnFilters(v.filterConfig.filters ?? [])
                      setColumnVisibility(v.filterConfig.visibility ?? {})
                    }}
                  >
                    {v.name}
                  </DropdownMenuCheckboxItem>
                ))}
                {onSaveView ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem
                      checked={false}
                      onCheckedChange={() => {
                        const name = window.prompt('Name this view')
                        if (!name) return
                        onSaveView({
                          name,
                          filterConfig: {
                            sorting,
                            filters: columnFilters,
                            visibility: columnVisibility,
                          },
                        })
                      }}
                    >
                      Save current view…
                    </DropdownMenuCheckboxItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          {columnsMenuEnabled ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9">
                  Columns
                  <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                {table
                  .getAllLeafColumns()
                  .filter((c) => c.getCanHide())
                  .map((c) => (
                    <DropdownMenuCheckboxItem
                      key={c.id}
                      checked={c.getIsVisible()}
                      onCheckedChange={(checked) => c.toggleVisibility(!!checked)}
                      className="capitalize"
                    >
                      {String(c.columnDef.header ?? c.id)}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          {exportEnabled ? (
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={handleExport}
                disabled={allFilteredRows.length === 0}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Export CSV
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {pagination === 'virtualized' ? (
        <VirtualizedTable
          table={table}
          rows={rows}
          density={density}
          emptyContent={emptyContent}
          emptyMessage={emptyMessage}
          loading={loading}
          onRowClick={onRowClick}
        />
      ) : (
        <PaginatedTable
          table={table}
          rows={rows}
          density={density}
          emptyContent={emptyContent}
          emptyMessage={emptyMessage}
          loading={loading}
          onRowClick={onRowClick}
        />
      )}

      {pagination === 'paginated' ? (
        <PaginationFooter
          table={table}
          totalRowCount={totalRowCount}
          filteredRowCount={allFilteredRows.length}
        />
      ) : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Internal table renderers                                                   */
/* -------------------------------------------------------------------------- */

interface InnerTableProps<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table row generic from TanStack
  table: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ditto
  rows: any[]
  density: 'comfortable' | 'compact'
  emptyContent?: React.ReactNode
  emptyMessage: string
  loading: boolean
  onRowClick?: (row: T) => void
}

function VirtualizedTable<T>({
  table,
  rows,
  density,
  emptyContent,
  emptyMessage,
  loading,
  onRowClick,
}: InnerTableProps<T>) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const rowHeight = density === 'compact' ? 32 : 48

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  })

  const virtualRows = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()
  const paddingTop = virtualRows.length > 0 ? (virtualRows[0]?.start ?? 0) : 0
  const paddingBottom =
    virtualRows.length > 0 ? totalSize - (virtualRows[virtualRows.length - 1]?.end ?? 0) : 0

  return (
    <div
      ref={containerRef}
      className="relative max-h-[68vh] overflow-auto rounded-lg border border-line-subtle bg-surface"
      style={{ contain: 'strict' }}
    >
      <table className="w-full caption-bottom">
        <TableHead table={table} />
        <tbody>
          {loading ? (
            <SkeletonRows
              columnCount={table.getAllColumns().length}
              rowCount={8}
              density={density}
            />
          ) : rows.length === 0 ? (
            <EmptyRow
              colSpan={table.getAllColumns().length}
              content={emptyContent}
              message={emptyMessage}
            />
          ) : (
            <>
              {paddingTop > 0 ? (
                <tr>
                  <td style={{ height: paddingTop }} colSpan={table.getAllColumns().length} />
                </tr>
              ) : null}
              {virtualRows.map((vRow) => {
                const row = rows[vRow.index]
                return (
                  <DataRow
                    key={row.id}
                    row={row}
                    density={density}
                    onClick={onRowClick}
                    measureRef={(node) => {
                      if (node) virtualizer.measureElement(node)
                    }}
                    rowHeight={rowHeight}
                  />
                )
              })}
              {paddingBottom > 0 ? (
                <tr>
                  <td style={{ height: paddingBottom }} colSpan={table.getAllColumns().length} />
                </tr>
              ) : null}
            </>
          )}
        </tbody>
      </table>
    </div>
  )
}

function PaginatedTable<T>({
  table,
  rows,
  density,
  emptyContent,
  emptyMessage,
  loading,
  onRowClick,
}: InnerTableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line-subtle bg-surface">
      <table className="w-full caption-bottom">
        <TableHead table={table} />
        <tbody>
          {loading ? (
            <SkeletonRows
              columnCount={table.getAllColumns().length}
              rowCount={8}
              density={density}
            />
          ) : rows.length === 0 ? (
            <EmptyRow
              colSpan={table.getAllColumns().length}
              content={emptyContent}
              message={emptyMessage}
            />
          ) : (
            rows.map((row) => (
              <DataRow key={row.id} row={row} density={density} onClick={onRowClick} />
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

/* eslint-disable @typescript-eslint/no-explicit-any -- TanStack table internals are generic */
function TableHead({ table }: { table: any }) {
  return (
    <thead className="sticky top-0 z-10 bg-surface">
      {table.getHeaderGroups().map((hg: any) => (
        <tr key={hg.id} className="border-b border-line-subtle">
          {hg.headers.map((h: any) => {
            const canSort = h.column.getCanSort()
            const dir = h.column.getIsSorted()
            const align = (h.column.columnDef.meta as { align?: 'left' | 'right' } | undefined)
              ?.align
            return (
              <th
                key={h.id}
                className={cn(
                  'h-10 px-4 align-middle text-xs font-medium text-ink-tertiary',
                  align === 'right' ? 'text-right' : 'text-left',
                  canSort && 'cursor-pointer select-none hover:text-ink-secondary',
                )}
                onClick={canSort ? h.column.getToggleSortingHandler() : undefined}
                style={{ letterSpacing: '0.02em' }}
              >
                {h.isPlaceholder ? null : (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1',
                      align === 'right' && 'flex-row-reverse',
                    )}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {canSort ? (
                      dir === 'asc' ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : dir === 'desc' ? (
                        <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-30" />
                      )
                    ) : null}
                  </span>
                )}
              </th>
            )
          })}
        </tr>
      ))}
    </thead>
  )
}

function DataRow<T>({
  row,
  density,
  onClick,
  measureRef,
  rowHeight,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TanStack row
  row: any
  density: 'comfortable' | 'compact'
  onClick?: (row: T) => void
  measureRef?: (node: HTMLTableRowElement | null) => void
  rowHeight?: number
}) {
  return (
    <tr
      ref={measureRef}
      data-index={row.index}
      style={rowHeight ? { height: rowHeight } : undefined}
      className={cn(
        'border-b border-line-subtle transition-colors last:border-b-0 hover:bg-surface-hover',
        onClick && 'cursor-pointer',
      )}
      onClick={onClick ? () => onClick(row.original) : undefined}
    >
      {row.getVisibleCells().map((cell: any) => {
        const align = (cell.column.columnDef.meta as { align?: 'left' | 'right' } | undefined)
          ?.align
        return (
          <td
            key={cell.id}
            className={cn(
              'px-4 align-middle text-ink-primary',
              density === 'compact' ? 'py-1.5 text-xs' : 'py-3.5 text-sm',
              align === 'right' && 'text-right tabular-nums',
            )}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        )
      })}
    </tr>
  )
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function SkeletonRows({
  columnCount,
  rowCount,
  density,
}: {
  columnCount: number
  rowCount: number
  density: 'comfortable' | 'compact'
}) {
  return (
    <>
      {Array.from({ length: rowCount }).map((_, i) => (
        <tr key={i} className="border-b border-line-subtle last:border-b-0">
          {Array.from({ length: columnCount }).map((__, j) => (
            <td key={j} className={cn('px-4', density === 'compact' ? 'py-2' : 'py-3.5')}>
              <span
                className="block h-4 w-full max-w-[140px] animate-pulse-soft rounded-sm bg-elevated"
                style={{ width: `${40 + ((i + j) % 4) * 15}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

function EmptyRow({
  colSpan,
  content,
  message,
}: {
  colSpan: number
  content?: React.ReactNode
  message: string
}) {
  return (
    <tr>
      <td className="px-4 py-12 text-center" colSpan={colSpan}>
        {content ?? <span className="text-sm text-ink-tertiary">{message}</span>}
      </td>
    </tr>
  )
}

function PaginationFooter({
  table,
  totalRowCount,
  filteredRowCount,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TanStack table
  table: any
  totalRowCount: number
  filteredRowCount: number
}) {
  const pageIndex = table.getState().pagination.pageIndex as number
  const pageSize = table.getState().pagination.pageSize as number
  const pageCount = table.getPageCount() as number
  const start = filteredRowCount === 0 ? 0 : pageIndex * pageSize + 1
  const end = Math.min((pageIndex + 1) * pageSize, filteredRowCount)
  const filtered = filteredRowCount !== totalRowCount

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-sm text-ink-tertiary">
      <div>
        Showing <span className="text-ink-secondary">{start.toLocaleString()}</span>–
        <span className="text-ink-secondary">{end.toLocaleString()}</span> of{' '}
        <span className="text-ink-secondary">{filteredRowCount.toLocaleString()}</span>
        {filtered ? (
          <span className="ml-1 text-ink-tertiary">
            (filtered from {totalRowCount.toLocaleString()})
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor={`pagesize-${table.options.meta?.scope ?? 'tbl'}`}>Rows per page</label>
          <select
            id={`pagesize-${table.options.meta?.scope ?? 'tbl'}`}
            className="h-7 rounded-md border border-line-subtle bg-surface px-2 text-sm text-ink-primary focus:outline-none focus:ring-2 focus:ring-brand"
            value={pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
          >
            {[10, 25, 50, 100].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink-primary disabled:cursor-not-allowed disabled:opacity-30"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-2 text-ink-secondary">
            Page {pageIndex + 1} of {Math.max(pageCount, 1)}
          </span>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink-primary disabled:cursor-not-allowed disabled:opacity-30"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
