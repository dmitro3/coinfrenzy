'use client'

import * as React from 'react'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'

import { cn } from '../lib/utils'

// Toast notification system used across the player surface. Self-
// contained — no new runtime dep — and styled to match the gold-on-
// black aesthetic of the rest of the site.
//
// Usage:
//   1. Mount `<ToastProvider>` once near the root of the player shell.
//   2. Inside any descendant client component, call `useToast()` and
//      invoke `success`, `error`, or `info` with a string.
// Behaviour:
//   - Auto-dismiss after `duration` ms (default 4000)
//   - Click-to-dismiss (and a small × button) so they're never sticky
//   - Stack top-right, newest on top
//   - Reduced-motion friendly (skips slide transitions)

export type ToastTone = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  tone: ToastTone
  message: string
  title?: string
  duration: number
}

interface ToastApi {
  success: (message: string, opts?: { title?: string; duration?: number }) => void
  error: (message: string, opts?: { title?: string; duration?: number }) => void
  info: (message: string, opts?: { title?: string; duration?: number }) => void
}

const ToastContext = React.createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = React.useContext(ToastContext)
  if (!ctx) {
    // Soft fallback so non-shell surfaces (or tests) don't crash.
    return {
      success: () => undefined,
      error: () => undefined,
      info: () => undefined,
    }
  }
  return ctx
}

let nextId = 1

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([])

  const dismiss = React.useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const push = React.useCallback(
    (tone: ToastTone, message: string, opts?: { title?: string; duration?: number }) => {
      const id = nextId++
      const duration = opts?.duration ?? 4000
      const item: ToastItem = { id, tone, message, title: opts?.title, duration }
      setItems((prev) => [item, ...prev.slice(0, 4)])
      if (duration > 0) {
        window.setTimeout(() => dismiss(id), duration)
      }
    },
    [dismiss],
  )

  const api = React.useMemo<ToastApi>(
    () => ({
      success: (m, o) => push('success', m, o),
      error: (m, o) => push('error', m, o),
      info: (m, o) => push('info', m, o),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

function ToastViewport({
  items,
  onDismiss,
}: {
  items: ToastItem[]
  onDismiss: (id: number) => void
}) {
  if (items.length === 0) return null
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed right-4 top-4 z-[80] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2 sm:right-6 sm:top-[72px]"
    >
      {items.map((item) => (
        <ToastCard key={item.id} item={item} onDismiss={() => onDismiss(item.id)} />
      ))}
    </div>
  )
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  // Tone-specific colours. Success uses the warm-gold palette so the
  // "Bonus successfully claimed" toast feels celebratory (matches the
  // live coinfrenzy.com gold toast).
  const tone =
    item.tone === 'success'
      ? {
          ring: 'border-[var(--cf-gold-medium)]/55 shadow-[0_18px_44px_-16px_rgba(245,208,102,0.45),inset_0_1px_0_rgba(255,245,200,0.10)]',
          bar: 'bg-gradient-to-r from-[var(--cf-gold-deep)] via-[var(--cf-gold-light)] to-[var(--cf-gold-deep)]',
          icon: <CheckCircle2 className="h-5 w-5 text-[var(--cf-gold-light)]" aria-hidden="true" />,
        }
      : item.tone === 'error'
        ? {
            ring: 'border-[var(--cf-red-primary)]/55 shadow-[0_18px_44px_-16px_rgba(248,68,68,0.45),inset_0_1px_0_rgba(255,255,255,0.05)]',
            bar: 'bg-gradient-to-r from-[var(--cf-red-dark)] via-[var(--cf-red-primary)] to-[var(--cf-red-dark)]',
            icon: <XCircle className="h-5 w-5 text-[var(--cf-red-primary)]" aria-hidden="true" />,
          }
        : {
            ring: 'border-[var(--cf-border-default)] shadow-[0_18px_44px_-16px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.05)]',
            bar: 'bg-gradient-to-r from-transparent via-[var(--cf-gold-light)]/40 to-transparent',
            icon: <Info className="h-5 w-5 text-[var(--cf-gold-light)]" aria-hidden="true" />,
          }

  return (
    <button
      type="button"
      role="status"
      onClick={onDismiss}
      className={cn(
        'cf-toast pointer-events-auto group relative overflow-hidden rounded-lg border bg-[var(--cf-bg-card)] text-left',
        'transition-transform duration-200 hover:-translate-y-0.5',
        tone.ring,
      )}
    >
      {/* Gold accent line at the top edge — same treatment as cf-account-card */}
      <span aria-hidden="true" className={cn('absolute inset-x-0 top-0 h-px', tone.bar)} />

      <div className="flex items-start gap-3 px-4 py-3.5 pr-10">
        <span className="mt-0.5 shrink-0">{tone.icon}</span>
        <div className="min-w-0 flex-1">
          {item.title ? (
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--cf-gold-light)]">
              {item.title}
            </div>
          ) : null}
          <div className="text-sm font-semibold leading-snug text-white">{item.message}</div>
        </div>
      </div>

      <span
        aria-hidden="true"
        className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded text-[var(--cf-gray-light)] opacity-0 transition-opacity duration-150 group-hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </span>
    </button>
  )
}
