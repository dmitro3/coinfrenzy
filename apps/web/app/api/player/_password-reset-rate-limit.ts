import 'server-only'

import { eq } from 'drizzle-orm'

import type { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import {
  PASSWORD_RESET_RESEND_COOLDOWN_MS,
  passwordResetOtpIdentifier,
  passwordResetRateLimitMessage,
} from './_otp-helpers'

type Db = ReturnType<typeof getDb>

export async function getPasswordResetCooldown(
  db: Db,
  email: string,
): Promise<{ allowed: true } | { allowed: false; waitSec: number; message: string }> {
  const identifier = passwordResetOtpIdentifier(email)
  const existing = await db
    .select({ createdAt: schema.authVerification.createdAt })
    .from(schema.authVerification)
    .where(eq(schema.authVerification.identifier, identifier))
    .limit(1)

  const record = existing[0]
  if (!record) return { allowed: true }

  const elapsed = Date.now() - record.createdAt.getTime()
  if (elapsed >= PASSWORD_RESET_RESEND_COOLDOWN_MS) return { allowed: true }

  const waitSec = Math.ceil((PASSWORD_RESET_RESEND_COOLDOWN_MS - elapsed) / 1000)
  return {
    allowed: false,
    waitSec,
    message: passwordResetRateLimitMessage(waitSec),
  }
}
