/* eslint-disable no-console */
/**
 * Custom SQL migration runner.
 *
 * Why custom rather than drizzle-kit migrate?
 * - We have hand-written follow-on migrations (partitions, triggers, RLS) that
 *   are not produced by drizzle-kit generate. Drizzle's migrator expects a
 *   matching snapshot for each migration, which we don't have for these.
 * - We use DATABASE_URL_DIRECT (non-pooled) here. The pooler does not allow
 *   long-running DDL such as PARTITION BY / CREATE POLICY.
 *
 * Behavior:
 * 1. Connect via DATABASE_URL_DIRECT.
 * 2. Ensure a `_app_migrations(name text primary key, applied_at timestamptz)`
 *    table exists.
 * 3. List every *.sql file in src/migrations/, sorted lexicographically.
 * 4. For each file not yet recorded, split on `--> statement-breakpoint`,
 *    execute statements inside a single transaction, then record the name.
 *
 * Re-running this script is safe: applied migrations are skipped.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import postgres from 'postgres'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const MIGRATIONS_DIR = join(__dirname, 'migrations')
const STATEMENT_BREAKPOINT = '--> statement-breakpoint'

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL
  if (!connectionString) {
    console.error('ERROR: DATABASE_URL_DIRECT (preferred) or DATABASE_URL must be set.')
    process.exit(1)
  }

  const statusOnly = process.argv.includes('--status')

  const sql = postgres(connectionString, {
    max: 1,
    prepare: false,
    onnotice: () => {},
  })

  try {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "_app_migrations" (
        name        text primary key,
        applied_at  timestamptz not null default now()
      );
    `)

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    const appliedRows = await sql<{ name: string }[]>`
      SELECT name FROM "_app_migrations"
    `
    const applied = new Set(appliedRows.map((r) => r.name))

    if (statusOnly) {
      let pending = 0
      for (const file of files) {
        if (applied.has(file)) {
          console.log(`  applied  ${file}`)
        } else {
          console.log(`  PENDING  ${file}`)
          pending += 1
        }
      }
      console.log(`\n${pending} pending migration(s).`)
      return
    }

    let appliedCount = 0
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`  skip   ${file} (already applied)`)
        continue
      }

      console.log(`  apply  ${file}`)
      const fullPath = join(MIGRATIONS_DIR, file)
      const content = readFileSync(fullPath, 'utf8')

      const statements = content
        .split(STATEMENT_BREAKPOINT)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)

      await sql.begin(async (tx) => {
        for (const stmt of statements) {
          await tx.unsafe(stmt)
        }
        await tx`INSERT INTO "_app_migrations" (name) VALUES (${file})`
      })
      appliedCount += 1
    }

    if (appliedCount === 0) {
      console.log('No new migrations to apply.')
    } else {
      console.log(`\nApplied ${appliedCount} migration(s).`)
    }
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
