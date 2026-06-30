'use client'

import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import { Download } from 'lucide-react'

import { Button } from '@coinfrenzy/ui/primitives/button'

/**
 * Tiny shared "Export CSV" link button for admin list pages.
 *
 * Appends the current page's URL search params (filters, sort, etc.) to the
 * supplied export endpoint, so the user downloads exactly the view they're
 * looking at. The endpoint is responsible for honoring those params via
 * `exportCsvResponse` (apps/web/lib/report-csv.ts).
 *
 * Keep this component dumb on purpose — no fetching, no dialog, no state.
 * It is the leaf affordance every page reuses.
 */
export interface ExportCsvButtonProps {
  /** Server endpoint (typically `/api/admin/.../export`). */
  href: string
  /** Button label. Defaults to "Export CSV". */
  label?: string
  /** Tailwind variant of the underlying Button. */
  variant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
  /** Extra params to append beyond the current URL params. */
  extraParams?: Record<string, string | undefined>
  /** Render an icon-only compact button (no label). */
  iconOnly?: boolean
}

export function ExportCsvButton({
  href,
  label = 'Export CSV',
  variant = 'outline',
  size = 'sm',
  extraParams,
  iconOnly = false,
}: ExportCsvButtonProps) {
  const params = useSearchParams()
  const merged = new URLSearchParams(params.toString())
  if (extraParams) {
    for (const [k, v] of Object.entries(extraParams)) {
      if (v !== undefined) merged.set(k, v)
    }
  }
  const qs = merged.toString()
  const fullHref = qs ? `${href}?${qs}` : href
  return (
    <a href={fullHref} aria-label={label}>
      <Button variant={variant} size={size} className="h-9">
        <Download className={iconOnly ? 'h-3.5 w-3.5' : 'mr-1.5 h-3.5 w-3.5'} />
        {iconOnly ? null : label}
      </Button>
    </a>
  )
}
