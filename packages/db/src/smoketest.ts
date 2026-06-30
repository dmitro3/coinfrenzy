/* eslint-disable no-console */
/**
 * One-off smoke test per prompts/02 §verification:
 * - INSERT a ledger_entries row → succeeds.
 * - UPDATE amount → must throw "Ledger entries are immutable except for balance_after".
 * - UPDATE balance_after → succeeds (the guard allows this column).
 * - DELETE → silently no-ops via the rule (zero rows removed; row still present).
 * - Final cleanup is impossible by design; the test row is left in place.
 *   We mark it with metadata={ smoketest: true } so it's easy to identify.
 */

import { randomUUID } from 'node:crypto'

import postgres from 'postgres'

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL
  if (!connectionString) {
    console.error('ERROR: DATABASE_URL_DIRECT or DATABASE_URL must be set.')
    process.exit(1)
  }

  const sql = postgres(connectionString, { max: 1, prepare: false, onnotice: () => {} })

  try {
    const pairId = randomUUID()
    const sourceId = `smoketest-${pairId}`
    const accountId = randomUUID()

    // 1) INSERT
    const inserted = await sql<{ id: string }[]>`
      INSERT INTO ledger_entries
        (source, source_id, pair_id, leg, account_kind, account_id, amount, currency, metadata)
      VALUES
        ('migration', ${sourceId}, ${pairId}::uuid, 'credit', 'external', ${accountId}::uuid,
         123.4500, 'SC', '{"smoketest": true}'::jsonb)
      RETURNING id
    `
    const id = inserted[0]!.id
    console.log(`INSERT ok: id=${id}`)

    // 2) UPDATE amount → should throw via guard
    try {
      await sql`UPDATE ledger_entries SET amount = 999.0000 WHERE source_id = ${sourceId}`
      console.error('UNEXPECTED: UPDATE amount succeeded (immutability guard not firing!)')
      process.exit(1)
    } catch (err) {
      const msg = (err as Error).message
      if (msg.includes('immutable')) {
        console.log(`UPDATE amount blocked as expected: "${msg}"`)
      } else {
        throw err
      }
    }

    // 3) UPDATE balance_after → should succeed (allowed column)
    await sql`UPDATE ledger_entries SET balance_after = 500.0000 WHERE source_id = ${sourceId}`
    const [{ balance_after }] = await sql<{ balance_after: string }[]>`
      SELECT balance_after::text FROM ledger_entries WHERE source_id = ${sourceId}
    `
    console.log(`UPDATE balance_after ok: stored=${balance_after}`)

    // 4) DELETE → rule silently no-ops
    const deleted = await sql`DELETE FROM ledger_entries WHERE source_id = ${sourceId}`
    console.log(`DELETE returned count=${deleted.count} (expected 0 — rule blocks deletes)`)

    const [{ still_present }] = await sql<{ still_present: bigint }[]>`
      SELECT count(*)::bigint AS still_present FROM ledger_entries WHERE source_id = ${sourceId}
    `
    console.log(`Row still present: ${still_present} (expected 1)`)

    if (Number(deleted.count) === 0 && Number(still_present) === 1) {
      console.log('\nAll ledger immutability checks PASSED.')
    } else {
      console.error('\nLedger immutability checks FAILED.')
      process.exit(1)
    }

    // 5) Bonus: audit_log no-update test
    const auditId = randomUUID()
    await sql`
      INSERT INTO audit_log (id, actor_kind, action, reason)
      VALUES (${auditId}::uuid, 'system', 'smoketest.audit', 'verifying audit immutability')
    `
    const auditUpd = await sql`
      UPDATE audit_log SET reason = 'changed' WHERE id = ${auditId}::uuid
    `
    console.log(`audit_log UPDATE returned count=${auditUpd.count} (expected 0 — rule blocks)`)
    const auditDel = await sql`DELETE FROM audit_log WHERE id = ${auditId}::uuid`
    console.log(`audit_log DELETE returned count=${auditDel.count} (expected 0 — rule blocks)`)

    if (Number(auditUpd.count) === 0 && Number(auditDel.count) === 0) {
      console.log('All audit immutability checks PASSED.')
    } else {
      console.error('Audit immutability checks FAILED.')
      process.exit(1)
    }
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((err) => {
  console.error('Smoke test failed:', err)
  process.exit(1)
})
