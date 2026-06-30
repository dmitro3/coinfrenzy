'use client'

import * as React from 'react'
import { LogOut, ShieldCheck, User as UserIcon } from 'lucide-react'

import { cn } from '../../lib/utils'
import { Avatar, AvatarFallback } from '../../primitives/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../primitives/dropdown-menu'

interface AdminUserMenuProps {
  email: string
  displayName: string
  role: string
  onLogout: () => void
  className?: string
}

export function AdminUserMenu({
  email,
  displayName,
  role,
  onLogout,
  className,
}: AdminUserMenuProps) {
  const initials = displayName
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-2 rounded-md p-1 transition-colors hover:bg-surface-hover',
            className,
          )}
        >
          <Avatar className="h-8 w-8 border border-line-subtle">
            <AvatarFallback className="bg-elevated text-sm font-medium text-ink-secondary">
              {initials || '?'}
            </AvatarFallback>
          </Avatar>
          <div className="hidden text-left lg:block">
            <div className="text-sm font-medium text-ink-primary">{displayName}</div>
            <div className="text-xs text-ink-tertiary">{role}</div>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-ink-primary">{displayName}</span>
            <span className="truncate text-xs font-normal text-ink-tertiary">{email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <UserIcon className="mr-2 h-4 w-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem>
          <ShieldCheck className="mr-2 h-4 w-4" />
          Security
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onLogout} className="text-critical focus:text-critical">
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
