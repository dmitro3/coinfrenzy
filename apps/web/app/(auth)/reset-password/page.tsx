'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ArrowLeft } from 'lucide-react'

import { AuthModal, CfLabel, CfPasswordInput, CfTextInput, GoldButton } from '@coinfrenzy/ui/player'

import { requestPasswordReset, resetPassword } from '@/lib/auth-client'

const requestSchema = z.object({
  email: z.string().email('Please enter an email address'),
})

const completeSchema = z
  .object({
    password: z.string().min(8, 'Password must contain at least 8 characters').max(128),
    confirm: z.string().min(1),
  })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'Passwords must match',
  })

type RequestValues = z.infer<typeof requestSchema>
type CompleteValues = z.infer<typeof completeSchema>

export default function ResetPasswordPage() {
  return (
    <React.Suspense fallback={null}>
      <ResetPasswordPageInner />
    </React.Suspense>
  )
}

function ResetPasswordPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams?.get('token')

  if (token) {
    return <CompleteForm token={token} onDone={() => router.push('/login')} />
  }
  return <RequestForm />
}

function RequestForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RequestValues>({ resolver: zodResolver(requestSchema) })
  const [sent, setSent] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function onSubmit(values: RequestValues) {
    setError(null)
    const result = await requestPasswordReset({
      email: values.email.trim().toLowerCase(),
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (result.error) {
      setError(result.error.message ?? 'Could not send reset link')
      return
    }
    setSent(true)
  }

  return (
    <AuthModal closeHref="/login" foxVariant="coins-half">
      <Link
        href="/login"
        className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-white hover:text-[var(--cf-gold-light)]"
      >
        <ArrowLeft className="h-4 w-4" /> Back To Login
      </Link>

      <h1 className="cf-headline text-xl font-bold uppercase tracking-wider text-white">
        Forgot Password?
      </h1>
      <p className="mt-1 text-sm text-[var(--cf-gray-light)]">
        Don&apos;t worry! Enter your email address to recover your password.
      </p>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="space-y-1.5">
          <CfLabel htmlFor="email">Email</CfLabel>
          <CfTextInput
            id="email"
            type="email"
            autoComplete="email"
            placeholder="Enter"
            {...register('email')}
          />
          {errors.email && (
            <p className="text-xs text-[var(--cf-red-primary)]">{errors.email.message}</p>
          )}
        </div>

        {error && (
          <div className="rounded-md border border-[var(--cf-red-dark)] bg-[var(--cf-red-deep)]/40 p-3 text-sm text-[var(--cf-red-primary)]">
            {error}
          </div>
        )}
        {sent && (
          <div className="rounded-md border border-[var(--cf-gold-deep)] bg-black/40 p-3 text-sm text-[var(--cf-gold-light)]">
            If an account exists for that email, a reset link is on the way.
          </div>
        )}

        <GoldButton type="submit" disabled={isSubmitting} fullWidth size="md">
          {isSubmitting ? 'Sending…' : 'Submit'}
        </GoldButton>
      </form>
    </AuthModal>
  )
}

function CompleteForm({ token, onDone }: { token: string; onDone: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CompleteValues>({ resolver: zodResolver(completeSchema) })
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState(false)

  async function onSubmit(values: CompleteValues) {
    setError(null)
    const result = await resetPassword({ token, newPassword: values.password })
    if (result.error) {
      setError(result.error.message ?? 'Could not reset password')
      return
    }
    setDone(true)
    setTimeout(() => onDone(), 1500)
  }

  return (
    <AuthModal closeHref="/login" foxVariant="coins-half">
      <h1 className="cf-headline text-xl font-bold uppercase tracking-wider text-white">
        Choose a new password
      </h1>
      <p className="mt-1 text-sm text-[var(--cf-gray-light)]">
        Pick something you haven&apos;t used before.
      </p>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="space-y-1.5">
          <CfLabel htmlFor="password">New password</CfLabel>
          <CfPasswordInput
            id="password"
            autoComplete="new-password"
            placeholder="At least 10 characters"
            {...register('password')}
          />
          {errors.password && (
            <p className="text-xs text-[var(--cf-red-primary)]">{errors.password.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <CfLabel htmlFor="confirm">Confirm password</CfLabel>
          <CfPasswordInput
            id="confirm"
            autoComplete="new-password"
            placeholder="Re-enter"
            {...register('confirm')}
          />
          {errors.confirm && (
            <p className="text-xs text-[var(--cf-red-primary)]">{errors.confirm.message}</p>
          )}
        </div>
        {error && (
          <div className="rounded-md border border-[var(--cf-red-dark)] bg-[var(--cf-red-deep)]/40 p-3 text-sm text-[var(--cf-red-primary)]">
            {error}
          </div>
        )}
        {done && (
          <div className="rounded-md border border-[var(--cf-gold-deep)] bg-black/40 p-3 text-sm text-[var(--cf-gold-light)]">
            Password reset. Redirecting to login…
          </div>
        )}
        <GoldButton type="submit" disabled={isSubmitting || done} fullWidth size="md">
          {isSubmitting ? 'Saving…' : 'Save new password'}
        </GoldButton>
      </form>
    </AuthModal>
  )
}
