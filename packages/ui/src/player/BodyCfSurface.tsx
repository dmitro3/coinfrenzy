'use client'

import * as React from 'react'

// Sets `body[data-cf-surface="<value>"]` for the duration the component
// is mounted, then cleans up on unmount. Lets a server layout opt the
// player/marketing/auth surface into the Coin Frenzy brand tokens
// without falling back to dangerouslySetInnerHTML.
export function BodyCfSurface({ value }: { value: string }) {
  React.useEffect(() => {
    const prev = document.body.dataset.cfSurface
    document.body.dataset.cfSurface = value
    return () => {
      if (prev === undefined) {
        delete document.body.dataset.cfSurface
      } else {
        document.body.dataset.cfSurface = prev
      }
    }
  }, [value])
  return null
}
