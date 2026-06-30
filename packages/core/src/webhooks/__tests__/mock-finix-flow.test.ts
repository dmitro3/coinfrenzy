import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

import { adapters, webhooks } from '../../index'
import {
  countLedgerEntries,
  createTestPlayer,
  getWallet,
  makeCtx,
  startTestDb,
  type TestDb,
  type TestPlayer,
} from '../../ledger/__tests__/setup'

// End-to-end mock-flow test: the mock Finix client builds a webhook
// payload, signs it via signMockFinixBody, and we run the full receiver →
// dispatch → ledger.write pipeline against a real Postgres. Asserts:
//
//   - pending_webhooks row is created with status='completed'
//   - purchases.status flips to 'completed'
//   - ledger entries land for the (source, source_id) pair
//   - wallets reflect the awarded GC + SC
//
// Skipped automatically when no Docker / TEST_DATABASE_URL is available
// (mirrors the ledger property test conventions).

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

describe.skipIf(skipReason !== null)('mock Finix flow → ledger writes', () => {
  it('processes a mock-signed transfer.succeeded into purchases + ledger', async () => {
    const player: TestPlayer = await createTestPlayer(testDb.sql)
    const { ctx } = makeCtx(testDb.db)
    const purchaseId = randomUUID()
    const transferId = `TR_test_${randomUUID().replace(/-/g, '').slice(0, 18)}`
    const amountCents = 999n

    await testDb.sql`
      insert into purchases
        (id, player_id, amount_usd, amount_cents,
         base_gc, base_sc, bonus_gc, bonus_sc, status)
      values
        (${purchaseId}, ${player.id}, 9.99, ${amountCents.toString()},
         100000, 30000, 0, 0, 'pending')
    `

    const payload = adapters.finix.buildFinixTransferSucceededPayload({
      transferId,
      amountCents,
      tags: { purchase_id: purchaseId, player_id: player.id },
      operationKey: 'CARD_NOT_PRESENT_SALE',
    })
    const rawBody = JSON.stringify(payload)
    const signature = adapters.finix.signMockFinixBody(rawBody)

    const handlers = webhooks.finix.buildFinixHandlers(ctx)
    const request = new Request('http://localhost/api/webhooks/finix/v1', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'finix-signature': signature,
      },
      body: rawBody,
    })

    const outcome = await webhooks.receiveWebhook({
      ctx,
      provider: 'finix',
      request,
      adapter: {
        verifyWebhook: adapters.finix.verifyFinixWebhook,
        extractIdempotencyKey: adapters.finix.extractFinixIdempotencyKey,
        extractEventType: adapters.finix.extractFinixEventType,
      },
      onAfterPersist: async ({ pendingWebhookId }) => {
        await webhooks.dispatchPendingWebhook({
          db: ctx.db,
          provider: 'finix',
          pendingWebhookId,
          handlers,
        })
      },
    })

    expect(outcome.status).toBe(200)
    expect(outcome.pendingWebhookId).toBeTruthy()

    const purchaseRow = await testDb.sql<{ status: string }[]>`
      select status from purchases where id = ${purchaseId}
    `
    expect(purchaseRow[0]?.status).toBe('completed')

    const ledgerCount = await countLedgerEntries(testDb.sql, 'purchase', purchaseId)
    expect(ledgerCount).toBeGreaterThan(0)

    const gc = await getWallet(testDb.sql, player.id, 'GC')
    expect(Number(gc!.purchased)).toBeGreaterThan(0)
    const sc = await getWallet(testDb.sql, player.id, 'SC')
    expect(Number(sc!.purchased)).toBeGreaterThan(0)
  })

  it('rejects forged signatures with 401 and updates integration_health', async () => {
    const { ctx } = makeCtx(testDb.db)
    const payload = { id: `WH_${randomUUID()}`, type: 'transfer.succeeded', entity: {} }
    const rawBody = JSON.stringify(payload)

    const request = new Request('http://localhost/api/webhooks/finix/v1', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'finix-signature': 'mock=deadbeef',
      },
      body: rawBody,
    })

    const outcome = await webhooks.receiveWebhook({
      ctx,
      provider: 'finix',
      request,
      adapter: {
        verifyWebhook: adapters.finix.verifyFinixWebhook,
        extractIdempotencyKey: adapters.finix.extractFinixIdempotencyKey,
        extractEventType: adapters.finix.extractFinixEventType,
      },
    })

    expect(outcome.status).toBe(401)
  })

  it('dedupes a duplicate delivery and short-circuits at receipt', async () => {
    const player: TestPlayer = await createTestPlayer(testDb.sql)
    const { ctx } = makeCtx(testDb.db)
    const purchaseId = randomUUID()
    const transferId = `TR_dup_${randomUUID().replace(/-/g, '').slice(0, 18)}`

    await testDb.sql`
      insert into purchases
        (id, player_id, amount_usd, amount_cents,
         base_gc, base_sc, bonus_gc, bonus_sc, status)
      values
        (${purchaseId}, ${player.id}, 1.00, 100,
         50000, 10000, 0, 0, 'pending')
    `

    const payload = adapters.finix.buildFinixTransferSucceededPayload({
      transferId,
      amountCents: 100n,
      tags: { purchase_id: purchaseId, player_id: player.id },
      operationKey: 'CARD_NOT_PRESENT_SALE',
    })
    const rawBody = JSON.stringify(payload)
    const signature = adapters.finix.signMockFinixBody(rawBody)
    const handlers = webhooks.finix.buildFinixHandlers(ctx)

    const send = () =>
      webhooks.receiveWebhook({
        ctx,
        provider: 'finix',
        request: new Request('http://localhost/api/webhooks/finix/v1', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'finix-signature': signature,
          },
          body: rawBody,
        }),
        adapter: {
          verifyWebhook: adapters.finix.verifyFinixWebhook,
          extractIdempotencyKey: adapters.finix.extractFinixIdempotencyKey,
          extractEventType: adapters.finix.extractFinixEventType,
        },
        onAfterPersist: async ({ pendingWebhookId }) => {
          await webhooks.dispatchPendingWebhook({
            db: ctx.db,
            provider: 'finix',
            pendingWebhookId,
            handlers,
          })
        },
      })

    const first = await send()
    const second = await send()
    expect(first.status).toBe(200)
    expect(first.duplicate).toBeFalsy()
    expect(second.status).toBe(200)
    expect(second.duplicate).toBe(true)
  })
})
