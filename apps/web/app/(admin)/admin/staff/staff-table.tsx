'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal, UserPlus } from 'lucide-react'

import { DataTable } from '@coinfrenzy/ui/admin/data/DataTable'
import { Badge } from '@coinfrenzy/ui/primitives/badge'
import { Button } from '@coinfrenzy/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@coinfrenzy/ui/primitives/dialog'
import { Input } from '@coinfrenzy/ui/primitives/input'
import { Label } from '@coinfrenzy/ui/primitives/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@coinfrenzy/ui/primitives/dropdown-menu'

export interface StaffRow {
  id: string
  email: string
  displayName: string
  status: string
  totpEnabled: boolean
  lastLoginAt: string | null
  createdAt: string
  roles: string[]
}

interface StaffTableProps {
  rows: StaffRow[]
  canManage: boolean
}

const ROLES = [
  'support',
  'host',
  'kyc_reviewer',
  'cashier',
  'cashier_lead',
  'marketing',
  'game_ops',
  'manager',
  'master',
] as const

export function StaffTable({ rows, canManage }: StaffTableProps) {
  const router = useRouter()
  const [inviteOpen, setInviteOpen] = React.useState(false)
  const columns = React.useMemo<ColumnDef<StaffRow, unknown>[]>(
    () => [
      {
        id: 'email',
        accessorKey: 'email',
        header: 'Email',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.email}</span>,
      },
      {
        id: 'displayName',
        accessorKey: 'displayName',
        header: 'Name',
      },
      {
        id: 'roles',
        accessorFn: (row) => row.roles.join(','),
        header: 'Roles',
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.roles.map((r) => (
              <Badge key={r} variant="secondary" className="font-mono text-[10px]">
                {r}
              </Badge>
            ))}
            {row.original.roles.length === 0 ? (
              <span className="text-xs text-muted-foreground">(none)</span>
            ) : null}
          </div>
        ),
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'totpEnabled',
        accessorFn: (r) => (r.totpEnabled ? 'yes' : 'no'),
        header: '2FA',
        cell: ({ row }) =>
          row.original.totpEnabled ? (
            <Badge variant="success" className="text-[10px]">
              enabled
            </Badge>
          ) : (
            <Badge variant="warning" className="text-[10px]">
              pending
            </Badge>
          ),
      },
      {
        id: 'lastLoginAt',
        accessorKey: 'lastLoginAt',
        header: 'Last login',
        cell: ({ row }) =>
          row.original.lastLoginAt ? (
            <span className="font-mono text-xs">
              {new Date(row.original.lastLoginAt).toLocaleString()}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">never</span>
          ),
      },
      {
        id: 'createdAt',
        accessorKey: 'createdAt',
        header: 'Created',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {new Date(row.original.createdAt).toLocaleDateString()}
          </span>
        ),
      },
      ...(canManage
        ? ([
            {
              id: 'actions',
              header: '',
              cell: ({ row }) => (
                <StaffRowActions row={row.original} onChange={() => router.refresh()} />
              ),
            },
          ] as ColumnDef<StaffRow, unknown>[])
        : []),
    ],
    [canManage, router],
  )

  return (
    <div className="space-y-4">
      {canManage ? (
        <div className="flex justify-end">
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Invite staff
          </Button>
        </div>
      ) : null}
      <DataTable
        columns={columns}
        data={rows}
        scope="staff"
        defaultSort={[{ id: 'createdAt', desc: true }]}
        globalFilterPlaceholder="Search staff by email or name…"
        emptyMessage="No staff yet. Use Invite staff to add the first admin."
      />
      {canManage ? (
        <InviteDialog
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          onCreated={() => router.refresh()}
        />
      ) : null}
    </div>
  )
}

function StaffRowActions({ row, onChange }: { row: StaffRow; onChange: () => void }) {
  const [pending, setPending] = React.useState<string | null>(null)

  async function call(action: string, reason: string) {
    setPending(action)
    try {
      const res = await fetch(`/api/admin/staff/${row.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        window.alert(`Failed: ${body.error ?? `HTTP ${res.status}`}`)
        return
      }
      onChange()
    } finally {
      setPending(null)
    }
  }

  async function terminate() {
    const reason = window.prompt('Termination reason (10+ chars):')
    if (!reason || reason.trim().length < 10) {
      window.alert('A reason of at least 10 characters is required.')
      return
    }
    setPending('terminate')
    try {
      const res = await fetch(`/api/admin/staff/${row.id}?reason=${encodeURIComponent(reason)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        window.alert(`Failed: ${body.error ?? `HTTP ${res.status}`}`)
        return
      }
      onChange()
    } finally {
      setPending(null)
    }
  }

  async function setRole() {
    const role = window.prompt(`Role for ${row.email} (one of: ${ROLES.join(', ')})`)
    if (!role || !(ROLES as readonly string[]).includes(role)) {
      window.alert('Invalid role.')
      return
    }
    const reason = window.prompt('Reason (3+ chars):')
    if (!reason || reason.trim().length < 3) return
    setPending('set_role')
    try {
      const res = await fetch(`/api/admin/staff/${row.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'set_role', role, reason }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        window.alert(`Failed: ${body.error ?? `HTTP ${res.status}`}`)
        return
      }
      onChange()
    } finally {
      setPending(null)
    }
  }

  function ask(action: 'suspend' | 'reactivate' | 'force_password_reset' | 'force_2fa_reset') {
    const reason = window.prompt('Reason (3+ chars):')
    if (!reason || reason.trim().length < 3) return
    void call(action, reason)
  }

  if (row.status === 'terminated') {
    return <span className="text-xs text-muted-foreground">terminated</span>
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" disabled={pending !== null}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={setRole}>Set role…</DropdownMenuItem>
        <DropdownMenuSeparator />
        {row.status === 'active' ? (
          <DropdownMenuItem onSelect={() => ask('suspend')}>Suspend</DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => ask('reactivate')}>Reactivate</DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => ask('force_password_reset')}>
          Force password reset
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => ask('force_2fa_reset')}>Force 2FA reset</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={terminate} className="text-destructive">
          Terminate
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function InviteDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [email, setEmail] = React.useState('')
  const [displayName, setDisplayName] = React.useState('')
  const [role, setRole] = React.useState<(typeof ROLES)[number]>('support')
  const [submitting, setSubmitting] = React.useState(false)
  const [result, setResult] = React.useState<{
    tempPassword: string
    emailDispatched: string
  } | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setEmail('')
      setDisplayName('')
      setRole('support')
      setSubmitting(false)
      setResult(null)
      setError(null)
    }
  }, [open])

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/staff', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, displayName, role }),
      })
      const body = (await res.json().catch(() => ({}))) as {
        error?: string
        tempPassword?: string
        emailDispatched?: string
      }
      if (!res.ok) {
        setError(body.error ?? `HTTP ${res.status}`)
        setSubmitting(false)
        return
      }
      setResult({
        tempPassword: body.tempPassword!,
        emailDispatched: body.emailDispatched ?? 'skipped',
      })
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a new staff member</DialogTitle>
          <DialogDescription>
            Master-only. The invited admin receives a temp password and is forced to set a new
            password + enable 2FA on first login.
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="space-y-3">
            <p className="text-sm">
              <strong>Invitation created.</strong> Email dispatch: {result.emailDispatched}.
            </p>
            <div className="rounded border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Temporary password (shown once — copy now):
              <div className="mt-2 font-mono text-base">{result.tempPassword}</div>
            </div>
            <DialogFooter>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <div className="grid gap-1">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="newadmin@coinfrenzy.com"
                  autoFocus
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="invite-name">Display name</Label>
                <Input
                  id="invite-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Jane Smith"
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="invite-role">Role</Label>
                <select
                  id="invite-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
                  className="h-10 rounded-md border border-line-subtle bg-bg px-3 text-sm text-ink-primary"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {error ? (
              <div className="rounded border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}
            <DialogFooter>
              <Button variant="ghost" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={submitting || !email || !displayName || !role}>
                {submitting ? 'Creating…' : 'Send invitation'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'active') return <Badge variant="success">active</Badge>
  if (status === 'suspended') return <Badge variant="warning">suspended</Badge>
  if (status === 'terminated') return <Badge variant="destructive">terminated</Badge>
  return <Badge variant="outline">{status}</Badge>
}
