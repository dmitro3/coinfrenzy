'use client'

import type { ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'

export function MockVendorsShell({ children }: { children: ReactNode }) {
  const params = useSearchParams()
  const embedded = params?.get('embedded') === '1'

  if (embedded) {
    return (
      <div className="min-h-screen bg-transparent text-white">
        <div className="px-3 py-3 sm:px-4 sm:py-4">{children}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="bg-amber-500 text-amber-950 px-4 py-2 text-center text-sm font-medium">
        Mock vendor surface — no real vendor API is being called. Flip the corresponding{' '}
        <code className="font-mono">USE_MOCK_*</code> env var to{' '}
        <code className="font-mono">false</code> when going live.
      </div>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">{children}</div>
    </div>
  )
}
