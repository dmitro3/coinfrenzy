'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'

import { CfLabel, CfTextInput, GoldButton, useToast } from '@coinfrenzy/ui/player'

import { checkUsernameApi, setUsernameApi } from '../services/auth-service'
import { usernameSchema } from '../schemas/auth-schemas'
import { useAuthModal } from '../context/AuthModalContext'

type AvailabilityState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

export function UsernamePanel() {
  const router = useRouter()
  const toast = useToast()
  const { close } = useAuthModal()

  const [username, setUsername] = React.useState('')
  const [availability, setAvailability] = React.useState<AvailabilityState>('idle')
  const [availabilityMsg, setAvailabilityMsg] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [submitError, setSubmitError] = React.useState<string | null>(null)

  // AbortController ref for cancelling in-flight availability checks
  const abortRef = React.useRef<AbortController | null>(null)
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    setUsername(value)
    setSubmitError(null)

    // Cancel previous debounce + in-flight request
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (abortRef.current) abortRef.current.abort()

    if (!value) {
      setAvailability('idle')
      setAvailabilityMsg(null)
      return
    }

    // Client-side validation first
    const parsed = usernameSchema.shape.username.safeParse(value)
    if (!parsed.success) {
      setAvailability('invalid')
      setAvailabilityMsg(parsed.error.errors[0]?.message ?? 'Invalid username')
      return
    }

    // Debounce API check 400ms
    setAvailability('checking')
    setAvailabilityMsg(null)
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const result = await checkUsernameApi(value, controller.signal)
        if (result.data.isUserNameExist) {
          setAvailability('taken')
          setAvailabilityMsg('This username is already taken')
        } else {
          setAvailability('available')
          setAvailabilityMsg('Username is available')
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        setAvailability('invalid')
        setAvailabilityMsg('Could not check availability')
      }
    }, 400)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (availability !== 'available') return
    setSubmitError(null)
    setIsSubmitting(true)

    try {
      await setUsernameApi(username)
      toast.success('Username created successfully.', { title: 'Welcome!' })
      router.refresh()
      close()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save username'
      setSubmitError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

  const canSubmit = availability === 'available' && !isSubmitting

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <div>
        <h2 className="cf-headline text-xl font-bold uppercase tracking-wider text-white">
          Create Username
        </h2>
        <p className="mt-2 text-sm text-[var(--cf-gray-light)]">
          Choose a unique username for your account. You can&apos;t change this later.
        </p>
      </div>

      <div className="space-y-1.5">
        <CfLabel htmlFor="username-input">Username</CfLabel>
        <div className="relative">
          <CfTextInput
            id="username-input"
            type="text"
            autoComplete="username"
            placeholder="e.g. lucky_player"
            value={username}
            onChange={handleChange}
            autoFocus
          />
          {/* Inline availability indicator */}
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
            {availability === 'checking' && (
              <Loader2 className="h-4 w-4 animate-spin text-[var(--cf-gray-light)]" />
            )}
            {availability === 'available' && (
              <CheckCircle2 className="h-4 w-4 text-[var(--cf-green-bright)]" />
            )}
            {(availability === 'taken' || availability === 'invalid') && (
              <XCircle className="h-4 w-4 text-[var(--cf-red-primary)]" />
            )}
          </span>
        </div>

        {availabilityMsg && (
          <p
            className={`text-xs ${
              availability === 'available'
                ? 'text-[var(--cf-green-bright)]'
                : 'text-[var(--cf-red-primary)]'
            }`}
          >
            {availabilityMsg}
          </p>
        )}

        <p className="text-xs text-[var(--cf-gray-light)]">
          5–20 characters · letters, numbers, underscores · at least one lowercase letter
        </p>
      </div>

      {submitError && (
        <div className="rounded-md border border-[var(--cf-red-dark)] bg-[var(--cf-red-deep)]/40 p-3 text-sm text-[var(--cf-red-primary)]">
          {submitError}
        </div>
      )}

      <GoldButton type="submit" disabled={!canSubmit} fullWidth size="md">
        {isSubmitting ? 'Saving…' : 'Save Username'}
      </GoldButton>
    </form>
  )
}
