import type { ReactNode } from 'react'
import { Suspense } from 'react'

import { MockVendorsShell } from './_shell'

// Mock-vendor surface. Every page under this layout is an in-app
// simulation of a third-party vendor experience (Finix Hosted Fields,
// Footprint onboarding popover, Alea iframe). The yellow banner makes
// the "Mock Mode" status unmistakable when the page is opened standalone
// — but when the Shop modal embeds the same page in an iframe (with
// `?embedded=1`) we suppress the banner and chrome so the player sees
// a clean inline checkout that visually belongs to CoinFrenzy.
//
// `useSearchParams` requires a Suspense boundary during static
// generation (Next 15) — we wrap the client shell here so the layout
// itself stays a server component and pages beneath still pre-render.

export default function MockVendorsLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<MockVendorsFallback>{children}</MockVendorsFallback>}>
      <MockVendorsShell>{children}</MockVendorsShell>
    </Suspense>
  )
}

function MockVendorsFallback({ children }: { children: ReactNode }) {
  // While the search-param hook bootstraps, render the standalone
  // (banner-on) variant. It's the safe default and only flashes for a
  // single frame in the embedded case.
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">{children}</div>
    </div>
  )
}
