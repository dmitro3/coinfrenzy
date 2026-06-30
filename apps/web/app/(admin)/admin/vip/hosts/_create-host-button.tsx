'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus } from 'lucide-react'

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

// M4 — master-only create-host modal trigger.

export function CreateHostButton() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [form, setForm] = React.useState({
    displayName: '',
    email: '',
    tempPassword: '',
  })

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/host/create-host', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? `Request failed (${res.status})`)
      }
      setOpen(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus className="mr-2 h-4 w-4" />
        Add host
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a host</DialogTitle>
            <DialogDescription>
              The host will be able to log in at /admin/login and will only see their assigned VIPs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm">Display name</Label>
              <Input
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                placeholder="Jane Mitchell"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm">Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="jane@coinfrenzy.com"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm">Temporary password</Label>
              <Input
                value={form.tempPassword}
                onChange={(e) => setForm((f) => ({ ...f, tempPassword: e.target.value }))}
                placeholder="At least 12 characters"
                className="mt-1"
              />
              <p className="mt-1 text-xs text-ink-tertiary">
                Host will be required to change this on first login.
              </p>
            </div>
            {error ? (
              <p className="rounded-md bg-critical-bg px-3 py-2 text-xs text-critical">{error}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={
                submitting ||
                !form.displayName.trim() ||
                !form.email.trim() ||
                form.tempPassword.length < 12
              }
            >
              {submitting ? 'Creating…' : 'Create host'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
