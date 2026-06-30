import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

import { adapters, webhooks } from '../../index'
import {
  countLedgerEntries,
  createTestPlayer,
  getWallet,
  makeCtx,
  seedPlayerBalance,
  startTestDb,
  type TestDb,
  type TestPlayer,
} from '../../ledger/__tests__/setup'

// Mock Alea round.bet / round.win → ledger writes.
//
// Mirrors the Finix flow test: we seed an aggregator/provider/game row,
// then deliver a mock-signed round.bet and round.win pair through the
// real receiver. Asserts the bet drains the wallet and the win credits
// it back, with matching ledger pair_id grouping.

let testDb: TestDb
const skipReason = describeWhySkip()

beforeAll(async () => {
  if (skipReason) return
  testDb = await startTestDb()
}, 180_000)

afterAll(async () => {
  if (testDb) await testDb.close()
})

function describeWhySkip(): string | null {
  if (process.env.SKIP_INTEGRATION_TESTS === '1') return 'SKIP_INTEGRATION_TESTS=1'
  if (process.env.TEST_DATABASE_URL) return null
  const sockets = [
    '/var/run/docker.sock',
    `${process.env.HOME ?? ''}/.docker/run/docker.sock`,
    `${process.env.HOME ?? ''}/.colima/default/docker.sock`,
    `${process.env.HOME ?? ''}/.orbstack/run/docker.sock`,
  ]
  for (const s of sockets) {
    try {
      if (s && existsSync(s)) return null
    } catch {
      // ignore
    }
  }
  return 'no Docker daemon and no TEST_DATABASE_URL; integration tests skipped'
}

async function seedGameRow(sql: TestDb['sql']): Promise<{ gameId: string; externalId: string }> {
  const externalId = `mock-game-${randomUUID().slice(0, 8)}`
  const [aggregator] = await sql<{ id: string }[]>`
    insert into aggregators (slug, display_name)
    values ('test_alea', 'Test Alea')
    on conflict (slug) do update set display_name = excluded.display_name
    returning id
  `
  const [provider] = await sql<{ id: string }[]>`
    insert into game_providers (aggregator_id, slug, display_name)
    values (${aggregator!.id}, ${'test-provider-' + randomUUID().slice(0, 8)}, 'Test Provider')
    returning id
  `
  const [game] = await sql<{ id: string }[]>`
    insert into games
      (provider_id, slug, external_id, display_name, category)
    values
      (${provider!.id}, ${'mock-game-' + randomUUID().slice(0, 8)}, ${externalId}, 'Mock Game', 'slots')
    returning id
  `
  return { gameId: game!.id, externalId }
}

describe.skipIf(skipReason !== null)('mock Alea round flow → ledger writes', () => {
  it('processes round.bet and round.win with matched ledger entries', async () => {
    const player: TestPlayer = await createTestPlayer(testDb.sql)
    const { ctx } = makeCtx(testDb.db)
    const { gameId, externalId } = await seedGameRow(testDb.sql)

    // Open the casino session up-front so round.bet's session lookup hits.
    const sessionId = randomUUID()
    await testDb.sql`
      insert into game_sessions
        (id, player_id, game_id, currency, status, started_at)
      values
        (${sessionId}, ${player.id}, ${gameId}, 'GC', 'active', now())
    `

    // Stake the player so the bet drain has buckets to pull from.
    await seedPlayerBalance(testDb.sql, player.id, 'GC', { purchased: 1_000_000n })

    const handlers = webhooks.alea.buildAleaHandlers(ctx)
    const roundId = `round_${randomUUID().replace(/-/g, '').slice(0, 16)}`

    async function send(payload: Record<string, unknown>) {
      const rawBody = JSON.stringify(payload)
      const { signature, timestamp } = adapters.alea.signMockAleaBody(rawBody)
      const request = new Request('http://localhost/api/webhooks/alea/v1', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-alea-signature': signature,
          'x-alea-timestamp': timestamp,
        },
        body: rawBody,
      })
      return webhooks.receiveWebhook({
        ctx,
        provider: 'alea',
        request,
        adapter: {
          verifyWebhook: adapters.alea.verifyAleaWebhook,
          extractIdempotencyKey: adapters.alea.extractAleaIdempotencyKey,
          extractEventType: adapters.alea.extractAleaEventType,
        },
        onAfterPersist: async ({ pendingWebhookId }) => {
          await webhooks.dispatchPendingWebhook({
            db: ctx.db,
            provider: 'alea',
            pendingWebhookId,
            handlers,
          })
        },
      })
    }

    const betOutcome = await send({
      type: 'round.bet',
      eventId: `evt_bet_${randomUUID().slice(0, 8)}`,
      roundId,
      casinoSessionId: sessionId,
      playerId: player.id,
      gameId: externalId,
      amount: 100_000,
      currency: 'GC',
      timestamp: new Date().toISOString(),
    })
    expect(betOutcome.status).toBe(200)

    const winOutcome = await send({
      type: 'round.win',
      eventId: `evt_win_${randomUUID().slice(0, 8)}`,
      roundId,
      casinoSessionId: sessionId,
      playerId: player.id,
      gameId: externalId,
      amount: 250_000,
      currency: 'GC',
      timestamp: new Date().toISOString(),
    })
    expect(winOutcome.status).toBe(200)

    // Bet writes 'bet' entries; win writes 'win' entries.
    const betCount = await countLedgerEntries(testDb.sql, 'bet', roundId)
    expect(betCount).toBeGreaterThan(0)
    const winCount = await countLedgerEntries(testDb.sql, 'win', roundId)
    expect(winCount).toBeGreaterThan(0)

    // seedPlayerBalance writes 1_000_000 directly to numeric(20,4) → 1M GC.
    // Bet 100_000 minor units (10 GC), win 250_000 minor units (25 GC) →
    // wallet should net up by 15 GC over the seed.
    const gc = await getWallet(testDb.sql, player.id, 'GC')
    expect(Number(gc!.current)).toBeCloseTo(1_000_015, 1)
  })
})
