import { randomUUID } from 'node:crypto'

import { and, eq, sql } from 'drizzle-orm'

import { schema, type DbExecutor, type DbTransaction } from '@coinfrenzy/db'
import type { Currency } from '@coinfrenzy/config'
import { isCurrency } from '@coinfrenzy/config'

import {
  actorIdFor,
  actorKindFor,
  actorRoleFor,
  createAfterCommitQueue,
  type Context,
} from '../context'
import { err, ok, type Result } from '../errors/result'

import { assertBalanced } from './balanced'
import type { LedgerError } from './errors'
import { invalidateBalanceCache } from './balance'
import { getHouseAccountId, isHouseAccount } from './house-accounts'
import { bigintToNumericString } from './money'
import type {
  EntrySpec,
  InsertedLedgerEntry,
  LedgerAccountKind,
  LedgerSource,
  LedgerWriteResult,
  SubBucket,
  TransactionSpec,
} from './types'

// docs/04 §4 — the exact write path. 8 steps, serializable isolation,
// idempotent on (source, source_id), atomic across all entries.
//
// Implementation notes:
//   1. We open the transaction with `set transaction isolation level
//      serializable`. drizzle-orm/postgres-js wraps `db.transaction` but
//      does NOT yet support per-call isolation, so we set it manually via
//      raw SQL inside the transaction body.
//   2. RLS: we set app.actor_* via set_config so policies pick up ctx.actor.
//   3. Step 6 mutates `balance_after` only — this is the carved-out column
//      allowed by the immutability trigger (see docs/04 §4 + 0003_triggers).
//   4. Step 7 (Redis invalidation) is queued via afterCommit so we only
//      invalidate on success; rollbacks leave the cache untouched.
//   5. Postgres serialization_failure surfaces as code '40001'; we translate
//      it to a typed LedgerError and let the retry helper handle the loop.

const SERIALIZATION_FAILURE = '40001'

export interface WriteOptions {
  isolationLevel?: 'serializable' | 'read_committed'
  skipCacheInvalidation?: boolean
  flushLocalAfterCommit?: boolean
  dedupLookbackDays?: number
}

export async function write(
  ctx: Context,
  spec: TransactionSpec,
  options: WriteOptions = {},
): Promise<Result<LedgerWriteResult, LedgerError>> {
  // Step 3 — validate balance before any DB work. Cheap; surfaces
  // programming bugs without a DB round-trip.
  const balanced = assertBalanced(spec)
  if (!balanced.ok) return balanced

  // Local afterCommit collector — we only fire these on commit success.
  const localQueue = createAfterCommitQueue(ctx.logger)

  const txCtxBase: Context = {
    ...ctx,
    afterCommit: localQueue.push,
  }

  try {
    const startTxRun = performance.now()
    const result = await runTransaction(ctx.db, async (tx) => {
      const txCtx: Context = { ...txCtxBase, db: tx }

      // Step 1 — escalate to serializable + set RLS actor context.
      const isolationLevel = options.isolationLevel ?? 'serializable'
      const startIsolation = performance.now()
      await tx.execute(
        sql.raw(
          isolationLevel === 'serializable'
            ? 'set transaction isolation level serializable'
            : 'set transaction isolation level read committed',
        ),
      )
      ctx.logger.info('alea_timing_log', {
        step: 'tx_isolation_level_set',
        elapsedMs: performance.now() - startIsolation,
      })

      // Collapse multiple set_config calls into a single query to save round-trips.
      const startRls = performance.now()
      const role = actorRoleFor(ctx.actor)
      if (role) {
        await tx.execute(
          sql`select set_config('app.actor_id', ${actorIdFor(ctx.actor)}, true), set_config('app.actor_kind', ${actorKindFor(ctx.actor)}, true), set_config('app.actor_role', ${role}, true)`,
        )
      } else {
        await tx.execute(
          sql`select set_config('app.actor_id', ${actorIdFor(ctx.actor)}, true), set_config('app.actor_kind', ${actorKindFor(ctx.actor)}, true)`,
        )
      }
      ctx.logger.info('alea_timing_log', {
        step: 'tx_rls_config_set',
        elapsedMs: performance.now() - startRls,
      })

      // Step 2 — dedupe via (source, source_id). The dedup index is per-leg
      // (must include the partition key) so we ALSO trust the application
      // check here; the DB unique index is the safety net for true races.
      // Use partition pruning hint if dedupLookbackDays is supplied.
      const startDedup = performance.now()
      const existing = await tx
        .select({ id: schema.ledgerEntries.id })
        .from(schema.ledgerEntries)
        .where(
          and(
            eq(schema.ledgerEntries.source, spec.source),
            eq(schema.ledgerEntries.sourceId, spec.sourceId),
            options.dedupLookbackDays
              ? sql`created_at >= now() - ${options.dedupLookbackDays} * interval '1 day'`
              : sql`true`,
          ),
        )
        .limit(1)
      ctx.logger.info('alea_timing_log', {
        step: 'tx_deduplication_check',
        elapsedMs: performance.now() - startDedup,
      })

      if (existing.length > 0) {
        return ok<LedgerWriteResult>({ status: 'duplicate', noop: true })
      }

      const startResolve = performance.now()
      const resolved = await resolveAccounts(txCtx, spec)
      ctx.logger.info('alea_timing_log', {
        step: 'tx_resolve_accounts',
        elapsedMs: performance.now() - startResolve,
      })
      if (!resolved.ok) return resolved

      const pairId = randomUUID()

      // Step 4 — insert all entries atomically. We do this in one round
      // trip via Drizzle's bulk insert; postgres-js binds the prepared
      // statement; the immutability trigger never fires on insert.
      const rowsToInsert = resolved.value.map((entry) => ({
        source: spec.source,
        sourceId: spec.sourceId,
        idempotencyKey: spec.idempotencyKey ?? null,
        pairId,
        leg: entry.leg,
        accountKind: entry.accountKind,
        accountId: entry.accountId,
        amount: entry.amount,
        currency: entry.currency,
        subBucket: entry.subBucket ?? null,
        playerId: entry.playerId ?? null,
        metadata: { ...(spec.metadata ?? {}), ...(entry.metadata ?? {}) },
      }))

      const startLedgerInsert = performance.now()
      const inserted = await tx.insert(schema.ledgerEntries).values(rowsToInsert).returning()
      ctx.logger.info('alea_timing_log', {
        step: 'tx_ledger_insert_bulk',
        elapsedMs: performance.now() - startLedgerInsert,
      })

      // Step 5 — update player wallets atomically (same tx).
      const walletDeltas = computeWalletDeltas(resolved.value)
      for (const delta of walletDeltas) {
        const startWalletDelta = performance.now()
        const updated = await applyWalletDelta(tx, delta)
        ctx.logger.info('alea_timing_log', {
          step: 'tx_apply_wallet_delta',
          playerId: delta.playerId,
          currency: delta.currency,
          elapsedMs: performance.now() - startWalletDelta,
        })
        if (!updated.ok) return updated
      }

      // Step 6 — write balance_after onto each player_wallet entry. The
      // immutability trigger permits exactly this UPDATE (see docs/04 §4).
      // Optimise by combining select and update into a single subquery query.
      for (const row of inserted) {
        if (row.accountKind !== 'player_wallet') continue
        const startBalanceAfterUpdate = performance.now()
        const updateResult = await tx
          .update(schema.ledgerEntries)
          .set({
            balanceAfter: sql`(select current_balance from ${schema.wallets} where id = ${row.accountId})`,
          })
          .where(
            and(
              eq(schema.ledgerEntries.id, row.id),
              eq(schema.ledgerEntries.createdAt, row.createdAt),
            ),
          )
          .returning({ balanceAfter: schema.ledgerEntries.balanceAfter })
        ctx.logger.info('alea_timing_log', {
          step: 'tx_balance_after_update',
          ledgerEntryId: row.id,
          elapsedMs: performance.now() - startBalanceAfterUpdate,
        })
        row.balanceAfter = updateResult[0]?.balanceAfter ?? null
      }

      const entries: InsertedLedgerEntry[] = inserted.map((row) => ({
        id: row.id,
        source: row.source as LedgerSource,
        sourceId: row.sourceId,
        pairId: row.pairId,
        leg: row.leg,
        accountKind: row.accountKind as LedgerAccountKind,
        accountId: row.accountId,
        amount: row.amount as unknown as bigint,
        currency: (isCurrency(row.currency) ? row.currency : 'SC') as Currency,
        subBucket: (row.subBucket as SubBucket | null) ?? null,
        playerId: row.playerId,
        balanceAfter: (row.balanceAfter as unknown as bigint | null) ?? null,
        createdAt: row.createdAt,
      }))

      // Step 7 — queue Redis invalidation. ledger.write() owns its own
      // afterCommit list so the invalidate only runs if commit succeeds.
      // Only coin currencies (GC/SC) have wallet rows + a Redis snapshot.
      if (spec.playerId && !options.skipCacheInvalidation) {
        const playerId = spec.playerId
        const coinCurrencies = new Set<'GC' | 'SC'>()
        for (const entry of entries) {
          if (entry.accountKind !== 'player_wallet') continue
          if (entry.currency === 'GC' || entry.currency === 'SC') {
            coinCurrencies.add(entry.currency)
          }
        }
        if (coinCurrencies.size > 0) {
          localQueue.push(async () => {
            for (const currency of coinCurrencies) {
              await invalidateBalanceCache(playerId, currency)
            }
          })
          // Also forward to the outer ctx queue so the transport (HTTP
          // route) can chain its own post-commit work.
          ctx.afterCommit(async () => {
            for (const currency of coinCurrencies) {
              await invalidateBalanceCache(playerId, currency)
            }
          })
        }
      }

      return ok<LedgerWriteResult>({ status: 'written', pairId, entries })
    })
    ctx.logger.info('alea_timing_log', {
      step: 'ledger_transaction_duration',
      elapsedMs: performance.now() - startTxRun,
    })

    if (result.ok && (options.flushLocalAfterCommit ?? true)) {
      // Step 7 — drain local hooks on successful commit.
      const startQueueFlush = performance.now()
      await localQueue.flush()
      ctx.logger.info('alea_timing_log', {
        step: 'ledger_after_commit_queue_flush',
        elapsedMs: performance.now() - startQueueFlush,
      })
    }
    return result
  } catch (e) {
    return mapPostgresError(e)
  }
}

// --- helpers ---------------------------------------------------------------

interface ResolvedEntry extends EntrySpec {
  accountId: string
}

async function resolveAccounts(
  ctx: Context,
  spec: TransactionSpec,
): Promise<Result<ResolvedEntry[], LedgerError>> {
  const out: ResolvedEntry[] = []
  for (const entry of spec.entries) {
    if (entry.accountId) {
      out.push({ ...entry, accountId: entry.accountId })
      continue
    }
    if (entry.accountKind === 'player_wallet') {
      if (!entry.playerId) {
        return err({
          code: 'invalid_entry',
          reason: 'player_wallet entry missing playerId',
        })
      }
      if (entry.currency !== 'GC' && entry.currency !== 'SC') {
        return err({
          code: 'invalid_entry',
          reason: `player_wallet entry has non-coin currency ${entry.currency}`,
        })
      }
      const walletRows = await ctx.db
        .select({ id: schema.wallets.id })
        .from(schema.wallets)
        .where(
          and(
            eq(schema.wallets.playerId, entry.playerId),
            eq(schema.wallets.currency, entry.currency),
          ),
        )
        .limit(1)
      if (walletRows.length === 0) {
        return err({
          code: 'wallet_not_found',
          playerId: entry.playerId,
          currency: entry.currency,
        })
      }
      out.push({ ...entry, accountId: walletRows[0]!.id })
      continue
    }
    if (entry.accountKind === 'pending_purchase' || entry.accountKind === 'pending_redemption') {
      if (!entry.playerId) {
        return err({
          code: 'invalid_entry',
          reason: `${entry.accountKind} entry missing playerId`,
        })
      }
      // Pending-state pseudo-accounts: account_id = players.id.
      out.push({ ...entry, accountId: entry.playerId })
      continue
    }
    if (isHouseAccount(entry.accountKind)) {
      const houseId = await getHouseAccountId(ctx, entry.accountKind, entry.currency)
      if (!houseId.ok) return houseId
      out.push({ ...entry, accountId: houseId.value })
      continue
    }
    return err({
      code: 'invalid_entry',
      reason: `cannot resolve account_id for kind=${entry.accountKind}`,
    })
  }
  return ok(out)
}

interface WalletDelta {
  playerId: string
  currency: Currency
  bySubBucket: Map<SubBucket, bigint>
  netCurrent: bigint
}

function computeWalletDeltas(entries: ResolvedEntry[]): WalletDelta[] {
  const grouped = new Map<string, WalletDelta>()
  for (const entry of entries) {
    if (entry.accountKind !== 'player_wallet') continue
    if (entry.currency !== 'GC' && entry.currency !== 'SC') continue
    if (!entry.playerId) continue
    if (!entry.subBucket) {
      // Defensive: every player_wallet entry must specify a sub_bucket
      // (the wallet table has 4 buckets that must sum to current_balance).
      throw new Error(
        `player_wallet entry missing sub_bucket (player=${entry.playerId}, currency=${entry.currency})`,
      )
    }
    const key = `${entry.playerId}:${entry.currency}`
    let delta = grouped.get(key)
    if (!delta) {
      delta = {
        playerId: entry.playerId,
        currency: entry.currency,
        bySubBucket: new Map(),
        netCurrent: 0n,
      }
      grouped.set(key, delta)
    }
    const signed = entry.leg === 'credit' ? entry.amount : -entry.amount
    delta.bySubBucket.set(entry.subBucket, (delta.bySubBucket.get(entry.subBucket) ?? 0n) + signed)
    delta.netCurrent += signed
  }
  return [...grouped.values()]
}

async function applyWalletDelta(
  tx: DbTransaction,
  delta: WalletDelta,
): Promise<Result<true, LedgerError>> {
  // Build a single UPDATE that bumps every changed sub_bucket column AND
  // current_balance in one shot. The wallets table check constraint
  // `current_balance = purchased + bonus + promo + earned` is checked after
  // the row finishes mutating — so all four (plus current) must move
  // together.
  //
  // We use Drizzle's update().set() so the LHS is rendered as an
  // unqualified column name (PG rejects qualified LHS in SET).

  const setValues: Record<string, unknown> = {
    currentBalance: sql`${schema.wallets.currentBalance} + (${bigintToNumericString(delta.netCurrent)})::numeric(20,4)`,
    updatedAt: new Date(),
  }
  for (const [bucket, amount] of delta.bySubBucket) {
    if (amount === 0n) continue
    const key = walletFieldForBucket(bucket)
    setValues[key] =
      sql`${columnRefForBucket(bucket)} + (${bigintToNumericString(amount)})::numeric(20,4)`
  }

  const result = await tx
    .update(schema.wallets)
    .set(
      setValues as Parameters<typeof tx.update>[0] extends never ? never : Record<string, unknown>,
    )
    .where(
      and(eq(schema.wallets.playerId, delta.playerId), eq(schema.wallets.currency, delta.currency)),
    )
    .returning({ id: schema.wallets.id })

  if (result.length === 0) {
    return err({
      code: 'wallet_not_found',
      playerId: delta.playerId,
      currency: delta.currency,
    })
  }
  return ok(true)
}

function walletFieldForBucket(bucket: SubBucket): string {
  switch (bucket) {
    case 'purchased':
      return 'balancePurchased'
    case 'bonus':
      return 'balanceBonus'
    case 'promo':
      return 'balancePromo'
    case 'earned':
      return 'balanceEarned'
  }
}

function columnRefForBucket(bucket: SubBucket) {
  switch (bucket) {
    case 'purchased':
      return schema.wallets.balancePurchased
    case 'bonus':
      return schema.wallets.balanceBonus
    case 'promo':
      return schema.wallets.balancePromo
    case 'earned':
      return schema.wallets.balanceEarned
  }
}

async function runTransaction<T>(
  db: DbExecutor,
  fn: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  // drizzle-orm/postgres-js exposes `.transaction` on both the pooled client
  // and on an open transaction (nested -> savepoint). Either is fine for us.
  // We cast through `unknown` to a minimal shape because DbClient and
  // DbTransaction expose `.transaction` with slightly different generics.
  type Txable = { transaction: (cb: (tx: DbTransaction) => Promise<T>) => Promise<T> }
  return (db as unknown as Txable).transaction(fn)
}

function mapPostgresError(e: unknown): Result<never, LedgerError> {
  if (typeof e === 'object' && e !== null) {
    const maybe = e as { code?: string; message?: string }
    if (maybe.code === SERIALIZATION_FAILURE) {
      return err({ code: 'serialization_failure' })
    }
    return err({ code: 'database_error', detail: maybe.message ?? String(e) })
  }
  return err({ code: 'database_error', detail: String(e) })
}
