'use client'

import * as React from 'react'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { CfLabel, CfTextInput, useToast } from '@coinfrenzy/ui/player'

import { checkUsernameApi } from '@/features/auth/services/auth-service'

import { GradientModalShell } from './_gradient-modal-shell'
import { PrimaryModalButton, SecondaryModalButton } from './_modal-buttons'

type AvailabilityState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

interface ChangeUsernameModalProps {
  open: boolean
  onClose: () => void
  currentUsername: string
}

export function ChangeUsernameModal({ open, onClose, currentUsername }: ChangeUsernameModalProps) {
  const router = useRouter()
  const toast = useToast()
  const [username, setUsername] = React.useState('')
  const [availability, setAvailability] = React.useState<AvailabilityState>('idle')
  const [availabilityMsg, setAvailabilityMsg] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const abortRef = React.useRef<AbortController | null>(null)
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    if (!open) {
      setUsername('')
      setAvailability('idle')
      setAvailabilityMsg(null)
      setError(null)
      setSubmitting(false)
    }
  }, [open])

  function validateUsername(value: string): string | null {
    if (value.length < 5 || value.length > 20) {
      return 'Username must be 5–20 characters.'
    }
    if (!/^[A-Za-z0-9_]+$/.test(value)) {
      return 'Only letters, numbers, and underscores are allowed.'
    }
    if (!/[a-z]/.test(value)) {
      return 'Include at least one lowercase letter.'
    }
    return null
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    setUsername(value)
    setError(null)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (abortRef.current) abortRef.current.abort()

    if (!value) {
      setAvailability('idle')
      setAvailabilityMsg(null)
      return
    }

    if (value.toLowerCase() === currentUsername.toLowerCase()) {
      setAvailability('available')
      setAvailabilityMsg('This is your current username.')
      return
    }

    const validationError = validateUsername(value)
    if (validationError) {
      setAvailability('invalid')
      setAvailabilityMsg(validationError)
      return
    }

    setAvailability('checking')
    setAvailabilityMsg(null)
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const result = await checkUsernameApi(value, controller.signal)
        if (result.data.isUserNameExist) {
          setAvailability('taken')
          setAvailabilityMsg('This username is already taken.')
        } else {
          setAvailability('available')
          setAvailabilityMsg('Username is available.')
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        setAvailability('invalid')
        setAvailabilityMsg('Could not check availability.')
      }
    }, 400)
  }

  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (availability !== 'available' || !username) return
    if (username.toLowerCase() === currentUsername.toLowerCase()) {
      onClose()
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/player/username', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username }),
      })
      const body = (await res.json().catch(() => null)) as { message?: string } | null
      if (!res.ok) {
        throw new Error(body?.message ?? 'Could not update username.')
      }
      toast.success('Your username has been updated.', { title: 'Saved' })
      router.refresh()
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update username.'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  const canSave =
    availability === 'available' &&
    username.length > 0 &&
    !submitting &&
    username.toLowerCase() !== currentUsername.toLowerCase()

  return (
    <GradientModalShell open={open} onClose={onClose} size="sm">
      <form onSubmit={handleSubmit} className="mt-2 space-y-5">
        <h2 className="text-lg font-bold tracking-tight text-white">Change Username</h2>

        <div className="space-y-2">
          <CfLabel htmlFor="new-username" className="text-xs font-semibold text-white/40">
            New Username
          </CfLabel>
          <div className="relative">
            <CfTextInput
              id="new-username"
              value={username}
              onChange={handleChange}
              placeholder="your_username"
              autoComplete="username"
              autoFocus
              className="border-white/10 bg-[#121212] pr-10"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
              {availability === 'checking' && (
                <Loader2 className="h-4 w-4 animate-spin text-white/40" />
              )}
              {availability === 'available' && <CheckCircle2 className="h-4 w-4 text-[#25F54B]" />}
              {(availability === 'taken' || availability === 'invalid') && (
                <XCircle className="h-4 w-4 text-red-400" />
              )}
            </span>
          </div>
          {availabilityMsg ? (
            <p
              className={`text-xs ${
                availability === 'available' ? 'text-[#72B433]' : 'text-red-400'
              }`}
            >
              {availabilityMsg}
            </p>
          ) : null}
        </div>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        <div className="flex gap-3 pt-2">
          <SecondaryModalButton type="button" onClick={onClose}>
            Cancel
          </SecondaryModalButton>
          <PrimaryModalButton type="submit" disabled={!canSave}>
            {submitting ? 'Saving…' : 'Save'}
          </PrimaryModalButton>
        </div>
      </form>
    </GradientModalShell>
  )
}
