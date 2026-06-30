import 'server-only'

import { adapters } from '@coinfrenzy/core'

// Shared OTP email helper used by signup and resend-otp routes.
// Centralises the email template so both code paths produce the same message.

export async function sendOtpEmail({ email, otp }: { email: string; otp: string }): Promise<void> {
  await adapters.sendgrid.sendEmail({
    to: email,
    subject: 'Verify your CoinFrenzy account',
    text: [
      `Your CoinFrenzy verification code is: ${otp}`,
      '',
      'This code expires in 10 minutes.',
      '',
      "If you didn't create an account, you can safely ignore this email.",
    ].join('\n'),
    category: 'transactional.otp_verification',
  })
}

export async function sendPasswordResetOtpEmail({
  email,
  otp,
}: {
  email: string
  otp: string
}): Promise<void> {
  await adapters.sendgrid.sendEmail({
    to: email,
    subject: 'Reset your CoinFrenzy password',
    text: [
      `Your CoinFrenzy password reset code is: ${otp}`,
      '',
      'This code expires in 10 minutes.',
      '',
      "If you didn't request a password reset, you can safely ignore this email.",
    ].join('\n'),
    category: 'transactional.password_reset',
  })
}

export const PASSWORD_RESET_OTP_IDENTIFIER_PREFIX = 'password-reset:'
export const PASSWORD_RESET_OTP_TTL_MS = 10 * 60 * 1000
export const PASSWORD_RESET_RESEND_COOLDOWN_MS = 60 * 1000

export function passwordResetOtpIdentifier(email: string): string {
  return `${PASSWORD_RESET_OTP_IDENTIFIER_PREFIX}${email.trim().toLowerCase()}`
}

export function passwordResetRateLimitMessage(waitSec: number): string {
  return `Please wait for ${waitSec} sec to resend OTP`
}

export const CHANGE_EMAIL_OTP_IDENTIFIER_PREFIX = 'change-email:'
export const PHONE_OTP_IDENTIFIER_PREFIX = 'phone:'

export function changeEmailOtpIdentifier(playerId: string, email: string): string {
  return `${CHANGE_EMAIL_OTP_IDENTIFIER_PREFIX}${playerId}:${email.trim().toLowerCase()}`
}

export function phoneOtpIdentifier(playerId: string, phone: string): string {
  return `${PHONE_OTP_IDENTIFIER_PREFIX}${playerId}:${phone}`
}

export async function sendChangeEmailOtpEmail({
  email,
  otp,
}: {
  email: string
  otp: string
}): Promise<void> {
  await adapters.sendgrid.sendEmail({
    to: email,
    subject: 'Verify your new CoinFrenzy email',
    text: [
      `Your CoinFrenzy email change verification code is: ${otp}`,
      '',
      'This code expires in 10 minutes.',
      '',
      "If you didn't request this change, contact support immediately.",
    ].join('\n'),
    category: 'transactional.email_change',
  })
}
