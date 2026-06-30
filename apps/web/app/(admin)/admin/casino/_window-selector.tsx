'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { OPTIONS, type WindowValue } from './_window-utils'

export type { WindowValue }

interface Props {
  value: WindowValue
  /** Query-string key. Defaults to `window`. */
  paramKey?: string
  className?: string
}

/**
 * URL-driven window selector. Updates `?window=` (or the configured key)
 * via Next.js router so the page can render on the new window without a
 * page reload's worth of state loss.
 */
export function WindowSelector({ value, paramKey = 'window', className }: Props) {
  const router = useRouter()
  const sp = useSearchParams()

  const onChange = (next: WindowValue) => {
    const params = new URLSearchParams(sp?.toString() ?? '')
    if (next === '30d') params.delete(paramKey)
    else params.set(paramKey, next)
    const qs = params.toString()
    router.push(qs ? `?${qs}` : '?', { scroll: false })
  }

  return (
    <div
      className={
        'inline-flex shrink-0 items-center gap-1 rounded-md border border-line-subtle bg-surface p-1 ' +
        (className ?? '')
      }
      role="tablist"
      aria-label="Time window"
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={
              'rounded px-2.5 py-1 text-xs font-medium transition-colors ' +
              (active
                ? 'bg-elevated text-ink-primary'
                : 'text-ink-tertiary hover:bg-surface-hover hover:text-ink-secondary')
            }
            aria-pressed={active}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
