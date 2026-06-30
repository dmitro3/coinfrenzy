'use client'

import * as React from 'react'
import { Check, X } from 'lucide-react'

import { cn } from '../lib/utils'

// Toast notification system used across the player surface. Styled to
// match the legacy coinfrenzy.com snackbars: dark card, tone icon on the
// left, dismiss × on the right, animated progress bar along the bottom.

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
      const duration = opts?.duration ?? 5000
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
      className="pointer-events-none fixed right-4 top-4 z-[80] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2 sm:right-6 sm:top-6"
    >
      {items.map((item) => (
        <ToastCard key={item.id} item={item} onDismiss={() => onDismiss(item.id)} />
      ))}
    </div>
  )
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const tone =
    item.tone === 'success'
      ? {
          ring: 'border-[var(--cf-gold-medium)]/35',
          bar: 'bg-gradient-to-r from-[var(--cf-gold-deep)] via-[var(--cf-gold-light)] to-[var(--cf-gold-deep)]',
          icon: (
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--cf-gold-light)]"
            >
              <Check className="h-4 w-4 text-[#1a1300]" strokeWidth={3} />
            </span>
          ),
        }
      : item.tone === 'error'
        ? {
            ring: 'border-[var(--cf-red-primary)]/45',
            bar: 'bg-gradient-to-r from-[var(--cf-red-dark)] via-[var(--cf-red-primary)] to-[var(--cf-red-dark)]',
            icon: (
              <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--cf-red-primary)]"
              >
                <span className="text-sm font-bold leading-none text-white">!</span>
              </span>
            ),
          }
        : {
            ring: 'border-[var(--cf-border-default)]',
            bar: 'bg-gradient-to-r from-transparent via-[var(--cf-gold-light)]/50 to-transparent',
            icon: (
              <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--cf-gold-medium)] text-[var(--cf-gold-light)]"
              >
                <span className="text-sm font-bold leading-none">i</span>
              </span>
            ),
          }

  return (
    <div
      role="status"
      className={cn(
        'cf-toast pointer-events-auto relative overflow-hidden rounded-lg border bg-[#141414]',
        'shadow-[0_16px_40px_-12px_rgba(0,0,0,0.75)]',
        tone.ring,
      )}
      style={{ ['--toast-duration' as string]: `${item.duration}ms` }}
    >
      <div className="flex items-center gap-3 py-3.5 pl-4 pr-10">
        {tone.icon}
        <div className="min-w-0 flex-1">
          {item.title ? (
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--cf-gold-light)]">
              {item.title}
            </div>
          ) : null}
          <p className="text-sm font-medium leading-snug text-white">{item.message}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--cf-gray-light)] transition-colors hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>

      <div aria-hidden="true" className="h-[3px] w-full bg-black/50">
        <div className={cn('cf-toast-progress h-full w-full', tone.bar)} />
      </div>
    </div>
  )
}
