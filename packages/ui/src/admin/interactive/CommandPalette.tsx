'use client'

import * as React from 'react'
import { Command } from 'cmdk'
import { LogOut, Search } from 'lucide-react'

import { cn } from '../../lib/utils'
import { Dialog, DialogContent, DialogTitle } from '../../primitives/dialog'
import { type AdminRoleSlug, type NavLeaf, flattenNav, navForRole } from '../layout/nav-config'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  role: AdminRoleSlug | null
  /** Imperative navigation hook (Next.js: useRouter().push). */
  onNavigate: (href: string) => void
  onLogout?: () => void
}

export function CommandPalette({
  open,
  onOpenChange,
  role,
  onNavigate,
  onLogout,
}: CommandPaletteProps) {
  const leaves = React.useMemo<NavLeaf[]>(() => flattenNav(navForRole(role)), [role])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command
          className={cn(
            'flex flex-col rounded-lg bg-popover text-popover-foreground',
            '[&_[cmdk-input]]:flex [&_[cmdk-input]]:h-12 [&_[cmdk-input]]:w-full [&_[cmdk-input]]:bg-transparent [&_[cmdk-input]]:px-4 [&_[cmdk-input]]:text-sm [&_[cmdk-input]]:outline-none',
            '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground',
            '[&_[cmdk-item]]:flex [&_[cmdk-item]]:cursor-pointer [&_[cmdk-item]]:items-center [&_[cmdk-item]]:gap-2 [&_[cmdk-item]]:rounded-sm [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-2 [&_[cmdk-item]]:text-sm',
            '[&_[cmdk-item][data-selected=true]]:bg-accent [&_[cmdk-item][data-selected=true]]:text-accent-foreground',
            '[&_[cmdk-item][data-disabled=true]]:pointer-events-none [&_[cmdk-item][data-disabled=true]]:opacity-50',
          )}
        >
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 text-muted-foreground" />
            <Command.Input placeholder="Type to search admin pages, actions…" autoFocus />
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              esc
            </kbd>
          </div>
          <Command.List className="max-h-[60vh] overflow-y-auto p-1">
            <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
              No results found.
            </Command.Empty>

            <Command.Group heading="Navigation">
              {leaves.map((leaf) => {
                const Icon = leaf.icon
                return (
                  <Command.Item
                    key={leaf.href}
                    value={`nav ${leaf.label} ${leaf.href}`}
                    onSelect={() => {
                      onOpenChange(false)
                      onNavigate(leaf.href)
                    }}
                  >
                    {Icon ? <Icon className="h-4 w-4 text-muted-foreground" /> : null}
                    <span>{leaf.label}</span>
                    {leaf.shortcut ? (
                      <span className="ml-auto flex gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {leaf.shortcut.map((k) => (
                          <kbd key={k} className="rounded border bg-muted px-1 py-0.5">
                            {k}
                          </kbd>
                        ))}
                      </span>
                    ) : leaf.stub ? (
                      <span className="ml-auto rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                        soon
                      </span>
                    ) : null}
                  </Command.Item>
                )
              })}
            </Command.Group>

            {onLogout ? (
              <Command.Group heading="Session">
                <Command.Item
                  value="logout sign out"
                  onSelect={() => {
                    onOpenChange(false)
                    onLogout()
                  }}
                >
                  <LogOut className="h-4 w-4 text-muted-foreground" />
                  Sign out
                </Command.Item>
              </Command.Group>
            ) : null}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
