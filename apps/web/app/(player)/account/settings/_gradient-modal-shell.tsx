'use client'

import * as React from 'react'
import { X } from 'lucide-react'

import { cn } from '@coinfrenzy/ui/lib/utils'

import { GRADIENT_BORDER } from './_constants'

interface GradientModalShellProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  /** sm = compact dialog (username/email). lg = verification stepper (700px). */
  size?: 'sm' | 'lg'
  className?: string
  /** Extra classes on the inner dark panel */
  innerClassName?: string
}

export function GradientModalShell({
  open,
  onClose,
  children,
  size = 'sm',
  className,
  innerClassName,
}: GradientModalShellProps) {
  React.useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  const widthClass =
    size === 'lg'
      ? 'sm:w-[700px] sm:rounded-[24px] rounded-t-[32px]'
      : 'sm:w-[420px] sm:rounded-[16px] rounded-t-[24px]'

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'fixed inset-x-0 bottom-0 m-auto w-full max-w-full max-h-[100dvh] p-px shadow-2xl overflow-hidden flex flex-col sm:relative sm:bottom-auto',
          widthClass,
          className,
        )}
        style={{ background: GRADIENT_BORDER }}
      >
        <div
          className={cn(
            'relative flex flex-col flex-1 min-h-0 max-h-full overflow-hidden bg-[#0A0A0A] shadow-inner',
            size === 'lg'
              ? 'rounded-t-[31px] sm:rounded-[23px] p-3 sm:p-6 pb-12'
              : 'rounded-t-[23px] sm:rounded-[15px] p-5 sm:p-6',
            innerClassName,
          )}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 z-50 cursor-pointer text-xl text-white/40 transition-colors hover:text-white"
          >
            <X className="size-6" />
          </button>
          {children}
        </div>
      </div>
    </div>
  )
}
