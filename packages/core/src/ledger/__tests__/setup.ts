import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'

import { schema, type DbExecutor } from '@coinfrenzy/db'
import {
  consoleLogger,
  createAfterCommitQueue,
  noopLogger,
  type Actor,
  type Context,
} from '@coinfrenzy/core'

// Boot a real Postgres for integration tests, then re-run all our migrations
// against it so the property tests exercise the same schema+triggers+RLS
// the production DB has.
//
// Two paths:
//   1) TEST_DATABASE_URL env var pointing at an external Postgres -> use it.
//   2) Otherwise spin up Testcontainers (requires Docker).
//
// We bias to (1) for fast local iteration; (2) for CI/cold-boot per the
// prompt 03 requirement.

const MIGRATIONS_DIR = join(__dirname, '../../../../db/src/migrations')

export interface TestDb {
  url: string
  db: PostgresJsDatabase<typeof schema>
  sql: postgres.Sql
  close: () => Promise<void>
}

let container: StartedPostgreSqlContainer | undefined

export async function startTestDb(): Promise<TestDb> {
  const envUrl = process.env.TEST_DATABASE_URL
  if (envUrl) {
    return openDb(envUrl)
  }

  const image = process.env.TESTCONTAINERS_PG_IMAGE ?? 'postgres:16-alpine'
  container = await new PostgreSqlContainer(image).start()
  const url = container.getConnectionUri()
  const handle = await openDb(url)
  return {
    ...handle,
    close: async () => {
      await handle.close()
      await container?.stop()
      container = undefined
    },
  }
}

async function openDb(url: string): Promise<TestDb> {
  const sql = postgres(url, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 30,
    prepare: false,
  })
  await runMigrations(sql)
  const db = drizzle(sql, { schema })
  return {
    url,
    db,
    sql,
    close: async () => {
      await sql.end({ timeout: 5 })
    },
  }
}

async function runMigrations(sql: postgres.Sql): Promise<void> {
  if (!existsSync(MIGRATIONS_DIR)) {
    throw new Error(`migrations dir not found at ${MIGRATIONS_DIR}`)
  }
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of files) {
    const text = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    const statements = text
      .split(/-->\s*statement-breakpoint/m)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    for (const statement of statements) {
      try {
        await sql.unsafe(statement)
      } catch (e) {
        throw new Error(
          `migration ${file} failed:\n${statement.slice(0, 200)}\n→ ${
            e instanceof Error ? e.message : String(e)
          }`,
        )
      }
    }
  }
}

// ----- test-context helpers -------------------------------------------------

export function makeCtx(
  db: DbExecutor,
  options: { actor?: Actor; verbose?: boolean } = {},
): { ctx: Context; flush: () => Promise<void> } {
  const actor: Actor = options.actor ?? { kind: 'system', service: 'script', source: 'tests' }
  const queue = createAfterCommitQueue(options.verbose ? consoleLogger : noopLogger)
  const ctx: Context = {
    db,
    logger: options.verbose ? consoleLogger : noopLogger,
    actor,
    reqId: randomUUID(),
    afterCommit: queue.push,
  }
  return { ctx, flush: queue.flush }
}

// ----- fixture helpers ------------------------------------------------------

export interface TestPlayer {
  id: string
  email: string
  scWalletId: string
  gcWalletId: string
}

export async function createTestPlayer(
  sql: postgres.Sql,
  overrides: { email?: string } = {},
): Promise<TestPlayer> {
  const email = overrides.email ?? `test-${randomUUID()}@example.com`
  const [player] = await sql<{ id: string }[]>`
    insert into players (email, status, country)
    values (${email}, 'active', 'US')
    returning id
  `
  if (!player) throw new Error('failed to create test player')

  const [scWallet] = await sql<{ id: string }[]>`
    insert into wallets (player_id, currency, current_balance,
                         balance_purchased, balance_bonus, balance_promo, balance_earned)
    values (${player.id}, 'SC', 0, 0, 0, 0, 0)
    returning id
  `
  const [gcWallet] = await sql<{ id: string }[]>`
    insert into wallets (player_id, currency, current_balance,
                         balance_purchased, balance_bonus, balance_promo, balance_earned)
    values (${player.id}, 'GC', 0, 0, 0, 0, 0)
    returning id
  `
  return {
    id: player.id,
    email,
    scWalletId: scWallet!.id,
    gcWalletId: gcWallet!.id,
  }
}

export async function seedPlayerBalance(
  sql: postgres.Sql,
  playerId: string,
  currency: 'GC' | 'SC',
  buckets: { purchased?: bigint; earned?: bigint; promo?: bigint; bonus?: bigint },
): Promise<void> {
  const purchased = buckets.purchased ?? 0n
  const earned = buckets.earned ?? 0n
  const promo = buckets.promo ?? 0n
  const bonus = buckets.bonus ?? 0n
  const total = purchased + earned + promo + bonus
  // Direct UPDATE — bypasses ledger because this is fixture data. The
  // wallets sum check still applies, so we satisfy it.
  await sql`
    update wallets
       set balance_purchased = ${purchased.toString()}::numeric(20,4),
           balance_earned    = ${earned.toString()}::numeric(20,4),
           balance_promo     = ${promo.toString()}::numeric(20,4),
           balance_bonus     = ${bonus.toString()}::numeric(20,4),
           current_balance   = ${total.toString()}::numeric(20,4)
     where player_id = ${playerId}
       and currency  = ${currency}
  `
}

export async function getWallet(
  sql: postgres.Sql,
  playerId: string,
  currency: 'GC' | 'SC',
): Promise<{
  current: string
  purchased: string
  earned: string
  promo: string
  bonus: string
} | null> {
  const rows = await sql<
    {
      current_balance: string
      balance_purchased: string
      balance_earned: string
      balance_promo: string
      balance_bonus: string
    }[]
  >`
    select current_balance, balance_purchased, balance_earned, balance_promo, balance_bonus
    from wallets where player_id = ${playerId} and currency = ${currency}
  `
  if (rows.length === 0) return null
  const r = rows[0]!
  return {
    current: r.current_balance,
    purchased: r.balance_purchased,
    earned: r.balance_earned,
    promo: r.balance_promo,
    bonus: r.balance_bonus,
  }
}

export async function countLedgerEntries(
  sql: postgres.Sql,
  source: string,
  sourceId: string,
): Promise<number> {
  const rows = await sql<
    { count: string }[]
  >`select count(*)::text as count from ledger_entries where source = ${source} and source_id = ${sourceId}`
  return Number(rows[0]?.count ?? 0)
}
