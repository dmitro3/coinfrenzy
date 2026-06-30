'use client'

import { Download } from 'lucide-react'
import { useSearchParams } from 'next/navigation'

import { Button } from '@coinfrenzy/ui/primitives/button'

interface Props {
  /** Export endpoint base, e.g. /api/admin/transactions/purchases/export */
  href: string
  label?: string
}

/**
 * Drop-in "Export CSV" button used in every transactions list page. Mirrors
 * the current URL's search params to the export endpoint so the CSV always
 * reflects the same filters as the visible table.
 */
export function TransactionsExportButton({ href, label = 'Export CSV' }: Props) {
  const params = useSearchParams()
  const qs = params.toString()
  const fullHref = qs ? `${href}?${qs}` : href
  return (
    <a href={fullHref}>
      <Button size="sm" variant="outline" className="h-8">
        <Download className="mr-1.5 h-3.5 w-3.5" />
        {label}
      </Button>
    </a>
  )
}
