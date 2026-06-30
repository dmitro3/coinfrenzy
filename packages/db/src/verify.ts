/* eslint-disable no-console */
/**
 * One-off verification script. Counts tables, partitions, indexes, policies,
 * triggers, and confirms seeds + bootstrap admin. Safe to re-run.
 */

import postgres from 'postgres'

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL
  if (!connectionString) {
    console.error('ERROR: DATABASE_URL_DIRECT or DATABASE_URL must be set.')
    process.exit(1)
  }

  const sql = postgres(connectionString, {
    max: 1,
    prepare: false,
    onnotice: () => {},
  })

  try {
    const [{ table_count }] = await sql<{ table_count: bigint }[]>`
      SELECT count(*)::bigint AS table_count
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    `
    console.log(`Tables (public): ${table_count}`)

    const [{ partitioned_count }] = await sql<{ partitioned_count: bigint }[]>`
      SELECT count(*)::bigint AS partitioned_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'p' AND n.nspname = 'public'
    `
    console.log(`Partitioned parent tables: ${partitioned_count} (expected 4)`)

    const partitions = await sql<{ parent: string; count: bigint }[]>`
      SELECT inhparent::regclass::text AS parent, count(*)::bigint AS count
      FROM pg_inherits
      JOIN pg_class p ON p.oid = inhparent
      JOIN pg_namespace n ON n.oid = p.relnamespace
      WHERE n.nspname = 'public'
      GROUP BY inhparent
      ORDER BY parent
    `
    console.log('Partitions per parent:')
    for (const p of partitions) console.log(`  ${p.parent}: ${p.count}`)

    const [{ enum_count }] = await sql<{ enum_count: bigint }[]>`
      SELECT count(*)::bigint AS enum_count FROM pg_type WHERE typtype = 'e'
    `
    console.log(`Enums: ${enum_count} (expected 5)`)

    const [{ policy_count }] = await sql<{ policy_count: bigint }[]>`
      SELECT count(*)::bigint AS policy_count FROM pg_policies WHERE schemaname = 'public'
    `
    console.log(`RLS policies: ${policy_count}`)

    const [{ rls_enabled }] = await sql<{ rls_enabled: bigint }[]>`
      SELECT count(*)::bigint AS rls_enabled
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r','p') AND n.nspname = 'public' AND c.relrowsecurity = true
    `
    console.log(`Tables with RLS enabled: ${rls_enabled}`)

    const [{ trigger_count }] = await sql<{ trigger_count: bigint }[]>`
      SELECT count(*)::bigint AS trigger_count
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND NOT t.tgisinternal
    `
    console.log(`User triggers: ${trigger_count}`)

    const ledgerGuard = await sql<{ tgname: string }[]>`
      SELECT t.tgname FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      WHERE c.relname = 'ledger_entries' AND NOT t.tgisinternal
    `
    console.log(
      `ledger_entries triggers: ${ledgerGuard.map((r) => r.tgname).join(', ') || '(none)'}`,
    )

    const seeds = [
      { table: 'house_accounts', expected: 12 },
      { table: 'admin_roles', expected: 8 },
      { table: 'tiers', expected: 6 },
      { table: 'aggregators', expected: 1 },
      { table: 'integration_health', expected: 9 },
      { table: 'migration_column_mappings', expected: 11 },
    ]
    console.log('Seed counts:')
    for (const s of seeds) {
      const [{ count }] = await sql<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM ${sql(s.table)}
      `
      const ok = Number(count) === s.expected ? 'OK' : 'MISMATCH'
      console.log(`  ${s.table}: ${count} (expected ${s.expected}) ${ok}`)
    }

    const admins = await sql<
      {
        email: string
        display_name: string
        status: string
        role: string | null
      }[]
    >`
      SELECT a.email, a.display_name, a.status, r.slug AS role
      FROM admins a
      LEFT JOIN admin_role_assignments ara ON ara.admin_id = a.id
      LEFT JOIN admin_roles r ON r.id = ara.role_id
      ORDER BY a.created_at
    `
    console.log(`Admins (${admins.length}):`)
    for (const a of admins) {
      console.log(`  ${a.email} [${a.display_name}] status=${a.status} role=${a.role ?? '-'}`)
    }

    const bootstrapAudit = await sql<{ count: bigint }[]>`
      SELECT count(*)::bigint AS count FROM audit_log WHERE action = 'admin.bootstrap_created'
    `
    console.log(`Bootstrap audit_log rows: ${bootstrapAudit[0]?.count ?? 0}`)

    const [{ migration_count }] = await sql<{ migration_count: bigint }[]>`
      SELECT count(*)::bigint AS migration_count FROM _app_migrations
    `
    console.log(`Migrations recorded: ${migration_count} (expected 6)`)
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((err) => {
  console.error('Verify failed:', err)
  process.exit(1)
})
