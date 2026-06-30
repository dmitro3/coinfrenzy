import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { award } from '../engine'
import { recordBet } from '../playthrough'
import { expireBonuses } from '../expire'
import { _clearHouseAccountCacheForTests } from '../../ledger/house-accounts'
import { clearRedis } from '../../ledger/redis'

import {
  createTestPlayer,
  getWallet,
  makeCtx,
  startTestDb,
  type TestDb,
} from '../../ledger/__tests__/setup'

// docs/06 §4-§9 — end-to-end exercise: award a bonus, record bets against
// it, verify playthrough completes and the SC reclassifies from `bonus`
// to `earned`.

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
  if (process.env.SKIP_INTEGRATION_TESTS === '1') return 'SKIP_INTEGRATION_TESTS=1'
  if (process.env.TEST_DATABASE_URL) return null
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
      /* ignore */
    }
  }
  return 'no Docker socket and no TEST_DATABASE_URL — set one to run integration tests'
}

const describeOrSkip = skipReason ? describe.skip : describe

if (skipReason) {
  // eslint-disable-next-line no-console
  console.warn(`[bonus integration] skipping: ${skipReason}`)
}

describeOrSkip('bonus engine end-to-end (docs/06)', () => {
  it('award → bet → playthrough complete → release moves SC to earned', async () => {
    const player = await createTestPlayer(testDb.sql)
    const { ctx } = makeCtx(testDb.db)

    // Insert a custom bonus template via raw SQL (templates aren't seeded
    // for the integration migration set).
    const bonusId = randomUUID()
    await testDb.sql`
      insert into bonuses
        (id, slug, display_name, bonus_type, award_gc, award_sc,
         playthrough_multiplier, playthrough_window_hours, stackable, status)
      values
        (${bonusId}, ${`it-welcome-${bonusId.slice(0, 6)}`}, 'IT Welcome', 'welcome',
         0, 100000, 2.0, 168, false, 'active')
    `

    // Insert a games row matching what recordBet will look up.
    const gameProviderId = await ensureGameProvider(testDb)
    const gameId = randomUUID()
    await testDb.sql`
      insert into games (id, provider_id, slug, external_id, display_name, category,
                         playthrough_weight, status, customer_facing)
      values (${gameId}, ${gameProviderId}, ${`game-${gameId.slice(0, 6)}`},
              ${`ext-${gameId.slice(0, 6)}`}, 'IT Slot', 'slots', '1.0', 'active', true)
    `

    const sourceId = `it-${randomUUID()}`
    const awardResult = await award(ctx, {
      playerId: player.id,
      bonusId,
      sourceKind: 'admin_manual',
      sourceId,
      reason: 'IT seed',
    })

    if (!awardResult.ok) {
      throw new Error(`award failed: ${JSON.stringify(awardResult.error)}`)
    }
    expect(awardResult.value.status).toBe('awarded')
    if (awardResult.value.status !== 'awarded') return

    // Wallet should now have 10.00 SC bonus + playthrough_required 20.00.
    const after = await getWallet(testDb.sql, player.id, 'SC')
    expect(after?.bonus).toBe('100000.0000')

    const required = 100_000n * 2n
    // Recompute required from the DB to avoid drift if engine logic changes.
    const [reqRow] = await testDb.sql<{ playthrough_required: string }[]>`
      select playthrough_required from bonuses_awarded where id = ${awardResult.value.awardId}
    `
    expect(reqRow!.playthrough_required).toBe(`${required.toString()}.0000`)

    // Idempotent re-award returns duplicate.
    const dup = await award(ctx, {
      playerId: player.id,
      bonusId,
      sourceKind: 'admin_manual',
      sourceId,
      reason: 'IT seed',
    })
    if (!dup.ok) throw new Error('duplicate award unexpectedly failed')
    expect(dup.value.status).toBe('duplicate')

    // Place a single big bet that covers the entire playthrough.
    const bet = await recordBet(ctx, {
      playerId: player.id,
      currency: 'SC',
      amount: required,
      gameId,
      roundId: randomUUID(),
      externalRoundId: `ext-round-${randomUUID()}`,
    })
    expect(bet.contributed.length).toBe(1)
    expect(bet.contributed[0]!.completed).toBe(true)
    expect(bet.released).toContain(awardResult.value.awardId)

    // After release the wallet's bonus bucket should be 0 and earned should
    // hold the released amount.
    const final = await getWallet(testDb.sql, player.id, 'SC')
    expect(final?.bonus).toBe('0.0000')
    expect(final?.earned).toBe('100000.0000')

    // The bonus row is now `completed`.
    const [awardedRow] = await testDb.sql<{ status: string; release_pair_id: string | null }[]>`
      select status, release_pair_id from bonuses_awarded where id = ${awardResult.value.awardId}
    `
    expect(awardedRow!.status).toBe('completed')
    expect(awardedRow!.release_pair_id).not.toBeNull()
  }, 60_000)

  it('expireBonuses claws back un-played bonus SC after the window', async () => {
    const player = await createTestPlayer(testDb.sql)
    const { ctx } = makeCtx(testDb.db)

    const bonusId = randomUUID()
    await testDb.sql`
      insert into bonuses
        (id, slug, display_name, bonus_type, award_gc, award_sc,
         playthrough_multiplier, playthrough_window_hours, stackable, status)
      values
        (${bonusId}, ${`it-expire-${bonusId.slice(0, 6)}`}, 'IT Expire', 'promotion',
         0, 50000, 3.0, 1, true, 'active')
    `

    const awardResult = await award(ctx, {
      playerId: player.id,
      bonusId,
      sourceKind: 'admin_manual',
      sourceId: `it-expire-${randomUUID()}`,
    })
    if (!awardResult.ok || awardResult.value.status !== 'awarded') {
      throw new Error('award failed')
    }

    // Backdate the expires_at to make it overdue.
    await testDb.sql`
      update bonuses_awarded set expires_at = now() - interval '1 hour'
       where id = ${awardResult.value.awardId}
    `

    const expireResult = await expireBonuses(ctx, { limit: 10 })
    expect(expireResult.processed).toBeGreaterThanOrEqual(1)
    expect(expireResult.clawedBackAwards).toBeGreaterThanOrEqual(1)

    const w = await getWallet(testDb.sql, player.id, 'SC')
    expect(w?.bonus).toBe('0.0000')

    const [row] = await testDb.sql<{ status: string }[]>`
      select status from bonuses_awarded where id = ${awardResult.value.awardId}
    `
    expect(row!.status).toBe('expired')
  }, 60_000)
})

async function ensureGameProvider(db: TestDb): Promise<string> {
  // We need a games row with a valid provider_id; provider needs an
  // aggregator. Migration 0002 seeds 'alea' so we use it.
  const aggRows = await db.sql<{ id: string }[]>`select id from aggregators where slug = 'alea'`
  const aggregatorId = aggRows[0]?.id
  if (!aggregatorId) throw new Error('alea aggregator not seeded')

  const providerId = randomUUID()
  await db.sql`
    insert into game_providers (id, aggregator_id, slug, display_name, status)
    values (${providerId}, ${aggregatorId}, ${`it-prov-${providerId.slice(0, 6)}`},
            'IT Provider', 'active')
  `
  return providerId
}
