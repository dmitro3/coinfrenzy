/* eslint-disable no-console */
/**
 * One-shot dev helper to reset an admin's password and disable TOTP so the
 * operator can get back into the admin panel. NOT for production — there is
 * no policy gate, no rate limit, and no second factor required to invoke it.
 *
 * Required env:
 *   DATABASE_URL_DIRECT (preferred) or DATABASE_URL — non-pooled Neon URL
 *
 * Optional env (with sensible defaults):
 *   RESET_ADMIN_EMAIL     — admin to reset; defaults to the only active admin
 *                           if exactly one exists
 *   RESET_ADMIN_PASSWORD  — new plaintext password; defaults to
 *                           `coinfrenzy-temp-${random}` printed to stdout
 *
 * What it does, in one transaction:
 *   1. Bcrypt-hash the new password and update `admins.password_hash`.
 *   2. Set `totp_enabled=false`, clear `totp_secret`, `backup_codes`,
 *      `totp_enabled_at`.
 *   3. Revoke every active `admin_sessions` row for the admin so the old
 *      cookie can't keep working.
 *   4. Append an `audit_log` row (`admin.reset_via_script`) with a redacted
 *      summary — never the plaintext password.
 *
 * The plaintext password is printed to stdout exactly once. After running:
 *   - sign in at /admin/login with that password
 *   - rotate the password from /admin/account → Security
 *   - re-enable TOTP per docs/09 §5.2
 */

import { randomBytes } from 'node:crypto'

import bcrypt from 'bcryptjs'
import postgres from 'postgres'

interface AdminRow {
  id: string
  email: string
  display_name: string
  totp_enabled: boolean
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL
  if (!connectionString) {
    console.error('ERROR: DATABASE_URL_DIRECT or DATABASE_URL must be set.')
    process.exit(1)
  }

  const sql = postgres(connectionString, { max: 1, prepare: false, onnotice: () => {} })
  try {
    const targetEmail = process.env.RESET_ADMIN_EMAIL?.trim().toLowerCase() ?? null

    let admin: AdminRow
    if (targetEmail) {
      const rows = await sql<AdminRow[]>`
        SELECT id, email, display_name, totp_enabled
        FROM admins
        WHERE lower(email) = ${targetEmail} AND deleted_at IS NULL
        LIMIT 1
      `
      if (rows.length === 0) {
        console.error(`ERROR: no active admin found for email ${targetEmail}.`)
        process.exit(1)
      }
      admin = rows[0]!
    } else {
      const rows = await sql<AdminRow[]>`
        SELECT id, email, display_name, totp_enabled
        FROM admins
        WHERE deleted_at IS NULL
        ORDER BY created_at
      `
      if (rows.length === 0) {
        console.error('ERROR: no active admins exist. Run db:seed-admin first.')
        process.exit(1)
      }
      if (rows.length > 1) {
        console.error('ERROR: multiple active admins; pass RESET_ADMIN_EMAIL=<email> to choose.')
        for (const r of rows) console.error(`  - ${r.email}`)
        process.exit(1)
      }
      admin = rows[0]!
    }

    const newPassword =
      process.env.RESET_ADMIN_PASSWORD ?? `coinfrenzy-temp-${randomBytes(6).toString('hex')}`
    const passwordHash = await bcrypt.hash(newPassword, 12)

    let revokedSessions = 0
    await sql.begin(async (tx) => {
      await tx`
        UPDATE admins
        SET
          password_hash = ${passwordHash},
          password_set_at = now(),
          totp_secret = NULL,
          totp_enabled = false,
          totp_enabled_at = NULL,
          backup_codes = NULL,
          updated_at = now()
        WHERE id = ${admin.id}
      `

      const revoked = await tx<{ id: string }[]>`
        UPDATE admin_sessions
        SET revoked_at = now(), revoked_reason = 'password reset via reset-admin.ts'
        WHERE admin_id = ${admin.id} AND revoked_at IS NULL
        RETURNING id
      `
      revokedSessions = revoked.length

      await tx`
        INSERT INTO audit_log (actor_kind, actor_id, action, resource_kind, resource_id, reason, metadata)
        VALUES (
          'system',
          NULL,
          'admin.reset_via_script',
          'admin',
          ${admin.id}::uuid,
          'Password reset and TOTP cleared via reset-admin.ts',
          jsonb_build_object(
            'email', ${admin.email}::text,
            'totp_was_enabled', ${admin.totp_enabled}::boolean,
            'sessions_revoked', ${revokedSessions}::integer
          )
        )
      `
    })

    console.log('')
    console.log('  ╔══════════════════════════════════════════════════════════╗')
    console.log('  ║                  ADMIN RESET COMPLETE                    ║')
    console.log('  ╚══════════════════════════════════════════════════════════╝')
    console.log('')
    console.log(`    email:              ${admin.email}`)
    console.log(`    new password:       ${newPassword}`)
    console.log(`    TOTP:               disabled`)
    console.log(`    sessions revoked:   ${revokedSessions}`)
    console.log('')
    console.log('    Sign in at http://localhost:3000/admin/login then')
    console.log('    rotate the password and re-enable TOTP from /admin/account.')
    console.log('')
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((err) => {
  console.error('reset-admin failed:', err)
  process.exit(1)
})
