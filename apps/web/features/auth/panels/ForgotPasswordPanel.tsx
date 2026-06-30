'use client'

import * as React from 'react'
import { ArrowLeft } from 'lucide-react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { CfLabel, CfTextInput, GoldButton, useToast } from '@coinfrenzy/ui/player'

import { forgotPasswordApi } from '../services/auth-service'
import { useAuthModal } from '../context/AuthModalContext'

const requestSchema = z.object({
  email: z.string().email('Please enter an email address'),
})

type RequestValues = z.infer<typeof requestSchema>

export function ForgotPasswordPanel() {
  const toast = useToast()
  const { openLogin, goToResetPassword } = useAuthModal()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RequestValues>({ resolver: zodResolver(requestSchema) })

  async function onSubmit(values: RequestValues) {
    try {
      const result = await forgotPasswordApi(values.email)
      toast.success('OTP has been sent to your email.')
      const expiresAt = Date.parse(result.data.otpExpiresAt)
      goToResetPassword(values.email, Number.isFinite(expiresAt) ? expiresAt : undefined)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send reset code')
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openLogin}
        className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-white hover:text-[var(--cf-gold-light)]"
      >
        <ArrowLeft className="h-4 w-4" /> Back To Login
      </button>

      <h1 className="cf-headline text-xl font-bold uppercase tracking-wider text-white">
        Forgot Password?
      </h1>
      <p className="mt-1 text-sm text-[var(--cf-gray-light)]">
        Don&apos;t worry! Enter your email address to recover your password.
      </p>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="space-y-1.5">
          <CfLabel htmlFor="forgot-email">Email</CfLabel>
          <CfTextInput
            id="forgot-email"
            type="email"
            autoComplete="email"
            placeholder="Enter"
            {...register('email')}
          />
          {errors.email && (
            <p className="text-xs text-[var(--cf-red-primary)]">{errors.email.message}</p>
          )}
        </div>

        <GoldButton
          type="submit"
          variant="gold-horizontal"
          disabled={isSubmitting}
          fullWidth
          size="md"
        >
          {isSubmitting ? 'Sending…' : 'Submit'}
        </GoldButton>
      </form>
    </>
  )
}
