'use client'

import * as React from 'react'
import { Calendar, ChevronDown } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { GENDER_OPTIONS, US_STATES } from '@coinfrenzy/config'
import { cn } from '@coinfrenzy/ui/lib/utils'
import { useKycModal, useToast } from '@coinfrenzy/ui/player'

import type { PersonalDetailsInitialValues } from '../_personal-details-form'

import { RESEND_COOLDOWN_SEC } from './_constants'
import { GradientModalShell } from './_gradient-modal-shell'
import { OtpInput } from './_otp-input'
import { PrimaryModalButton, SecondaryModalButton } from './_modal-buttons'
import { VerificationStepper } from './_verification-stepper'

type FlowStep = 1 | 2 | 3
type PhonePhase = 'number' | 'otp'

interface VerificationFlowModalProps {
  open: boolean
  onClose: () => void
  initialStep: FlowStep
  personalDetails: PersonalDetailsInitialValues
  phone: string | null
  phoneVerified: boolean
  kycVerified: boolean
}

const fieldInputClass =
  'h-11 w-full rounded-lg border border-white/10 bg-[#121212] px-3 text-sm text-white placeholder:text-white/35 focus:border-white/20 focus:outline-none'

export function VerificationFlowModal({
  open,
  onClose,
  initialStep,
  personalDetails,
  phone: initialPhone,
  phoneVerified,
  kycVerified,
}: VerificationFlowModalProps) {
  const router = useRouter()
  const toast = useToast()
  const { openKyc } = useKycModal()

  const [step, setStep] = React.useState<FlowStep>(initialStep)
  const [values, setValues] = React.useState(personalDetails)
  const [fieldErrors, setFieldErrors] = React.useState<
    Partial<Record<keyof PersonalDetailsInitialValues, string>>
  >({})
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [phonePhase, setPhonePhase] = React.useState<PhonePhase>('number')
  const [phone, setPhone] = React.useState(initialPhone ?? '')
  const [otp, setOtp] = React.useState('')
  const [countdown, setCountdown] = React.useState(0)

  React.useEffect(() => {
    if (!open) return
    setStep(initialStep)
    setValues(personalDetails)
    setFieldErrors({})
    setError(null)
    setSubmitting(false)
    setPhonePhase('number')
    setPhone(initialPhone ?? '')
    setOtp('')
    setCountdown(0)
  }, [open, initialStep, personalDetails, initialPhone, phoneVerified])

  React.useEffect(() => {
    if (countdown <= 0) return
    const timer = window.setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  function setField<K extends keyof PersonalDetailsInitialValues>(
    key: K,
    next: PersonalDetailsInitialValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: next }))
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }))
    setError(null)
  }

  async function savePersonalDetails() {
    setSubmitting(true)
    setError(null)
    setFieldErrors({})
    const res = await fetch('/api/player/personal-details', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
    const body = (await res.json().catch(() => null)) as
      | { ok: true }
      | { field?: keyof PersonalDetailsInitialValues; message?: string }
    setSubmitting(false)
    if (!res.ok) {
      if (body && 'field' in body && body.field) {
        setFieldErrors({ [body.field]: body.message ?? 'Invalid value.' })
      }
      setError(body && 'message' in body && body.message ? body.message : 'Could not save details.')
      return false
    }
    toast.success('Personal details saved.', { title: 'Updated' })
    router.refresh()
    return true
  }

  async function handlePersonalDetailsSubmit(e: React.FormEvent) {
    e.preventDefault()
    const ok = await savePersonalDetails()
    if (ok) setStep(2)
  }

  async function sendPhoneCode() {
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 10) {
      setError('Enter a valid phone number.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/player/phone/send-code', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: `+1${digits.slice(-10)}` }),
      })
      const body = (await res.json().catch(() => null)) as { message?: string } | null
      if (!res.ok) {
        throw new Error(body?.message ?? 'Could not send code.')
      }
      toast.success('Verification code sent to your phone.', { title: 'SMS sent' })
      setPhonePhase('otp')
      setCountdown(RESEND_COOLDOWN_SEC)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send code.')
    } finally {
      setSubmitting(false)
    }
  }

  async function verifyPhoneOtp(e: React.FormEvent) {
    e.preventDefault()
    if (otp.length !== 6) {
      setError('Enter the 6-digit code.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const digits = phone.replace(/\D/g, '')
      const res = await fetch('/api/player/phone/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: `+1${digits.slice(-10)}`, otp }),
      })
      const body = (await res.json().catch(() => null)) as { message?: string } | null
      if (!res.ok) {
        throw new Error(body?.message ?? 'Invalid code.')
      }
      toast.success('Phone verified.', { title: 'Verified' })
      router.refresh()
      setStep(3)
      setOtp('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code.')
      setOtp('')
    } finally {
      setSubmitting(false)
    }
  }

  function startKyc() {
    onClose()
    openKyc({
      reason: 'Complete identity verification',
      onVerified: () => router.refresh(),
    })
  }

  return (
    <GradientModalShell open={open} onClose={onClose} size="lg">
      <VerificationStepper activeStep={step} />

      <div className="mb-6 mt-4 px-1">
        <h2 className="text-[18px] font-bold tracking-tight text-white">
          {step === 1 ? 'Personal Details' : step === 2 ? 'Phone Verification' : 'KYC Verification'}
        </h2>
      </div>

      <div
        data-stepper-form-scroll="true"
        className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {step === 1 ? (
          <form className="flex flex-col flex-1" onSubmit={handlePersonalDetailsSubmit}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="First Name" required error={fieldErrors.firstName}>
                <input
                  className={fieldInputClass}
                  value={values.firstName}
                  placeholder="Enter"
                  onChange={(e) => setField('firstName', e.target.value)}
                />
              </Field>
              <Field label="Last Name" required error={fieldErrors.lastName}>
                <input
                  className={fieldInputClass}
                  value={values.lastName}
                  placeholder="Enter"
                  onChange={(e) => setField('lastName', e.target.value)}
                />
              </Field>
              <Field label="Gender" required error={fieldErrors.gender}>
                <div className="relative">
                  <select
                    className={cn(fieldInputClass, 'appearance-none pr-10')}
                    value={values.gender}
                    onChange={(e) => setField('gender', e.target.value)}
                  >
                    <option value="">Select</option>
                    {GENDER_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                </div>
              </Field>
              <Field label="Date Of Birth" required error={fieldErrors.dateOfBirth}>
                <div className="relative">
                  <input
                    className={cn(fieldInputClass, 'pr-10')}
                    value={values.dateOfBirth}
                    placeholder="MM/DD/YYYY"
                    onChange={(e) => setField('dateOfBirth', e.target.value)}
                  />
                  <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                </div>
              </Field>
              <Field
                label="Address"
                required
                error={fieldErrors.addressLine1}
                className="sm:col-span-2"
              >
                <input
                  className={fieldInputClass}
                  value={values.addressLine1}
                  placeholder="Enter"
                  onChange={(e) => setField('addressLine1', e.target.value)}
                />
              </Field>
              <Field label="City" required error={fieldErrors.city}>
                <input
                  className={fieldInputClass}
                  value={values.city}
                  placeholder="Enter"
                  onChange={(e) => setField('city', e.target.value)}
                />
              </Field>
              <Field label="State" required error={fieldErrors.state}>
                <div className="relative">
                  <select
                    className={cn(fieldInputClass, 'appearance-none pr-10')}
                    value={values.state}
                    onChange={(e) => setField('state', e.target.value)}
                  >
                    <option value="">Select</option>
                    {US_STATES.map((st) => (
                      <option key={st.code} value={st.code}>
                        {st.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                </div>
              </Field>
              <Field label="Postal Code" required error={fieldErrors.postalCode}>
                <input
                  className={fieldInputClass}
                  value={values.postalCode}
                  placeholder="Enter"
                  onChange={(e) => setField('postalCode', e.target.value)}
                />
              </Field>
            </div>

            {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
            <div className="flex-1 min-h-[40px]" />
            <div className="flex gap-3 pb-2 pt-6">
              <PrimaryModalButton type="submit" disabled={submitting}>
                {submitting ? 'Saving…' : 'Update'}
              </PrimaryModalButton>
              <SecondaryModalButton type="button" onClick={onClose}>
                Cancel
              </SecondaryModalButton>
            </div>
          </form>
        ) : null}

        {step === 2 ? (
          <form
            className="flex flex-col flex-1"
            onSubmit={
              phonePhase === 'otp'
                ? verifyPhoneOtp
                : (e) => {
                    e.preventDefault()
                    void sendPhoneCode()
                  }
            }
          >
            <div className="space-y-6">
              {phonePhase === 'number' ? (
                <div className="space-y-2">
                  <label className="text-[12px] font-semibold text-white/40 tracking-wide">
                    Phone Number
                  </label>
                  <div className="flex overflow-hidden rounded-lg border border-white/10 bg-[#121212]">
                    <div className="flex items-center gap-1.5 border-r border-white/10 px-3 text-sm text-white/80">
                      <span aria-hidden>🇺🇸</span>
                      <span>+1</span>
                    </div>
                    <input
                      type="tel"
                      inputMode="tel"
                      className="h-11 flex-1 bg-transparent px-3 text-sm text-white placeholder:text-white/35 focus:outline-none"
                      placeholder="000-000-0000"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value)
                        setError(null)
                      }}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-[12px] font-semibold text-white/40 tracking-wide">
                      Enter OTP
                    </label>
                    <OtpInput value={otp} onChange={setOtp} disabled={submitting} autoFocus />
                  </div>
                  <p className="text-[12px] text-white/40">
                    Don&apos;t get the OTP?{' '}
                    {countdown > 0 ? (
                      <span className="ml-1 font-bold text-white">{countdown}s</span>
                    ) : (
                      <button
                        type="button"
                        className="font-bold text-white"
                        disabled={submitting}
                        onClick={() => void sendPhoneCode()}
                      >
                        Resend
                      </button>
                    )}
                  </p>
                </>
              )}
            </div>

            {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
            <div className="flex-1 min-h-[40px]" />
            <div className="flex gap-3 pb-2 pt-6">
              {phonePhase === 'number' ? (
                <>
                  <PrimaryModalButton type="submit" disabled={submitting}>
                    {submitting ? 'Sending…' : 'Send Code'}
                  </PrimaryModalButton>
                  <SecondaryModalButton type="button" onClick={() => setStep(1)}>
                    Back
                  </SecondaryModalButton>
                </>
              ) : (
                <>
                  <PrimaryModalButton type="submit" disabled={submitting || otp.length !== 6}>
                    {submitting ? 'Submitting…' : 'Submit'}
                  </PrimaryModalButton>
                  <SecondaryModalButton
                    type="button"
                    disabled={submitting || countdown > 0}
                    className={countdown > 0 ? 'text-white/40 opacity-50' : undefined}
                    onClick={() => void sendPhoneCode()}
                  >
                    Resend
                  </SecondaryModalButton>
                </>
              )}
            </div>
          </form>
        ) : null}

        {step === 3 ? (
          <div className="flex flex-col flex-1">
            <p className="text-sm leading-relaxed text-white/70">
              {kycVerified
                ? 'Your identity verification is complete.'
                : 'Verify your identity with Footprint to unlock SC redemptions and higher limits.'}
            </p>
            {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
            <div className="flex-1 min-h-[40px]" />
            <div className="flex gap-3 pb-2 pt-6">
              {!kycVerified ? (
                <PrimaryModalButton type="button" onClick={startKyc}>
                  Start KYC
                </PrimaryModalButton>
              ) : null}
              <SecondaryModalButton type="button" onClick={onClose}>
                {kycVerified ? 'Close' : 'Cancel'}
              </SecondaryModalButton>
            </div>
          </div>
        ) : null}
      </div>
    </GradientModalShell>
  )
}

function Field({
  label,
  required,
  error,
  className,
  children,
}: {
  label: string
  required?: boolean
  error?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="text-xs font-medium text-white">
        {label}
        {required ? <span className="text-red-400"> *</span> : null}
      </label>
      {children}
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  )
}
