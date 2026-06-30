import * as React from 'react'

import { cn } from '../lib/utils'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md border border-line-default bg-base px-3 py-2 text-md text-ink-primary file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-ink-tertiary focus-visible:outline-none focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'
