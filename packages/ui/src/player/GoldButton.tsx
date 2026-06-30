'use client'

import * as React from 'react'
import Link from 'next/link'

import { cn } from '../lib/utils'

// Primary CTA on the player + marketing surface. Renders the signature
// vertical metallic gold gradient defined in globals.css as the button
// face, with darkened gradient stops on :hover and :active states.
// Sizes map roughly to the screenshot's "Login" / "Sign Up" buttons
// (md) and the larger "BUY NOW" CTAs on the Shop tiles (lg).

type Variant = 'gold' | 'gold-horizontal' | 'gold-outline' | 'dark'
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

const horizontalClasses =
  'cf-gold-gradient-horizontal h-11 px-4 rounded-lg !text-[#121212] text-base font-bold normal-case tracking-normal'

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
  const isHorizontal = variant === 'gold-horizontal'

  return cn(
    'inline-flex items-center justify-center gap-2',
    !isHorizontal && 'font-semibold tracking-wide uppercase',
    'transition-all duration-150 focus-visible:outline-none focus-visible:ring-2',
    'focus-visible:ring-[var(--cf-gold-light)] focus-visible:ring-offset-2',
    'focus-visible:ring-offset-[var(--cf-bg-base)] disabled:opacity-50',
    'disabled:cursor-not-allowed select-none',
    !isHorizontal && 'rounded-md',
    !isHorizontal && sizeClasses[size],
    variant === 'gold' && 'cf-gold-gradient text-[#1a1a1a] shadow-md',
    isHorizontal && horizontalClasses,
    variant === 'gold-outline' &&
      'cf-gold-border bg-[var(--cf-bg-elevated)] text-[var(--cf-gold-light)] hover:bg-[var(--cf-bg-card-hover)]',
    variant === 'dark' &&
      'border border-[var(--cf-border-default)] bg-[var(--cf-bg-elevated)] text-white hover:bg-[var(--cf-bg-card-hover)]',
    fullWidth && 'w-full',
    className,
  )
}

function wrapContent(variant: Variant | undefined, children: React.ReactNode) {
  if (variant === 'gold-horizontal') {
    return <span className="relative z-10 !text-[#121212]">{children}</span>
  }
  return children
}

export function GoldButton(props: ButtonProps | LinkProps) {
  const { variant, size, fullWidth, className, children } = props as CommonProps
  const cls = baseClass({ variant, size, fullWidth, className })
  const content = wrapContent(variant, children)

  if ('href' in props && props.href) {
    return (
      <Link href={props.href} target={props.target} rel={props.rel} className={cls}>
        {content}
      </Link>
    )
  }

  const { variant: _v, size: _s, fullWidth: _f, className: _c, ...rest } = props as ButtonProps
  return (
    <button type={rest.type ?? 'button'} {...rest} className={cls}>
      {content}
    </button>
  )
}
