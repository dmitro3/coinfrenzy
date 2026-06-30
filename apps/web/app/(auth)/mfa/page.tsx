'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { AuthModal, CfLabel, CfTextInput, GoldButton } from '@coinfrenzy/ui/player'

import { twoFactor } from '@/lib/auth-client'

const mfaSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
})

type MfaValues = z.infer<typeof mfaSchema>

export default function MfaPage() {
  return (
    <React.Suspense fallback={null}>
      <MfaPageInner />
    </React.Suspense>
  )
}

function MfaPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams?.get('next') ?? '/lobby'

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<MfaValues>({ resolver: zodResolver(mfaSchema) })

  const [error, setError] = React.useState<string | null>(null)

  async function onSubmit(values: MfaValues) {
    setError(null)
    const result = await twoFactor.verifyTotp({ code: values.code })
    if (result.error) {
      setError(result.error.message ?? 'Invalid code')
      return
    }
    router.push(next.startsWith('/') ? next : '/')
    router.refresh()
  }

  return (
    <AuthModal closeHref="/login" foxVariant="coins-half">
      <h1 className="cf-headline text-xl font-bold uppercase tracking-wider text-white">
        Two-Factor Code
      </h1>
      <p className="mt-1 text-sm text-[var(--cf-gray-light)]">
        Open your authenticator app and enter the 6-digit code.
      </p>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="space-y-1.5">
          <CfLabel htmlFor="code">Code</CfLabel>
          <CfTextInput
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            className="text-center text-lg tracking-[0.4em]"
            {...register('code')}
          />
          {errors.code && (
            <p className="text-xs text-[var(--cf-red-primary)]">{errors.code.message}</p>
          )}
        </div>

        {error && (
          <div className="rounded-md border border-[var(--cf-red-dark)] bg-[var(--cf-red-deep)]/40 p-3 text-sm text-[var(--cf-red-primary)]">
            {error}
          </div>
        )}

        <GoldButton type="submit" disabled={isSubmitting} fullWidth size="md">
          {isSubmitting ? 'Verifying…' : 'Verify'}
        </GoldButton>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--cf-gray-light)]">
        Lost your authenticator?{' '}
        <Link
          className="font-semibold text-white hover:text-[var(--cf-gold-light)]"
          href="/live-support"
        >
          Contact support
        </Link>
      </p>
    </AuthModal>
  )
}
