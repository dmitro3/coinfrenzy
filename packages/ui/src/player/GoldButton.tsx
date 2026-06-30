'use client'

import * as React from 'react'
import Link from 'next/link'

import { cn } from '../lib/utils'

// Primary CTA on the player + marketing surface. Renders the signature
// vertical metallic gold gradient defined in globals.css as the button
// face, with darkened gradient stops on :hover and :active states.
// Sizes map roughly to the screenshot's "Login" / "Sign Up" buttons
// (md) and the larger "BUY NOW" CTAs on the Shop tiles (lg).

type Variant = 'gold' | 'gold-outline' | 'dark'
type Size = 'sm' | 'md' | 'lg'

interface CommonProps {
  variant?: Variant
  size?: Size
  fullWidth?: boolean
  className?: string
  children: React.ReactNode
}

type ButtonProps = CommonProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'> & {
    href?: undefined
  }

type LinkProps = CommonProps & {
  href: string
  target?: string
  rel?: string
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-[12px]',
  md: 'h-10 px-5 text-sm',
  lg: 'h-12 px-6 text-base',
}

function baseClass({
  variant = 'gold',
  size = 'md',
  fullWidth,
  className,
}: {
  variant?: Variant
  size?: Size
  fullWidth?: boolean
  className?: string
}) {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-md font-semibold tracking-wide uppercase',
    'transition-all duration-150 focus-visible:outline-none focus-visible:ring-2',
    'focus-visible:ring-[var(--cf-gold-light)] focus-visible:ring-offset-2',
    'focus-visible:ring-offset-[var(--cf-bg-base)] disabled:opacity-50',
    'disabled:cursor-not-allowed select-none',
    sizeClasses[size],
    variant === 'gold' && 'cf-gold-gradient text-[#1a1a1a] shadow-md',
    variant === 'gold-outline' &&
      'cf-gold-border bg-[var(--cf-bg-elevated)] text-[var(--cf-gold-light)] hover:bg-[var(--cf-bg-card-hover)]',
    variant === 'dark' &&
      'border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] text-white hover:bg-[var(--cf-bg-card-hover)]',
    fullWidth && 'w-full',
    className,
  )
}

export function GoldButton(props: ButtonProps | LinkProps) {
  const { variant, size, fullWidth, className, children } = props as CommonProps
  const cls = baseClass({ variant, size, fullWidth, className })

  if ('href' in props && props.href) {
    return (
      <Link href={props.href} target={props.target} rel={props.rel} className={cls}>
        {children}
      </Link>
    )
  }

  const { variant: _v, size: _s, fullWidth: _f, className: _c, ...rest } = props as ButtonProps
  return (
    <button type={rest.type ?? 'button'} {...rest} className={cls}>
      {children}
    </button>
  )
}
