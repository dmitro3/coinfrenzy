'use client'

import { useHotkeys } from 'react-hotkeys-hook'

interface KeyboardShortcutsProps {
  onOpenCommandPalette: () => void
  onNavigate: (href: string) => void
}

/**
 * Global keyboard shortcuts per docs/08 §0 rule 7:
 *
 *   /           focus the top-bar search (handled inside AdminTopBar)
 *   cmd+k       open the command palette
 *   g p         go to Players
 *   g r         go to Redemptions (redeem requests)
 *   g d         go to Dashboard
 *
 * "g X" is implemented as a two-keystroke sequence via react-hotkeys-hook's
 * built-in sequence support.
 */
export function KeyboardShortcuts({ onOpenCommandPalette, onNavigate }: KeyboardShortcutsProps) {
  useHotkeys(
    'meta+k, ctrl+k',
    (e: KeyboardEvent) => {
      e.preventDefault()
      onOpenCommandPalette()
    },
    { enableOnFormTags: true },
  )

  useHotkeys('g>d', () => onNavigate('/admin'), { enableOnFormTags: false })
  useHotkeys('g>p', () => onNavigate('/admin/players'), { enableOnFormTags: false })
  useHotkeys('g>r', () => onNavigate('/admin/transactions/redeem-requests'), {
    enableOnFormTags: false,
  })
  useHotkeys('g>a', () => onNavigate('/admin/audit'), { enableOnFormTags: false })
  useHotkeys('g>s', () => onNavigate('/admin/staff'), { enableOnFormTags: false })

  return null
}
