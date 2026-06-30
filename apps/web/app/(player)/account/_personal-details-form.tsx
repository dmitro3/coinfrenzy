'use client'

import * as React from 'react'
import { Calendar, ChevronDown } from 'lucide-react'

import { GENDER_OPTIONS, US_STATES } from '@coinfrenzy/config'
import { cn } from '@coinfrenzy/ui/lib/utils'
import { GoldButton, useToast } from '@coinfrenzy/ui/player'

export interface PersonalDetailsInitialValues {
  firstName: string
  lastName: string
  dateOfBirth: string
  gender: string
  addressLine1: string
  city: string
  postalCode: string
  state: string
}

const EMPTY: PersonalDetailsInitialValues = {
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  gender: '',
  addressLine1: '',
  city: '',
  postalCode: '',
  state: '',
}

const inputClassName = cn(
  'h-11 w-full rounded-md border bg-[var(--cf-bg-base)] px-3 text-sm text-white',
  'placeholder:text-[var(--cf-gray-light)]/70 focus:outline-none',
  'transition-colors duration-150 border-[var(--cf-border-default)]',
  'focus:border-[var(--cf-gold-medium)]',
)

export function PersonalDetailsForm({ initial }: { initial: PersonalDetailsInitialValues }) {
  const [values, setValues] = React.useState<PersonalDetailsInitialValues>(initial)
  const [fieldErrors, setFieldErrors] = React.useState<
    Partial<Record<keyof PersonalDetailsInitialValues, string>>
  >({})
  const [status, setStatus] = React.useState<'idle' | 'saving' | 'saved'>('idle')
  const toast = useToast()

  React.useEffect(() => {
    setValues(initial)
  }, [initial])

  function setField<K extends keyof PersonalDetailsInitialValues>(
    key: K,
    next: PersonalDetailsInitialValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: next }))
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }))
    setStatus('idle')
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setStatus('saving')
    setFieldErrors({})

    const res = await fetch('/api/player/personal-details', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })

    const body = (await res.json().catch(() => null)) as
      | { ok: true }
      | { error: string; field?: keyof PersonalDetailsInitialValues; message?: string }

    if (!res.ok) {
      setStatus('idle')
      if (body && 'field' in body && body.field) {
        setFieldErrors({ [body.field]: body.message ?? 'Invalid value.' })
      }
      toast.error(
        body && 'message' in body && body.message
          ? body.message
          : 'Could not update personal details.',
        { title: 'Update failed' },
      )
      return
    }

    setStatus('saved')
    toast.success('Your personal details have been updated.', { title: 'Updated' })
    setTimeout(() => setStatus('idle'), 2500)
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <TextField
          label="First Name"
          required
          value={values.firstName}
          onChange={(next) => setField('firstName', next)}
          error={fieldErrors.firstName}
        />
        <TextField
          label="Last Name"
          required
          value={values.lastName}
          onChange={(next) => setField('lastName', next)}
          error={fieldErrors.lastName}
        />
        <TextField
          label="Date Of Birth"
          required
          value={values.dateOfBirth}
          onChange={(next) => setField('dateOfBirth', next)}
          placeholder="MM/DD/YYYY"
          error={fieldErrors.dateOfBirth}
          icon={<Calendar className="h-4 w-4" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SelectField
          label="Gender"
          required
          value={values.gender}
          onChange={(next) => setField('gender', next)}
          options={[
            { value: '', label: 'Select' },
            ...GENDER_OPTIONS.map((g) => ({ value: g, label: g })),
          ]}
          error={fieldErrors.gender}
        />
        <TextField
          label="Address"
          required
          value={values.addressLine1}
          onChange={(next) => setField('addressLine1', next)}
          error={fieldErrors.addressLine1}
        />
        <TextField
          label="City"
          required
          value={values.city}
          onChange={(next) => setField('city', next)}
          error={fieldErrors.city}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <TextField
          label="Postal Code"
          required
          value={values.postalCode}
          onChange={(next) => setField('postalCode', next)}
          error={fieldErrors.postalCode}
        />
        <SelectField
          label="State"
          required
          value={values.state}
          onChange={(next) => setField('state', next)}
          options={[
            { value: '', label: 'Select' },
            ...US_STATES.map((s) => ({ value: s.code, label: s.name })),
          ]}
          error={fieldErrors.state}
        />
      </div>

      <div className="pt-2">
        <GoldButton
          type="submit"
          variant="gold-horizontal"
          disabled={status === 'saving'}
          className="min-w-[120px]"
        >
          {status === 'saving' ? 'Updating…' : status === 'saved' ? 'Updated ✓' : 'Update'}
        </GoldButton>
      </div>
    </form>
  )
}

function TextField({
  label,
  required,
  value,
  onChange,
  placeholder = 'Enter',
  error,
  icon,
}: {
  label: string
  required?: boolean
  value: string
  onChange: (next: string) => void
  placeholder?: string
  error?: string
  icon?: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-white">
        {label}
        {required ? <span className="text-[var(--cf-red-primary)]"> *</span> : null}
      </span>
      <span className="relative mt-1 block">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            inputClassName,
            icon && 'pr-10',
            error && 'border-[var(--cf-red-primary)]/70',
          )}
        />
        {icon ? (
          <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-[var(--cf-gray-light)]">
            {icon}
          </span>
        ) : null}
      </span>
      {error ? (
        <span className="mt-1 block text-[11px] text-[var(--cf-red-primary)]">{error}</span>
      ) : null}
    </label>
  )
}

function SelectField({
  label,
  required,
  value,
  onChange,
  options,
  error,
}: {
  label: string
  required?: boolean
  value: string
  onChange: (next: string) => void
  options: Array<{ value: string; label: string }>
  error?: string
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-white">
        {label}
        {required ? <span className="text-[var(--cf-red-primary)]"> *</span> : null}
      </span>
      <span className="relative mt-1 block">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            inputClassName,
            'appearance-none pr-10',
            !value && 'text-[var(--cf-gray-light)]/70',
            error && 'border-[var(--cf-red-primary)]/70',
          )}
        >
          {options.map((option) => (
            <option
              key={option.value || 'empty'}
              value={option.value}
              className="bg-[var(--cf-bg-base)]"
            >
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cf-gray-light)]" />
      </span>
      {error ? (
        <span className="mt-1 block text-[11px] text-[var(--cf-red-primary)]">{error}</span>
      ) : null}
    </label>
  )
}

export { EMPTY as emptyPersonalDetails }
