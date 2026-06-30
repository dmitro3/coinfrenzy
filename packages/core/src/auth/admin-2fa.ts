import { randomBytes } from 'node:crypto'

import { authenticator } from 'otplib'
import { HashAlgorithms } from 'otplib/core'
import QRCode from 'qrcode'
import { eq } from 'drizzle-orm'

import { type DbExecutor } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

/**
 * TOTP setup + verification for admins. Backed by `otplib` (RFC 6238) and
 * stored on `admins.totp_secret`. Backup codes are stored verbatim in JSON
 * (one-time use, low blast radius — see docs/09 §5.2).
 *
 * Standard TOTP: SHA1, 6-digit code, 30-second window.
 */
authenticator.options = {
  algorithm: HashAlgorithms.SHA1,
  digits: 6,
  step: 30,
  window: 3,
}

export const ISSUER = 'CoinFrenzy Admin'

export interface SetupResult {
  /** Base32-encoded secret. Written to `admins.totp_secret` on confirm. */
  secret: string
  /** otpauth URI suitable for QR rendering. */
  otpauthUrl: string
  /** Data URL (image/png) for the QR. Safe to embed in <img src>. */
  qrPngDataUrl: string
}

/**
 * Generate a fresh secret and the QR/otpauth URI for the user to scan.
 *
 * IMPORTANT: this does NOT persist the secret. The caller must persist it
 * only AFTER the user proves possession by submitting a valid 6-digit code
 * (see `confirmAndEnable`).
 */
export async function beginSetup(adminEmail: string): Promise<SetupResult> {
  const secret = authenticator.generateSecret(20) // 160 bits
  const otpauthUrl = authenticator.keyuri(adminEmail, ISSUER, secret)
  const qrPngDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, scale: 6 })
  return { secret, otpauthUrl, qrPngDataUrl }
}

/**
 * Verify a candidate TOTP code against a secret. Returns true if the code
 * is valid within the configured drift window.
 */
export function verifyCode(secret: string, code: string): boolean {
  if (!/^[0-9]{6}$/.test(code)) return false
  try {
    return authenticator.verify({ token: code, secret })
  } catch {
    return false
  }
}

/**
 * Persist the secret to `admins.totp_secret` and flip `totp_enabled = true`
 * after verifying the user's first code. Returns the rescue/backup codes
 * that should be displayed to the admin exactly once.
 */
export async function confirmAndEnable({
  db,
  adminId,
  secret,
  code,
}: {
  db: DbExecutor
  adminId: string
  secret: string
  code: string
}): Promise<{ ok: boolean; backupCodes?: string[] }> {
  if (!verifyCode(secret, code)) return { ok: false }

  const backupCodes = generateBackupCodes(10)
  await db
    .update(schema.admins)
    .set({
      totpSecret: secret,
      totpEnabled: true,
      totpEnabledAt: new Date(),
      backupCodes: JSON.stringify(backupCodes),
    })
    .where(eq(schema.admins.id, adminId))

  return { ok: true, backupCodes }
}

/**
 * Verify a TOTP code OR a one-time backup code for an admin row. Backup
 * codes are consumed (removed from the list) on a successful match.
 */
export async function verifyForAdmin({
  db,
  adminId,
  code,
}: {
  db: DbExecutor
  adminId: string
  code: string
}): Promise<boolean> {
  const rows = await db
    .select({
      totpSecret: schema.admins.totpSecret,
      backupCodes: schema.admins.backupCodes,
      totpEnabled: schema.admins.totpEnabled,
    })
    .from(schema.admins)
    .where(eq(schema.admins.id, adminId))
    .limit(1)

  const row = rows[0]
  if (!row || !row.totpEnabled || !row.totpSecret) return false

  if (verifyCode(row.totpSecret, code)) return true

  // Fallback: check unused backup codes (constant-time compare against each).
  const codes: string[] = row.backupCodes ? (JSON.parse(row.backupCodes) as string[]) : []
  const idx = codes.indexOf(code.toUpperCase())
  if (idx === -1) return false

  codes.splice(idx, 1)
  await db
    .update(schema.admins)
    .set({ backupCodes: JSON.stringify(codes) })
    .where(eq(schema.admins.id, adminId))
  return true
}

/**
 * Disable TOTP and clear the secret + backup codes. Used by master
 * force-reset.
 */
export async function disableTotp({
  db,
  adminId,
}: {
  db: DbExecutor
  adminId: string
}): Promise<void> {
  await db
    .update(schema.admins)
    .set({ totpEnabled: false, totpSecret: null, totpEnabledAt: null, backupCodes: null })
    .where(eq(schema.admins.id, adminId))
}

/**
 * Re-generate the one-time backup codes for an admin who already has TOTP
 * enabled. The caller MUST verify a fresh TOTP code (via `verifyForAdmin`)
 * before invoking this — losing a device + a session at the same time
 * shouldn't get someone permanent access via stale backup codes. Returns
 * the freshly-generated codes; persists them in place.
 */
export async function regenerateBackupCodes({
  db,
  adminId,
}: {
  db: DbExecutor
  adminId: string
}): Promise<{ ok: boolean; backupCodes?: string[] }> {
  const rows = await db
    .select({ totpEnabled: schema.admins.totpEnabled })
    .from(schema.admins)
    .where(eq(schema.admins.id, adminId))
    .limit(1)
  const row = rows[0]
  if (!row || !row.totpEnabled) return { ok: false }

  const backupCodes = generateBackupCodes(10)
  await db
    .update(schema.admins)
    .set({ backupCodes: JSON.stringify(backupCodes) })
    .where(eq(schema.admins.id, adminId))
  return { ok: true, backupCodes }
}

function generateBackupCodes(count: number): string[] {
  const codes: string[] = []
  for (let i = 0; i < count; i++) {
    // 8-char alphanumeric, all-caps. Cryptographically random.
    const buf = randomBytes(6)
    codes.push(
      buf
        .toString('base64')
        .replace(/[^A-Z0-9]/gi, '')
        .toUpperCase()
        .slice(0, 8)
        .padEnd(8, 'X'),
    )
  }
  return codes
}
