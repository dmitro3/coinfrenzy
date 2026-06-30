'use client'

import * as React from 'react'

interface GameFrameProps {
  src: string
  title: string
}

// Wraps the Alea (or any provider) iframe inside the immersive game
// shell. Responsibilities:
//   - fill its flex-1 parent so it stretches between the top bar and
//     the GameImmersiveFooter — no fixed aspect-ratio, since real
//     casino providers handle their own letterboxing inside the
//     iframe
//   - hold the gold iframe-skeleton until the iframe announces
//     `onLoad` (Alea's bootstrap occasionally finishes a beat after
//     the navigation, which otherwise reads as a black square)
//   - softly fade the iframe in once it's ready — the "skeleton →
//     playable game" hand-off documented in docs/ux-polish-audit.md
//   - keep the iframe sandboxed; postMessage from the iframe is not
//     used today (Alea posts events server-side via webhook) but the
//     wrapper makes it easy to add later

export function GameFrame({ src, title }: GameFrameProps) {
  const [loaded, setLoaded] = React.useState(false)
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
      {!loaded ? <div className="cf-iframe-skeleton absolute inset-0" aria-hidden="true" /> : null}
      <iframe
        src={src}
        title={title}
        onLoad={() => setLoaded(true)}
        className="absolute inset-0 block h-full w-full"
        referrerPolicy="origin"
        style={{
          opacity: loaded ? 1 : 0,
          transition: 'opacity 240ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        allow="autoplay; fullscreen"
      />
    </div>
  )
}
