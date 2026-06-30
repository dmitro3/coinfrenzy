'use client'

import * as React from 'react'
import { Check, Copy } from 'lucide-react'

export function CopyButtonClient({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label="Copy"
      className="grid h-7 w-7 place-items-center rounded-md text-[var(--cf-gray-light)] hover:bg-[var(--cf-bg-card-hover)] hover:text-white"
    >
      {copied ? (
        <Check className="h-4 w-4 text-[var(--cf-green-bright)]" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </button>
  )
}
