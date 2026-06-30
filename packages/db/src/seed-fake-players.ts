/* eslint-disable no-console */
/**
 * Seed fake players + supporting fixtures for development.
 *
 * Idempotent on the email pattern `seed-player-${id}@coinfrenzy-fake.test` —
 * running twice does not double-insert. Pass `--clean` to delete every fake
 * row instead.
 *
 * Required env:
 *   DATABASE_URL_DIRECT (preferred) or DATABASE_URL
 *
 * What gets inserted (when not --clean):
 *   - 200 fake players (auth_user + players + GC/SC wallets + lifetime stats)
 *   - 30 fake purchases spread across the last 30 days
 *   - 20 fake redemption requests in mixed states
 *   - 10 fake bonus_awarded entries
 *
 * The data is realistic enough that the admin dashboard, players list, and
 * cashier queue all render with feel-good numbers. None of it touches the
 * ledger module — it's stub fixtures only, not transactional truth.
 */

import { randomUUID } from 'node:crypto'

import postgres from 'postgres'

import { seedAllFixtures, teardownFixtures } from './seed-fake-fixtures'

const FAKE_EMAIL_DOMAIN = 'coinfrenzy-fake.test'
const FAKE_EMAIL_PREFIX = 'seed-player-'

const TARGET_PLAYER_COUNT = 200
const TARGET_PURCHASE_COUNT = 30
const TARGET_REDEMPTION_COUNT = 20
const TARGET_BONUS_AWARDED_COUNT = 10

const FIRST_NAMES = [
  'Alex',
  'Jordan',
  'Taylor',
  'Casey',
  'Morgan',
  'Quinn',
  'Riley',
  'Sam',
  'Avery',
  'Blake',
  'Cameron',
  'Drew',
  'Emerson',
  'Finley',
  'Hayden',
  'Jamie',
  'Kendall',
  'Logan',
  'Marley',
  'Parker',
  'Reese',
  'Skyler',
  'Tatum',
  'River',
  'Sage',
  'Phoenix',
  'Rowan',
  'Briar',
  'Indigo',
  'Wren',
]

const LAST_NAMES = [
  'Anderson',
  'Brooks',
  'Carter',
  'Diaz',
  'Edwards',
  'Foster',
  'Gomez',
  'Hayes',
  'Iverson',
  'Johnson',
  'Khan',
  'Lopez',
  'Martin',
  'Nguyen',
  'Owens',
  'Patel',
  'Quinn',
  'Robinson',
  'Singh',
  'Turner',
  'Underwood',
  'Vance',
  'Walker',
  'Young',
  'Zimmerman',
]

const ALLOWED_STATES = [
  'AL',
  'AK',
  'AZ',
  'AR',
  'CO',
  'DE',
  'DC',
  'FL',
  'GA',
  'HI',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'ME',
  'MD',
  'MA',
  'MN',
  'MS',
  'MO',
  'NE',
  'NH',
  'NM',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TX',
  'UT',
  'VT',
  'VA',
  'WV',
  'WI',
  'WY',
]

const BLOCKED_STATES_LIST = ['CA', 'CT', 'ID', 'LA', 'MI', 'MT', 'NV', 'NJ', 'NY', 'TN', 'WA']

const ADJECTIVES = ['lucky', 'happy', 'cosmic', 'midnight', 'silver', 'royal', 'wild', 'gold']
const NOUNS = ['tiger', 'phoenix', 'wolf', 'falcon', 'comet', 'reef', 'oak', 'echo']

interface SeededPlayer {
  id: string
  email: string
  state: string
  status: string
  createdAt: Date
  scBalance: bigint
  gcBalance: bigint
  lifetimeSpendUsd: bigint
}

interface CliFlags {
  clean: boolean
  count: number
}

function parseFlags(): CliFlags {
  const args = process.argv.slice(2)
  return {
    clean: args.includes('--clean'),
    count: TARGET_PLAYER_COUNT,
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL
  if (!connectionString) {
    console.error('ERROR: DATABASE_URL_DIRECT (preferred) or DATABASE_URL must be set.')
    process.exit(1)
  }

  const flags = parseFlags()
  const sql = postgres(connectionString, {
    max: 1,
    prepare: false,
    onnotice: () => {},
  })

  try {
    if (flags.clean) {
      await teardown(sql)
      return
    }
    await seed(sql, flags)
  } finally {
    await sql.end({ timeout: 5 })
  }
}

/* -------------------------------------------------------------------------- */
/* Seed                                                                        */
/* -------------------------------------------------------------------------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- postgres-js client type is generic
async function seed(sql: any, flags: CliFlags): Promise<void> {
  const existing = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count
    FROM players
    WHERE email LIKE ${FAKE_EMAIL_PREFIX + '%'}
  `
  const existingCount = Number(existing[0]?.count ?? 0)
  if (existingCount >= flags.count) {
    console.log(
      `Found ${existingCount} fake players already (>= target ${flags.count}). Skipping player creation.`,
    )
  } else {
    console.log(
      `Seeding ${flags.count - existingCount} fake players (current: ${existingCount}, target: ${flags.count})…`,
    )
    const players = await seedPlayers(sql, flags.count - existingCount, existingCount)
    console.log(`  + ${players.length} players (with auth_user, wallets, lifetime stats)`)
  }

  // Re-read all fake players for downstream fixtures (idempotent below).
  const allFakePlayers = await readAllFakePlayers(sql)

  const purchaseCount = await seedPurchases(sql, allFakePlayers, TARGET_PURCHASE_COUNT)
  console.log(`  + ${purchaseCount} purchases (idempotent)`)

  const redemptionCount = await seedRedemptions(sql, allFakePlayers, TARGET_REDEMPTION_COUNT)
  console.log(`  + ${redemptionCount} redemption requests (idempotent)`)

  const bonusCount = await seedBonusAwards(sql, allFakePlayers, TARGET_BONUS_AWARDED_COUNT)
  console.log(`  + ${bonusCount} bonus awards (idempotent)`)

  // M2: extend with the catalog + activity fixtures every admin page expects.
  await seedAllFixtures(sql, allFakePlayers)

  console.log('\nDone. Visit /admin/players to see the fake roster.')
  console.log('Use `pnpm --filter @coinfrenzy/db seed:fake:clean` to remove all fake rows.')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- postgres-js client type
async function seedPlayers(sql: any, n: number, startIdx: number): Promise<SeededPlayer[]> {
  const out: SeededPlayer[] = []
  // We do this one player at a time to keep transaction scope small —
  // 200 individual inserts is fast against pooled Neon.
  for (let i = 0; i < n; i++) {
    const idx = startIdx + i
    const player = await seedOnePlayer(sql, idx)
    out.push(player)
    if ((i + 1) % 50 === 0) {
      process.stdout.write(`    …${i + 1}/${n}\n`)
    }
  }
  return out
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- postgres-js client type
async function seedOnePlayer(sql: any, idx: number): Promise<SeededPlayer> {
  const id = randomUUID()
  const firstName = pickRandom(FIRST_NAMES)
  const lastName = pickRandom(LAST_NAMES)
  const email = `${FAKE_EMAIL_PREFIX}${idx}@${FAKE_EMAIL_DOMAIN}`
  const username = `${pickRandom(ADJECTIVES)}_${pickRandom(NOUNS)}_${idx}`
  const blocked = Math.random() < 0.1
  const state = blocked ? pickRandom(BLOCKED_STATES_LIST) : pickRandom(ALLOWED_STATES)

  const status = pickWeighted([
    ['active', 0.85],
    ['suspended', 0.1],
    ['self_excluded', 0.03],
    ['closed', 0.02],
  ])

  const kycLevel = pickWeighted<number>([
    [2, 0.5],
    [1, 0.3],
    [0, 0.15],
    [3, 0.05],
  ])

  const daysAgoCreated = randomInt(1, 365)
  const createdAt = daysAgo(daysAgoCreated)

  const lastLoginBucket = Math.random()
  let lastLoginDays: number
  if (lastLoginBucket < 0.6) lastLoginDays = randomInt(0, 7)
  else if (lastLoginBucket < 0.9) lastLoginDays = randomInt(7, 30)
  else lastLoginDays = randomInt(30, Math.max(31, daysAgoCreated))
  lastLoginDays = Math.min(lastLoginDays, daysAgoCreated)
  const lastLoginAt = daysAgo(lastLoginDays)

  // Money in minor units (1 major = 10_000 minor).
  const gcBalance = BigInt(Math.floor(Math.pow(Math.random(), 1.8) * 50_000)) * 10_000n
  const scBalance = BigInt(Math.floor(Math.pow(Math.random(), 2.0) * 5_000)) * 10_000n

  // Sub-bucket distribution for SC: most in 'earned', some bonus, small purchased/promo.
  const scEarned = (scBalance * 60n) / 100n
  const scBonus = (scBalance * 25n) / 100n
  const scPromo = (scBalance * 10n) / 100n
  const scPurchased = scBalance - scEarned - scBonus - scPromo

  const gcEarned = (gcBalance * 70n) / 100n
  const gcBonus = (gcBalance * 20n) / 100n
  const gcPromo = (gcBalance * 5n) / 100n
  const gcPurchased = gcBalance - gcEarned - gcBonus - gcPromo

  // Lifetime stats — heavier players have more activity.
  const lifetimeSpendUsd = BigInt(Math.floor(Math.pow(Math.random(), 1.5) * 5_000) * 100) * 100n // up to ~$5k
  const lifetimeRedeemedUsd = (lifetimeSpendUsd * BigInt(randomInt(20, 80))) / 100n
  const lifetimeWageredSc = scBalance * 4n + BigInt(randomInt(0, 1_000_000)) * 10_000n
  const lifetimeWonSc = (lifetimeWageredSc * 95n) / 100n
  const ggrSc = lifetimeWageredSc - lifetimeWonSc
  const ngrSc = ggrSc - (ggrSc * 30n) / 100n
  const purchaseCount = lifetimeSpendUsd > 0n ? randomInt(1, 25) : 0
  const redemptionCount = lifetimeRedeemedUsd > 0n ? randomInt(0, 8) : 0
  const daysActive = Math.min(daysAgoCreated, randomInt(1, daysAgoCreated))

  // 1) auth_user — Better Auth identity row.
  await sql`
    INSERT INTO auth_user (id, email, email_verified, name, created_at, updated_at)
    VALUES (
      ${id},
      ${email},
      true,
      ${firstName + ' ' + lastName},
      ${createdAt},
      ${createdAt}
    )
    ON CONFLICT (email) DO NOTHING
  `

  // 2) players row.
  await sql`
    INSERT INTO players (
      id, email, username, display_name, first_name, last_name,
      state, country, status, kyc_level, kyc_verified_at,
      first_seen_at, last_seen_at, last_login_at,
      signup_country, signup_state,
      email_consent, sms_consent,
      created_at, updated_at
    ) VALUES (
      ${id},
      ${email},
      ${username},
      ${firstName + ' ' + lastName},
      ${firstName},
      ${lastName},
      ${state},
      'US',
      ${status}::player_status,
      ${kycLevel},
      ${kycLevel >= 1 ? createdAt : null},
      ${createdAt},
      ${lastLoginAt},
      ${lastLoginAt},
      'US',
      ${state},
      ${Math.random() > 0.2},
      ${Math.random() > 0.7},
      ${createdAt},
      ${createdAt}
    )
    ON CONFLICT (email) DO NOTHING
  `

  // 3) GC + SC wallets.
  await sql`
    INSERT INTO wallets (
      player_id, currency,
      current_balance, balance_purchased, balance_bonus, balance_promo, balance_earned,
      created_at, updated_at
    ) VALUES (
      ${id}, 'GC',
      ${formatMoney(gcBalance)}, ${formatMoney(gcPurchased)}, ${formatMoney(gcBonus)},
      ${formatMoney(gcPromo)}, ${formatMoney(gcEarned)},
      ${createdAt}, ${createdAt}
    )
    ON CONFLICT (player_id, currency) DO NOTHING
  `
  await sql`
    INSERT INTO wallets (
      player_id, currency,
      current_balance, balance_purchased, balance_bonus, balance_promo, balance_earned,
      created_at, updated_at
    ) VALUES (
      ${id}, 'SC',
      ${formatMoney(scBalance)}, ${formatMoney(scPurchased)}, ${formatMoney(scBonus)},
      ${formatMoney(scPromo)}, ${formatMoney(scEarned)},
      ${createdAt}, ${createdAt}
    )
    ON CONFLICT (player_id, currency) DO NOTHING
  `

  // 4) lifetime stats.
  await sql`
    INSERT INTO player_lifetime_stats (
      player_id,
      total_deposited_usd, total_redeemed_usd, net_position_usd,
      purchase_count, redemption_count,
      total_wagered_sc, total_won_sc, ggr_sc, ngr_sc,
      session_count, round_count, days_active,
      first_purchase_at, last_purchase_at, first_session_at, last_session_at,
      computed_at
    ) VALUES (
      ${id},
      ${formatMoney(lifetimeSpendUsd)},
      ${formatMoney(lifetimeRedeemedUsd)},
      ${formatMoney(lifetimeSpendUsd - lifetimeRedeemedUsd)},
      ${purchaseCount},
      ${redemptionCount},
      ${formatMoney(lifetimeWageredSc)},
      ${formatMoney(lifetimeWonSc)},
      ${formatMoney(ggrSc)},
      ${formatMoney(ngrSc)},
      ${daysActive * 2},
      ${daysActive * 30},
      ${daysActive},
      ${purchaseCount > 0 ? createdAt : null},
      ${purchaseCount > 0 ? lastLoginAt : null},
      ${createdAt},
      ${lastLoginAt},
      now()
    )
    ON CONFLICT (player_id) DO NOTHING
  `

  return {
    id,
    email,
    state,
    status,
    createdAt,
    scBalance,
    gcBalance,
    lifetimeSpendUsd,
  }
}

interface FakePlayerRow {
  id: string
  email: string
  state: string
  status: string
  created_at: Date
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- postgres-js client type
async function readAllFakePlayers(sql: any): Promise<SeededPlayer[]> {
  const rows = (await sql`
    SELECT id, email, state, status, created_at
    FROM players
    WHERE email LIKE ${FAKE_EMAIL_PREFIX + '%'}
    ORDER BY created_at ASC
  `) as FakePlayerRow[]
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    state: r.state,
    status: r.status,
    createdAt: r.created_at,
    scBalance: 0n,
    gcBalance: 0n,
    lifetimeSpendUsd: 0n,
  }))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- postgres-js client type
async function seedPurchases(sql: any, players: SeededPlayer[], target: number): Promise<number> {
  // Skip if there are already fake purchases for these players.
  const existing = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count
    FROM purchases
    WHERE player_id IN ${sql(players.map((p) => p.id))}
      AND gamma_transaction_id LIKE ${'fake-purchase-%'}
  `
  const have = Number(existing[0]?.count ?? 0)
  if (have >= target) return have

  let inserted = 0
  const todoCount = target - have
  const candidates = players.filter((p) => p.status === 'active')
  if (candidates.length === 0) return have

  for (let i = 0; i < todoCount; i++) {
    const player = pickRandom(candidates)
    const daysAgoCreated = i < todoCount * 0.2 ? 0 : randomInt(1, 30)
    const createdAt = daysAgo(daysAgoCreated, /* withinDay */ true)
    const amountUsdMajor = pickRandom([10, 20, 50, 100, 200, 500])
    const amountUsd = BigInt(amountUsdMajor) * 10_000n
    const amountCents = BigInt(amountUsdMajor * 100)
    const baseGc = BigInt(amountUsdMajor * 1_000) * 10_000n
    const baseSc = BigInt(Math.floor(amountUsdMajor * 0.05 * 10_000))
    const bonusGc = BigInt(amountUsdMajor * 200) * 10_000n
    const bonusSc = BigInt(Math.floor(amountUsdMajor * 0.01 * 10_000))
    const id = randomUUID()
    const last4 = String(randomInt(1000, 9999))
    const brand = pickRandom(['visa', 'mastercard', 'amex'])

    await sql`
      INSERT INTO purchases (
        id, player_id, amount_usd, amount_cents,
        base_gc, base_sc, bonus_gc, bonus_sc,
        finix_card_last4, finix_card_brand,
        status, state_at_purchase,
        gamma_transaction_id,
        created_at, updated_at, completed_at
      ) VALUES (
        ${id}, ${player.id}, ${formatMoney(amountUsd)}, ${amountCents.toString()},
        ${formatMoney(baseGc)}, ${formatMoney(baseSc)},
        ${formatMoney(bonusGc)}, ${formatMoney(bonusSc)},
        ${last4}, ${brand},
        'completed', ${player.state},
        ${'fake-purchase-' + id},
        ${createdAt}, ${createdAt}, ${createdAt}
      )
      ON CONFLICT (id) DO NOTHING
    `
    inserted++
  }
  return have + inserted
}

async function seedRedemptions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- postgres-js client type
  sql: any,
  players: SeededPlayer[],
  target: number,
): Promise<number> {
  const existing = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count
    FROM redemptions
    WHERE player_id IN ${sql(players.map((p) => p.id))}
      AND gamma_redemption_id LIKE ${'fake-redemption-%'}
  `
  const have = Number(existing[0]?.count ?? 0)
  if (have >= target) return have

  const candidates = players.filter((p) => p.status === 'active')
  if (candidates.length === 0) return have

  const statuses: { value: string; weight: number }[] = [
    { value: 'pending_review', weight: 0.4 },
    { value: 'kyc_pending', weight: 0.15 },
    { value: 'approved', weight: 0.15 },
    { value: 'paid', weight: 0.2 },
    { value: 'rejected', weight: 0.1 },
  ]

  let inserted = 0
  const todoCount = target - have
  for (let i = 0; i < todoCount; i++) {
    const player = pickRandom(candidates)
    const status = pickWeighted(statuses.map((s) => [s.value, s.weight]))
    const daysAgoCreated = randomInt(0, 7)
    const createdAt = daysAgo(daysAgoCreated, true)
    const amountUsdMajor = pickRandom([20, 50, 100, 250, 500, 1000])
    const amountUsd = BigInt(amountUsdMajor) * 10_000n
    const amountSc = BigInt(amountUsdMajor) * 10_000n
    const id = randomUUID()
    const drainPlan = JSON.stringify({
      buckets: [{ bucket: 'earned', amount: amountSc.toString() }],
    })

    await sql`
      INSERT INTO redemptions (
        id, player_id, amount_sc, amount_usd, method, drain_plan,
        status, state_at_request,
        paid_at,
        gamma_redemption_id,
        created_at, updated_at, requested_at
      ) VALUES (
        ${id}, ${player.id},
        ${formatMoney(amountSc)}, ${formatMoney(amountUsd)},
        'finix_ach',
        ${drainPlan}::jsonb,
        ${status},
        ${player.state},
        ${status === 'paid' ? createdAt : null},
        ${'fake-redemption-' + id},
        ${createdAt}, ${createdAt}, ${createdAt}
      )
      ON CONFLICT (id) DO NOTHING
    `
    inserted++
  }
  return have + inserted
}

async function seedBonusAwards(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- postgres-js client type
  sql: any,
  players: SeededPlayer[],
  target: number,
): Promise<number> {
  // We need a real bonus row to FK against. If none exists, create a placeholder
  // template named "Welcome Pack (Seed)".
  const existingBonus = await sql<{ id: string }[]>`
    SELECT id FROM bonuses WHERE slug = 'welcome-pack-seed' LIMIT 1
  `
  let bonusId = existingBonus[0]?.id
  if (!bonusId) {
    const created = await sql<{ id: string }[]>`
      INSERT INTO bonuses (
        slug, display_name, bonus_type, award_gc, award_sc,
        playthrough_multiplier, status
      ) VALUES (
        'welcome-pack-seed', 'Welcome Pack (Seed)', 'welcome',
        ${formatMoney(10_000n * 10_000n)}, ${formatMoney(5n * 10_000n)},
        '3.0', 'active'
      )
      ON CONFLICT (slug) DO UPDATE SET display_name = EXCLUDED.display_name
      RETURNING id
    `
    bonusId = created[0]!.id
  }

  const existingCount = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count
    FROM bonuses_awarded
    WHERE source_kind = 'fake-seed'
  `
  const have = Number(existingCount[0]?.count ?? 0)
  if (have >= target) return have

  const candidates = players.filter((p) => p.status === 'active')
  if (candidates.length === 0) return have

  let inserted = 0
  const todoCount = target - have
  for (let i = 0; i < todoCount; i++) {
    const player = pickRandom(candidates)
    const id = randomUUID()
    const gcAmount = BigInt(pickRandom([10_000, 25_000, 50_000])) * 10_000n
    const scAmount = BigInt(pickRandom([5, 10, 25])) * 10_000n
    const playthroughRequired = scAmount * 3n
    const playthroughProgress = (playthroughRequired * BigInt(randomInt(0, 70))) / 100n
    const createdAt = daysAgo(randomInt(0, 14), true)

    await sql`
      INSERT INTO bonuses_awarded (
        id, player_id, bonus_id,
        gc_amount, sc_amount,
        playthrough_multiplier_snapshot,
        playthrough_required, playthrough_progress, playthrough_complete,
        status, source_kind, source_id,
        created_at
      ) VALUES (
        ${id}, ${player.id}, ${bonusId},
        ${formatMoney(gcAmount)}, ${formatMoney(scAmount)},
        '3.0',
        ${formatMoney(playthroughRequired)},
        ${formatMoney(playthroughProgress)},
        false,
        'active',
        'fake-seed',
        ${'fake-seed-' + id},
        ${createdAt}
      )
      ON CONFLICT (source_kind, source_id) DO NOTHING
    `
    inserted++
  }
  return have + inserted
}

/* -------------------------------------------------------------------------- */
/* Teardown                                                                    */
/* -------------------------------------------------------------------------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- postgres-js client type
async function teardown(sql: any): Promise<void> {
  console.log('Removing all fake seeded data…')

  // Remove M2 fixtures first (they may reference the seeded players + bonuses).
  await teardownFixtures(sql)

  // Pre-count for the friendly summary.
  const before = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count
    FROM players
    WHERE email LIKE ${FAKE_EMAIL_PREFIX + '%'}
  `
  const beforeCount = Number(before[0]?.count ?? 0)

  // Order matters — child rows first.
  await sql`
    DELETE FROM bonuses_awarded
    WHERE source_kind = 'fake-seed'
       OR player_id IN (
         SELECT id FROM players WHERE email LIKE ${FAKE_EMAIL_PREFIX + '%'}
       )
  `
  await sql`DELETE FROM bonuses WHERE slug = 'welcome-pack-seed'`
  await sql`
    DELETE FROM redemptions
    WHERE gamma_redemption_id LIKE 'fake-redemption-%'
       OR player_id IN (
         SELECT id FROM players WHERE email LIKE ${FAKE_EMAIL_PREFIX + '%'}
       )
  `
  await sql`
    DELETE FROM purchases
    WHERE gamma_transaction_id LIKE 'fake-purchase-%'
       OR player_id IN (
         SELECT id FROM players WHERE email LIKE ${FAKE_EMAIL_PREFIX + '%'}
       )
  `
  await sql`
    DELETE FROM player_lifetime_stats
    WHERE player_id IN (
      SELECT id FROM players WHERE email LIKE ${FAKE_EMAIL_PREFIX + '%'}
    )
  `
  await sql`
    DELETE FROM wallets
    WHERE player_id IN (
      SELECT id FROM players WHERE email LIKE ${FAKE_EMAIL_PREFIX + '%'}
    )
  `
  await sql`
    DELETE FROM players
    WHERE email LIKE ${FAKE_EMAIL_PREFIX + '%'}
  `
  await sql`
    DELETE FROM auth_user
    WHERE email LIKE ${FAKE_EMAIL_PREFIX + '%'}
  `

  console.log(`Removed ${beforeCount} fake players and all related fixtures.`)
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

function pickWeighted<T>(items: ReadonlyArray<readonly [T, number]>): T {
  const total = items.reduce((sum, [, w]) => sum + w, 0)
  let r = Math.random() * total
  for (const [value, weight] of items) {
    r -= weight
    if (r <= 0) return value
  }
  return items[items.length - 1]![0]
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min)) + min
}

function daysAgo(days: number, withinDay = false): Date {
  const d = new Date()
  d.setDate(d.getDate() - days)
  if (withinDay) {
    d.setHours(randomInt(0, 23), randomInt(0, 59), randomInt(0, 59), 0)
  } else {
    d.setHours(0, 0, 0, 0)
  }
  return d
}

/** Convert bigint minor units to numeric(20,4) string ("12.3400"). */
function formatMoney(value: bigint): string {
  const negative = value < 0n
  const abs = negative ? -value : value
  const major = abs / 10_000n
  const minor = abs % 10_000n
  return `${negative ? '-' : ''}${major}.${minor.toString().padStart(4, '0')}`
}

main().catch((err) => {
  console.error('seed-fake-players failed:', err)
  process.exit(1)
})
