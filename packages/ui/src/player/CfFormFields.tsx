'use client'

import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'

import { cn } from '../lib/utils'

// Password input with a built-in show/hide toggle — visible in every
// auth screenshot. Uses the same dark/gold input chrome as the rest of
// the Coin Frenzy form fields.

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  inputClassName?: string
}

export const CfPasswordInput = React.forwardRef<HTMLInputElement, Props>(function CfPasswordInput(
  { className, inputClassName, ...props },
  ref,
) {
  const [visible, setVisible] = React.useState(false)
  return (
    <div className={cn('relative', className)}>
      <input
        ref={ref}
        {...props}
        type={visible ? 'text' : 'password'}
        className={cn(
          'flex h-11 w-full rounded-md border border-[var(--cf-border-default)]',
          'bg-[var(--cf-bg-elevated)] px-3 pr-10 text-sm text-white placeholder:text-[var(--cf-gray-light)]',
          'focus:border-[var(--cf-gold-medium)] focus:outline-none focus:ring-2',
          'focus:ring-[var(--cf-gold-medium)] focus:ring-offset-0',
          inputClassName,
        )}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-2 grid w-7 place-items-center text-[var(--cf-gray-light)] hover:text-white"
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      </button>
    </div>
  )
})

// Plain text input variant with the same dark/gold chrome — used for
// email fields and the joining-code box on signup.
export const CfTextInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function CfTextInput({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      {...props}
      className={cn(
        'flex h-11 w-full rounded-md border border-[var(--cf-border-default)]',
        'bg-[var(--cf-bg-elevated)] px-3 text-sm text-white placeholder:text-[var(--cf-gray-light)]',
        'focus:border-[var(--cf-gold-medium)] focus:outline-none focus:ring-2',
        'focus:ring-[var(--cf-gold-medium)] focus:ring-offset-0',
        className,
      )}
    />
  )
})

interface CfLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  children: React.ReactNode
}

export function CfLabel({ className, children, ...rest }: CfLabelProps) {
  return (
    <label {...rest} className={cn('text-sm font-semibold text-white', className)}>
      {children}
    </label>
  )
}
