'use client'

import { cn } from '@coinfrenzy/ui/lib/utils'

import { GOLD_BTN_GRADIENT } from './_constants'

interface PrimaryModalButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
  fullWidth?: boolean
}

export function PrimaryModalButton({
  children,
  className,
  fullWidth = true,
  disabled,
  type = 'button',
  ...props
}: PrimaryModalButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(
        'relative h-[40px] overflow-hidden rounded-lg border border-[#af8331] px-4 text-sm font-bold text-[#121212] transition-opacity disabled:cursor-not-allowed disabled:opacity-50',
        fullWidth && 'flex-1',
        className,
      )}
      style={{ background: GOLD_BTN_GRADIENT }}
      {...props}
    >
      <span className="relative z-10">{children}</span>
    </button>
  )
}

export function SecondaryModalButton({
  children,
  className,
  fullWidth = true,
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { fullWidth?: boolean }) {
  return (
    <button
      type={type}
      className={cn(
        'h-[40px] rounded-lg border border-white/10 bg-[#141414] text-sm font-bold text-white transition-all hover:bg-[#1A1A1A] disabled:cursor-not-allowed disabled:opacity-50',
        fullWidth && 'flex-1',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function OutlineModalButton({
  children,
  className,
  fullWidth = true,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { fullWidth?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'h-[40px] rounded-lg border border-white/25 bg-[#121212] text-sm font-medium text-white transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50',
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
