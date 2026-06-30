/* eslint-disable no-console */
/**
 * Bootstrap-admin seed script (docs/03 §17 step 27, docs/09).
 *
 * Creates the very first admin user (Master role) so the founder can sign in.
 * Idempotent on email: if the admin already exists nothing happens.
 *
 * Required env vars (only for this run):
 *   DATABASE_URL_DIRECT   - non-pooled Neon connection (preferred) or DATABASE_URL
 *   BOOTSTRAP_ADMIN_EMAIL - email address for the master admin
 *   BOOTSTRAP_ADMIN_PASSWORD - temporary password (will be bcrypt-hashed)
 *   BOOTSTRAP_ADMIN_NAME  - optional display name (defaults to the email local-part)
 *
 * The admin is created with status='active' and assigned the 'master' role.
 * The user MUST rotate the password on first login and enable TOTP per
 * docs/09 §5.2.
 */

import bcrypt from 'bcryptjs'
import postgres from 'postgres'

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD
  const displayName = process.env.BOOTSTRAP_ADMIN_NAME ?? (email ? email.split('@')[0] : undefined)

  if (!connectionString) {
    console.error('ERROR: DATABASE_URL_DIRECT (preferred) or DATABASE_URL must be set.')
    process.exit(1)
  }
  if (!email) {
    console.error('ERROR: BOOTSTRAP_ADMIN_EMAIL must be set.')
    process.exit(1)
  }
  if (!password) {
    console.error('ERROR: BOOTSTRAP_ADMIN_PASSWORD must be set.')
    process.exit(1)
  }
  if (!displayName) {
    console.error('ERROR: BOOTSTRAP_ADMIN_NAME could not be derived; pass it explicitly.')
    process.exit(1)
  }

  const sql = postgres(connectionString, {
    max: 1,
    prepare: false,
    onnotice: () => {},
  })

  try {
    const passwordHash = await bcrypt.hash(password, 12)

    await sql.begin(async (tx) => {
      const existing = await tx<{ id: string }[]>`
        SELECT id FROM admins WHERE lower(email) = lower(${email})
      `

      let adminId: string
      if (existing.length > 0) {
        adminId = existing[0]!.id
        console.log(`Admin already exists for ${email} (id=${adminId}); skipping insert.`)
      } else {
        const [row] = await tx<{ id: string }[]>`
          INSERT INTO admins (email, display_name, password_hash, status)
          VALUES (${email}, ${displayName}, ${passwordHash}, 'active')
          RETURNING id
        `
        adminId = row!.id
        console.log(`Created admin ${email} (id=${adminId})`)
      }

      const [roleRow] = await tx<{ id: string }[]>`
        SELECT id FROM admin_roles WHERE slug = 'master'
      `
      if (!roleRow) {
        throw new Error("Master role not found — run 'pnpm db:migrate' first.")
      }
      const roleId = roleRow.id

      await tx`
        INSERT INTO admin_role_assignments (admin_id, role_id)
        VALUES (${adminId}, ${roleId})
        ON CONFLICT (admin_id, role_id) DO NOTHING
      `
      console.log(`Assigned 'master' role to ${email}.`)

      await tx`
        INSERT INTO audit_log (actor_kind, actor_id, action, resource_kind, resource_id, reason, metadata)
        VALUES (
          'system',
          NULL,
          'admin.bootstrap_created',
          'admin',
          ${adminId}::uuid,
          'Bootstrap master admin created via seed-admin.ts',
          jsonb_build_object('email', ${email}::text)
        )
      `
    })

    console.log('\nDone. First login: rotate password and enable TOTP per docs/09 §5.2.')
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((err) => {
  console.error('Bootstrap admin seed failed:', err)
  process.exit(1)
})
