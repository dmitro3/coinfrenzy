import type { ReactNode } from 'react'

import { BodyCfSurface, CfChromaKeyDef } from '@coinfrenzy/ui/player'

// Coin Frenzy auth surface — every auth page (login, signup, reset,
// MFA, verify-email) renders inside a centered modal layered over a
// blurred dark-casino background per the live site. The `data-cf-surface`
// body attribute swaps shadcn primitives onto the brand palette.

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dark relative min-h-screen overflow-hidden bg-[var(--cf-bg-base)] text-white">
      <BodyCfSurface value="auth" />
      <CfChromaKeyDef />
      <AuthBackdrop />
      <main className="relative z-10 flex min-h-screen items-center justify-center px-4 py-12">
        {children}
      </main>
    </div>
  )
}

// Blurred lobby-style background: a tiled grid of dim portrait
// rectangles (mimicking game tiles) with a heavy dark overlay. Lets
// the modal feel like it's floating over the live game lobby just like
// the screenshots.
function AuthBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0"
      style={{
        backgroundColor: '#000',
        backgroundImage:
          'linear-gradient(rgba(0,0,0,0.85), rgba(0,0,0,0.85)), repeating-linear-gradient(90deg, rgba(204,153,51,0.08) 0, rgba(204,153,51,0.08) 90px, transparent 90px, transparent 110px), repeating-linear-gradient(0deg, rgba(127,16,21,0.08) 0, rgba(127,16,21,0.08) 130px, transparent 130px, transparent 160px)',
        filter: 'blur(2px)',
      }}
    />
  )
}
