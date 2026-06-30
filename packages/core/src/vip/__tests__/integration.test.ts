import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  assignToHost,
  canHostAwardBonus,
  evaluateAllPlayers,
  evaluatePlayerVipStatus,
  getHostWeeklyBonusBudget,
  getInteractionHistory,
  logInteraction,
  unassignFromHost,
} from '../index'
import { HOST_WEEKLY_BONUS_CAP_SC } from '../../auth/permissions'

import { makeCtx, startTestDb, type TestDb } from '../../ledger/__tests__/setup'

// M4 — VIP / host module integration test. Stands up the real Postgres so
// we exercise the migration's CHECK constraints, RLS, and bigint math.

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
  for (const p of sockets) {
    try {
      if (p && existsSync(p)) return null
    } catch {
      /* ignore */
    }
  }
  return 'no Docker socket and no TEST_DATABASE_URL — set one to run integration tests'
}

const describeOrSkip = skipReason ? describe.skip : describe

if (skipReason) {
  // eslint-disable-next-line no-console
  console.warn(`[vip integration] skipping: ${skipReason}`)
}

async function createPlayer(spendMinor: bigint): Promise<string> {
  const id = randomUUID()
  const email = `vip-${id.slice(0, 8)}@test`
  await testDb.sql`
    insert into players (id, email, status, country)
    values (${id}, ${email}, 'active', 'US')
  `
  if (spendMinor > 0n) {
    await testDb.sql`
      insert into player_lifetime_stats (player_id, total_deposited_usd)
      values (${id}, ${spendMinor.toString()}::numeric(20,4))
      on conflict (player_id) do update set total_deposited_usd = excluded.total_deposited_usd
    `
  }
  return id
}

async function createHost(displayName = 'Test Host'): Promise<string> {
  const email = `host-${randomUUID().slice(0, 8)}@test`
  const [admin] = await testDb.sql<{ id: string }[]>`
    insert into admins (email, display_name, password_hash, status)
    values (${email}, ${displayName}, 'fakehash', 'active')
    returning id
  `
  const adminId = admin!.id
  const [role] = await testDb.sql<{ id: string }[]>`
    select id from admin_roles where slug = 'host'
  `
  await testDb.sql`
    insert into admin_role_assignments (admin_id, role_id)
    values (${adminId}, ${role!.id})
    on conflict do nothing
  `
  return adminId
}

async function createBonusTemplate(args: {
  slug: string
  awardSc: bigint
  hostAvailable: boolean
}): Promise<string> {
  const id = randomUUID()
  await testDb.sql`
    insert into bonuses (id, slug, display_name, bonus_type, award_gc, award_sc,
                         playthrough_multiplier, status, host_available)
    values (
      ${id}, ${args.slug}, ${args.slug}, 'promotion', 0,
      ${args.awardSc.toString()}::numeric(20,4),
      '0.0', 'active', ${args.hostAvailable}
    )
  `
  return id
}

const SCALE = 10_000n

describeOrSkip('VIP / host module', () => {
  it('evaluatePlayerVipStatus auto-promotes at $1k spend', async () => {
    const playerId = await createPlayer(1_500n * SCALE)
    const r = await evaluatePlayerVipStatus(testDb.db, playerId)
    expect(r.status).toBe('vip')
    expect(r.changed).toBe(true)
    expect(r.previousStatus).toBe('none')

    const [row] = await testDb.sql<{ vip_status: string; vip_qualified_at: Date | null }[]>`
      select vip_status, vip_qualified_at from players where id = ${playerId}
    `
    expect(row!.vip_status).toBe('vip')
    expect(row!.vip_qualified_at).not.toBeNull()
  })

  it('evaluatePlayerVipStatus promotes to high_roller at $10k', async () => {
    const playerId = await createPlayer(12_000n * SCALE)
    const r = await evaluatePlayerVipStatus(testDb.db, playerId)
    expect(r.status).toBe('high_roller')
  })

  it('never auto-demotes a manually-set status', async () => {
    const playerId = await createPlayer(0n)
    await testDb.sql`update players set vip_status = 'candidate' where id = ${playerId}`
    const r = await evaluatePlayerVipStatus(testDb.db, playerId)
    expect(r.status).toBe('candidate')
    expect(r.changed).toBe(false)
  })

  it('assignToHost + unassignFromHost write a system interaction breadcrumb', async () => {
    const playerId = await createPlayer(2_000n * SCALE)
    const hostId = await createHost()
    const masterId = (
      await testDb.sql<{ id: string }[]>`
        insert into admins (email, display_name, password_hash, status)
        values (${`master-${randomUUID().slice(0, 8)}@test`}, 'Master', 'hash', 'active')
        returning id
      `
    )[0]!.id

    await assignToHost(testDb.db, playerId, hostId, masterId, 'master', 'first assignment')
    const interactions = await getInteractionHistory(testDb.db, playerId)
    expect(interactions.some((i) => i.interactionType === 'system')).toBe(true)

    await unassignFromHost(testDb.db, playerId, masterId, 'master', 'closeout')
    const [row] = await testDb.sql<{ assigned_host_id: string | null }[]>`
      select assigned_host_id from players where id = ${playerId}
    `
    expect(row!.assigned_host_id).toBeNull()
  })

  it('logInteraction enforces host ownership when actorRole=host', async () => {
    const playerId = await createPlayer(2_500n * SCALE)
    const otherHostId = await createHost('Other')
    await expect(
      logInteraction(testDb.db, {
        hostId: otherHostId,
        playerId,
        type: 'call',
        actorRole: 'host',
      }),
    ).rejects.toThrow(/does not own/)
  })

  it('logInteraction allows master without host-ownership check', async () => {
    const playerId = await createPlayer(2_500n * SCALE)
    const hostId = await createHost('Pos')
    const row = await logInteraction(testDb.db, {
      hostId,
      playerId,
      type: 'note',
      notes: 'observed from master',
      actorRole: 'master',
    })
    expect(row.id).toBeDefined()
  })

  it('host weekly cap blocks the over-budget award', async () => {
    const playerId = await createPlayer(5_000n * SCALE)
    const hostId = await createHost('Cap')
    const masterId = (
      await testDb.sql<{ id: string }[]>`
        insert into admins (email, display_name, password_hash, status)
        values (${`m-${randomUUID().slice(0, 8)}@test`}, 'M', 'hash', 'active')
        returning id
      `
    )[0]!.id
    await assignToHost(testDb.db, playerId, hostId, masterId, 'master')

    // 600 SC template (in major units → 6_000_000 minor units → over the
    // 5_000_000 cap).
    const bonusId = await createBonusTemplate({
      slug: `over-cap-${randomUUID().slice(0, 4)}`,
      awardSc: 6_000_000n,
      hostAvailable: true,
    })

    const { ctx } = makeCtx(testDb.db)
    const result = await canHostAwardBonus(ctx, { hostId, playerId, bonusId })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('WEEKLY_CAP_EXCEEDED')
    }
  })

  it('host weekly cap allows the under-budget award', async () => {
    const playerId = await createPlayer(5_000n * SCALE)
    const hostId = await createHost('Under')
    const masterId = (
      await testDb.sql<{ id: string }[]>`
        insert into admins (email, display_name, password_hash, status)
        values (${`m2-${randomUUID().slice(0, 8)}@test`}, 'M', 'hash', 'active')
        returning id
      `
    )[0]!.id
    await assignToHost(testDb.db, playerId, hostId, masterId, 'master')

    const bonusId = await createBonusTemplate({
      slug: `under-cap-${randomUUID().slice(0, 4)}`,
      awardSc: 100_000n, // 10 SC = 100_000 minor
      hostAvailable: true,
    })

    const { ctx } = makeCtx(testDb.db)
    const result = await canHostAwardBonus(ctx, { hostId, playerId, bonusId })
    expect(result.ok).toBe(true)
    const budget = await getHostWeeklyBonusBudget(ctx, hostId, playerId)
    expect(budget.capSc).toBe(HOST_WEEKLY_BONUS_CAP_SC)
    expect(budget.remainingSc).toBeGreaterThan(0n)
  })

  it('host cannot use a non-host-available template', async () => {
    const playerId = await createPlayer(5_000n * SCALE)
    const hostId = await createHost('NonAvail')
    const masterId = (
      await testDb.sql<{ id: string }[]>`
        insert into admins (email, display_name, password_hash, status)
        values (${`m3-${randomUUID().slice(0, 8)}@test`}, 'M', 'hash', 'active')
        returning id
      `
    )[0]!.id
    await assignToHost(testDb.db, playerId, hostId, masterId, 'master')

    const bonusId = await createBonusTemplate({
      slug: `not-avail-${randomUUID().slice(0, 4)}`,
      awardSc: 100_000n,
      hostAvailable: false,
    })

    const { ctx } = makeCtx(testDb.db)
    const result = await canHostAwardBonus(ctx, { hostId, playerId, bonusId })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('TEMPLATE_NOT_HOST_AVAILABLE')
  })

  it('host cannot award to a player not assigned to them', async () => {
    const playerId = await createPlayer(5_000n * SCALE)
    const hostId = await createHost('NotMine')
    const bonusId = await createBonusTemplate({
      slug: `notmine-${randomUUID().slice(0, 4)}`,
      awardSc: 100_000n,
      hostAvailable: true,
    })
    const { ctx } = makeCtx(testDb.db)
    const result = await canHostAwardBonus(ctx, { hostId, playerId, bonusId })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('PLAYER_NOT_ASSIGNED')
  })

  it('evaluateAllPlayers upgrades only those above threshold', async () => {
    const a = await createPlayer(500n * SCALE)
    const b = await createPlayer(5_000n * SCALE)
    const c = await createPlayer(20_000n * SCALE)

    const { upgradeCount } = await evaluateAllPlayers(testDb.db)
    expect(upgradeCount).toBeGreaterThanOrEqual(2)

    const [rowA] = await testDb.sql<{ vip_status: string }[]>`
      select vip_status from players where id = ${a}
    `
    const [rowB] = await testDb.sql<{ vip_status: string }[]>`
      select vip_status from players where id = ${b}
    `
    const [rowC] = await testDb.sql<{ vip_status: string }[]>`
      select vip_status from players where id = ${c}
    `
    expect(rowA!.vip_status).toBe('none')
    expect(rowB!.vip_status).toBe('vip')
    expect(rowC!.vip_status).toBe('high_roller')
  })
})
