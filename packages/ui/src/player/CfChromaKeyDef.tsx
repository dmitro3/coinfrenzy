'use client'

import * as React from 'react'

// Coin Frenzy uses raw green-screen JPGs of the fox mascot until cut-out
// PNGs land from the brand team. This SVG filter is dropped once at the
// root of the player/marketing surface and lets any <img class="cf-chroma-key">
// instance knock out the bright green chroma at render time without
// touching the source files. The matrix is tuned for the specific shade
// of green Gemini produced; it leaves the fox's orange fur intact.
export function CfChromaKeyDef() {
  return (
    <svg
      aria-hidden="true"
      width="0"
      height="0"
      style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}
    >
      <defs>
        <filter id="cf-chroma-key" colorInterpolationFilters="sRGB">
          {/* Detect "is this pixel mostly green?". Multiply the green channel
              up, subtract the red and blue channels, then push everything
              above a threshold to fully opaque on green. */}
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0
                    0 0 0 0 0
                    0 0 0 0 0
                    -1 1 -1 0 0"
            result="greenness"
          />
          {/* Sharpen the mask so partial greens (anti-aliased edges) flip
              decisively to transparent without leaving a halo. */}
          <feComponentTransfer in="greenness" result="alpha">
            <feFuncA type="discrete" tableValues="0 0 0 0 1 1 1 1 1 1" />
          </feComponentTransfer>
          {/* Invert: green pixels become transparent, others keep alpha. */}
          <feComposite in="SourceGraphic" in2="alpha" operator="out" />
        </filter>
      </defs>
    </svg>
  )
}
