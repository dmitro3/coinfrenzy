import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'

import { write as ledgerWrite } from '../write'
import { buildBet, buildBonusAward, buildPurchase, buildWin } from '../transactions'
import { reconcileWallets } from '../reconcile'
import { _clearHouseAccountCacheForTests } from '../house-accounts'
import { clearRedis } from '../redis'
import { invalidateBalanceCache } from '../balance'
import { numericStringToBigint } from '../money'

import {
  countLedgerEntries,
  createTestPlayer,
  getWallet,
  makeCtx,
  seedPlayerBalance,
  startTestDb,
  type TestDb,
  type TestPlayer,
} from './setup'

// docs/04 §10.1 — three property-based invariants:
//   1) Every transaction balances per currency
//   2) Writing the same spec twice produces ONE transaction (idempotency)
//   3) Wallet balance always equals ledger sum after any write sequence

let testDb: TestDb
const skipReason = describeWhySkip()

beforeAll(async () => {
  if (skipReason) return
  testDb = await startTestDb()
  _clearHouseAccountCacheForTests()
  clearRedis()
}, 180_000)

afterAll(async () => {
  if (testDb) await testDb.close()
})

function describeWhySkip(): string | null {
  if (process.env.SKIP_INTEGRATION_TESTS === '1') {
    return 'SKIP_INTEGRATION_TESTS=1'
  }
  if (process.env.TEST_DATABASE_URL) return null
  // Testcontainers requires a Docker daemon. Detect its absence so we skip
  // cleanly instead of hanging for 60s waiting for a socket.
  const socketPaths = [
    '/var/run/docker.sock',
    `${process.env.HOME ?? ''}/.docker/run/docker.sock`,
    `${process.env.HOME ?? ''}/.colima/default/docker.sock`,
    `${process.env.HOME ?? ''}/.orbstack/run/docker.sock`,
  ]
  for (const path of socketPaths) {
    try {
      if (path && existsSync(path)) return null
    } catch {
      // ignore
    }
  }
  return 'no Docker socket and no TEST_DATABASE_URL — set one to run integration tests'
}

const describeOrSkip = skipReason ? describe.skip : describe

if (skipReason) {
  // eslint-disable-next-line no-console
  console.warn(`[integration tests] skipping: ${skipReason}`)
}

describeOrSkip('ledger property invariants (docs/04 §10.1)', () => {
  // Invariant 1 is covered by the unit tests in unit/balanced.test.ts. We
  // additionally check that any spec produced by a builder, when written
  // through write(), is accepted by Postgres (FK + check constraints hold).
  it('invariant 1: every built spec is accepted by the DB', async () => {
    const player = await createTestPlayer(testDb.sql)
    const { ctx } = makeCtx(testDb.db)

    const result = await ledgerWrite(ctx, {
      ...buildPurchase({
        finixTransferId: `tr-${randomUUID()}`,
        purchaseId: randomUUID(),
        playerId: player.id,
        amountUsd: 100_000n,
        gcAwarded: 1_000_000n,
        scSplit: { purchased: 50_000n, bonus: 25_000n, promo: 5_000n },
      }),
    })
    if (!result.ok) {
      throw new Error(`purchase write failed: ${JSON.stringify(result.error)}`)
    }
    expect(result.value.status).toBe('written')
  }, 60_000)

  // Invariant 2 — idempotency.
  it('invariant 2: writing the same spec twice produces one transaction', async () => {
    const player = await createTestPlayer(testDb.sql)
    const { ctx } = makeCtx(testDb.db)

    const finixId = `tr-${randomUUID()}`
    const spec = buildPurchase({
      finixTransferId: finixId,
      purchaseId: randomUUID(),
      playerId: player.id,
      amountUsd: 50_000n,
      gcAwarded: 200_000n,
      scSplit: { purchased: 20_000n, bonus: 10_000n, promo: 0n },
    })

    const first = await ledgerWrite(ctx, spec)
    const second = await ledgerWrite(ctx, spec)

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (first.ok) expect(first.value.status).toBe('written')
    if (second.ok) expect(second.value.status).toBe('duplicate')

    if (first.ok && first.value.status === 'written') {
      const entriesAfter = await countLedgerEntries(testDb.sql, 'purchase', finixId)
      expect(entriesAfter).toBe(first.value.entries.length)
    }
  }, 60_000)

  // Invariant 3 — wallet balance equals ledger sum after any write sequence.
  // We use a sequence of random bet/win/bonus_award operations against a
  // pre-seeded wallet and verify reconcileWallets reports clean.
  it('invariant 3: wallet == ledger sum after random sequences', async () => {
    const arbOp = fc.oneof(
      // bet: small SC amount the player can cover from purchased
      fc.record({
        kind: fc.constant('bet' as const),
        amount: fc.bigInt({ min: 1_000n, max: 5_000n }),
      }),
      // win: small SC amount into earned
      fc.record({
        kind: fc.constant('win' as const),
        amount: fc.bigInt({ min: 1_000n, max: 5_000n }),
      }),
      // bonus_award: small SC into bonus bucket
      fc.record({
        kind: fc.constant('bonus_award' as const),
        amount: fc.bigInt({ min: 1_000n, max: 5_000n }),
      }),
    )

    await fc.assert(
      fc.asyncProperty(fc.array(arbOp, { minLength: 1, maxLength: 6 }), async (ops) => {
        const player = await createTestPlayer(testDb.sql)
        // Pre-seed a big purchased balance so bets always cover.
        await seedPlayerBalance(testDb.sql, player.id, 'SC', { purchased: 1_000_000n })
        const { ctx } = makeCtx(testDb.db)
        await invalidateBalanceCache(player.id, 'SC')

        for (const op of ops) {
          await runOp(ctx, player, op)
        }

        const reconcileCtx = makeCtx(testDb.db).ctx
        const result = await reconcileWallets(reconcileCtx)
        if (!result.ok) {
          throw new Error(`reconcile failed: ${JSON.stringify(result.error)}`)
        }
        expect(result.value.status).toBe('clean')
      }),
      { numRuns: 8 }, // each run does a full DB cycle; keep small but meaningful
    )
  }, 180_000)
})

// --- helpers ---------------------------------------------------------------

type Op =
  | { kind: 'bet'; amount: bigint }
  | { kind: 'win'; amount: bigint }
  | { kind: 'bonus_award'; amount: bigint }

async function runOp(
  ctx: ReturnType<typeof makeCtx>['ctx'],
  player: TestPlayer,
  op: Op,
): Promise<void> {
  const id = `${op.kind}-${randomUUID()}`
  if (op.kind === 'bet') {
    const w = await getWalletBuckets(player)
    const { spec } = buildBet({
      roundId: id,
      playerId: player.id,
      currency: 'SC',
      amount: op.amount,
      buckets: w,
    })
    const r = await ledgerWrite(ctx, spec)
    if (!r.ok) throw new Error(`bet failed: ${JSON.stringify(r.error)}`)
  } else if (op.kind === 'win') {
    const spec = buildWin({
      roundId: id,
      playerId: player.id,
      currency: 'SC',
      amount: op.amount,
    })
    const r = await ledgerWrite(ctx, spec)
    if (!r.ok) throw new Error(`win failed: ${JSON.stringify(r.error)}`)
  } else {
    const spec = buildBonusAward({
      bonusAwardId: id,
      playerId: player.id,
      currency: 'SC',
      amount: op.amount,
    })
    const r = await ledgerWrite(ctx, spec)
    if (!r.ok) throw new Error(`bonus failed: ${JSON.stringify(r.error)}`)
  }
}

async function getWalletBuckets(player: TestPlayer): Promise<{
  purchased: bigint
  earned: bigint
  promo: bigint
  bonus: bigint
}> {
  const row = await getWallet(testDb.sql, player.id, 'SC')
  if (!row) throw new Error('no SC wallet for test player')
  return {
    purchased: numericStringToBigint(row.purchased),
    earned: numericStringToBigint(row.earned),
    promo: numericStringToBigint(row.promo),
    bonus: numericStringToBigint(row.bonus),
  }
}
