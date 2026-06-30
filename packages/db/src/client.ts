import { sql, type ExtractTablesWithRelations } from 'drizzle-orm'
import {
  drizzle,
  type PostgresJsDatabase,
  type PostgresJsTransaction,
} from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { env } from '@coinfrenzy/config'

import * as schema from './schema/index'

// Pooled Postgres-js client. Per docs/02 §3, docs/04, and docs/03 §19:
//   - All app traffic goes through this single client (transaction-aware).
//   - For drizzle-kit migrations we use DATABASE_URL_DIRECT (non-pooled).

export type Schema = typeof schema
export type DbClient = PostgresJsDatabase<Schema>
export type DbTransaction = PostgresJsTransaction<Schema, ExtractTablesWithRelations<Schema>>
export type DbExecutor = DbClient | DbTransaction

export type ActorKind = 'player' | 'admin' | 'system'

const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined
  db: DbClient | undefined
}

function getConnectionUrl(): string {
  const { DATABASE_URL } = env()
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is not set — cannot create database client')
  }
  return DATABASE_URL
}

export function getSql(): postgres.Sql {
  if (globalForDb.conn) return globalForDb.conn
  globalForDb.conn = postgres(getConnectionUrl(), {
    max: 20,
    idle_timeout: 30,
    connect_timeout: 10,
    prepare: false,
  })
  return globalForDb.conn
}

export function getDb(): DbClient {
  if (globalForDb.db) return globalForDb.db
  globalForDb.db = drizzle(getSql(), { schema })
  return globalForDb.db
}

/**
 * Wrap a callback in a transaction that sets the per-request actor context
 * variables used by RLS policies (see docs/09 §4.1).
 *
 * `SET LOCAL` scopes the variables to the transaction, so they are cleared
 * automatically on commit or rollback — no leakage between requests sharing
 * the same pool connection.
 */
export async function withActor<T>(
  actorId: string,
  actorKind: ActorKind,
  actorRole: string | null,
  fn: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  const db = getDb()
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.actor_id', ${actorId}, true)`)
    await tx.execute(sql`select set_config('app.actor_kind', ${actorKind}, true)`)
    if (actorRole) {
      await tx.execute(sql`select set_config('app.actor_role', ${actorRole}, true)`)
    }
    return fn(tx)
  })
}

/**
 * Close the pool. Call from worker shutdown handlers and migration scripts.
 */
export async function closeDb(): Promise<void> {
  if (globalForDb.conn) {
    await globalForDb.conn.end({ timeout: 5 })
    globalForDb.conn = undefined
    globalForDb.db = undefined
  }
}
