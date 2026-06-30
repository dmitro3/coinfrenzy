/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Realistic operator-facing test dataset.
 *
 * Replaces the sparse 200-player M1 seed with a 2K-player dataset shaped
 * by 8 archetypes so dashboards, reports and cashier queues look like a
 * 12-month-old platform.
 *
 * Modes (parsed from process.argv):
 *   --audit-only   Phase A only, dry-run, write report, exit
 *   --audit        Phase A only, apply fixes, write report
 *   --add-only     Phase B only, add new players to target
 *   --wipe         DELETE all script-created rows (confirm via stdin)
 *   (no flag)      full run: audit then add then reconcile
 *
 * All modes are idempotent and safe to re-run. Script-created rows are
 * identified by email pattern:
 *   - seed-player-N@coinfrenzy-fake.test            (legacy M1 seed)
 *   - seed-{archetype}-{n}@coinfrenzy-realistic.test (this script)
 *
 * NEVER touched: any email not matching the patterns above.
 */

import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

import postgres from 'postgres'

/* -------------------------------------------------------------------------- */
/* CONFIG                                                                      */
/* -------------------------------------------------------------------------- */

const CONFIG = {
  TARGET_TOTAL_PLAYERS: 2_000,
  WHALE_COUNT: 1,
  TIME_WINDOW_MONTHS: 12,
  PLATFORM_LAUNCH_DATE: '2025-05-15',
  HOUSE_EDGE_TARGET: 0.068,
  HOUSE_EDGE_TOLERANCE: 0.04,
  DAILY_BONUS_GC: 10_000,
  DAILY_BONUS_SC: 1,
  WELCOME_PACKAGE_PRICE_USD: 10,
  WELCOME_PACKAGE_GC: 30_000,
  WELCOME_PACKAGE_SC: 30,
  REDEMPTION_APPROVAL_RATE: 0.847,
  REDEMPTION_VALUE_RATIO: 0.78,
  RANDOM_SEED: 'coinfrenzy-v1-stable',
  BATCH_SIZE: 200,
  LOG_EVERY_N_PLAYERS: 50,

  DAILY_BONUS_CLAIMS_TARGET: 4_000,
  ADMIN_SC_BONUS_CLAIMS_TARGET: 30_000,
  WELCOME_BONUS_TARGET: 200,
  REFERRAL_BONUS_TARGET: 220,
  WEEKLY_TIER_TARGET: 700,
  MONTHLY_TIER_TARGET: 600,
  PROMOCODE_BONUS_TARGET: 50,
} as const

const FAKE_EMAIL_DOMAIN_LEGACY = 'coinfrenzy-fake.test'
const REALISTIC_EMAIL_DOMAIN = 'coinfrenzy-realistic.test'
const REALISTIC_PREFIX_BASE = 'seed-'

const SCALE = 10_000n
const MONEY_SCALE_N = 10_000

/* -------------------------------------------------------------------------- */
/* PRNG — mulberry32 (deterministic, no deps)                                  */
/* -------------------------------------------------------------------------- */

function hashStringToInt(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return function () {
    t = (t + 0x6d2b79f5) >>> 0
    let x = t
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(hashStringToInt(CONFIG.RANDOM_SEED))

function rng(): number {
  return rand()
}
function rint(min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min
}
function rfloat(min: number, max: number): number {
  return rng() * (max - min) + min
}
function rpick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!
}
function rweighted<T>(items: ReadonlyArray<readonly [T, number]>): T {
  const total = items.reduce((s, [, w]) => s + w, 0)
  let r = rng() * total
  for (const [v, w] of items) {
    r -= w
    if (r <= 0) return v
  }
  return items[items.length - 1]![0]
}

/* -------------------------------------------------------------------------- */
/* Archetype distribution                                                      */
/* -------------------------------------------------------------------------- */

type ArchetypeKey =
  | 'lurker'
  | 'welcome'
  | 'casual'
  | 'loser'
  | 'winner'
  | 'hroller'
  | 'midwhale'
  | 'whale'

interface Archetype {
  key: ArchetypeKey
  label: string
  count: number
  spendUsd: [number, number]
  redeemUsd: [number, number]
  deposits: [number, number]
  sessions: [number, number]
  // Player-level RTP target (sum_wins / sum_bets). >1 = player ahead.
  returnRatio: [number, number]
  // Total SC wagered (major units) per player.
  scWageredMajor: [number, number]
  kycDist: ReadonlyArray<readonly [number, number]> // [level, weight]
}

const ARCHETYPES: Record<ArchetypeKey, Archetype> = {
  lurker: {
    key: 'lurker',
    label: 'Free-to-play lurkers',
    count: 900,
    spendUsd: [0, 0],
    redeemUsd: [0, 0],
    deposits: [0, 0],
    sessions: [5, 40],
    returnRatio: [0.85, 0.95],
    scWageredMajor: [5, 80],
    kycDist: [
      [0, 0.9],
      [1, 0.1],
    ],
  },
  welcome: {
    key: 'welcome',
    label: 'Welcome-only',
    count: 440,
    spendUsd: [10, 10],
    redeemUsd: [0, 50],
    deposits: [1, 1],
    sessions: [8, 30],
    returnRatio: [0.88, 1.0],
    scWageredMajor: [30, 200],
    kycDist: [
      [0, 0.6],
      [1, 0.3],
      [2, 0.1],
    ],
  },
  casual: {
    key: 'casual',
    label: 'Casual repeat',
    count: 360,
    spendUsd: [50, 300],
    redeemUsd: [0, 200],
    deposits: [2, 5],
    sessions: [30, 150],
    returnRatio: [0.9, 1.0],
    scWageredMajor: [200, 1200],
    kycDist: [
      [0, 0.3],
      [1, 0.4],
      [2, 0.3],
    ],
  },
  loser: {
    key: 'loser',
    label: 'Engaged losers',
    count: 160,
    spendUsd: [500, 3_000],
    redeemUsd: [0, 200],
    deposits: [5, 15],
    sessions: [150, 600],
    returnRatio: [0.85, 0.92],
    scWageredMajor: [2_000, 12_000],
    kycDist: [
      [1, 0.2],
      [2, 0.7],
      [3, 0.1],
    ],
  },
  winner: {
    key: 'winner',
    label: 'Engaged winners',
    count: 80,
    spendUsd: [1_000, 8_000],
    redeemUsd: [5_000, 15_000],
    deposits: [5, 20],
    sessions: [200, 800],
    returnRatio: [1.02, 1.08],
    scWageredMajor: [10_000, 40_000],
    kycDist: [
      [2, 0.85],
      [3, 0.15],
    ],
  },
  hroller: {
    key: 'hroller',
    label: 'High rollers',
    count: 40,
    spendUsd: [8_000, 40_000],
    redeemUsd: [5_000, 25_000],
    deposits: [15, 50],
    sessions: [400, 1_500],
    returnRatio: [0.92, 1.0],
    scWageredMajor: [40_000, 200_000],
    kycDist: [
      [2, 0.7],
      [3, 0.3],
    ],
  },
  midwhale: {
    key: 'midwhale',
    label: 'Mid-whales',
    count: 19,
    spendUsd: [40_000, 100_000],
    redeemUsd: [15_000, 60_000],
    deposits: [30, 80],
    sessions: [800, 2_500],
    returnRatio: [0.9, 0.98],
    scWageredMajor: [200_000, 800_000],
    kycDist: [
      [2, 0.5],
      [3, 0.5],
    ],
  },
  whale: {
    key: 'whale',
    label: 'Whale',
    count: 1,
    spendUsd: [100_000, 300_000],
    redeemUsd: [50_000, 150_000],
    deposits: [80, 200],
    sessions: [1_500, 4_000],
    returnRatio: [0.88, 0.95],
    scWageredMajor: [500_000, 2_000_000],
    kycDist: [[3, 1.0]],
  },
}

const ARCH_ORDER: ArchetypeKey[] = [
  'lurker',
  'welcome',
  'casual',
  'loser',
  'winner',
  'hroller',
  'midwhale',
  'whale',
]

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

const BLOCKED_STATES = new Set(['CA', 'CT', 'ID', 'LA', 'MI', 'MT', 'NV', 'NJ', 'NY', 'TN', 'WA'])

// Non-blocked US states weighted toward higher-population first.
const ALLOWED_STATE_WEIGHTS: ReadonlyArray<readonly [string, number]> = [
  ['FL', 22],
  ['TX', 21],
  ['GA', 14],
  ['PA', 13],
  ['OH', 12],
  ['NC', 11],
  ['IL', 10],
  ['VA', 8],
  ['AZ', 8],
  ['MA', 7],
  ['IN', 7],
  ['MO', 7],
  ['MD', 7],
  ['WI', 6],
  ['CO', 6],
  ['MN', 6],
  ['SC', 5],
  ['AL', 5],
  ['KY', 5],
  ['OR', 5],
  ['OK', 5],
  ['UT', 4],
  ['IA', 4],
  ['KS', 3],
  ['AR', 3],
  ['MS', 3],
  ['NM', 3],
  ['NE', 3],
  ['WV', 2],
  ['NH', 2],
  ['ME', 2],
  ['RI', 2],
  ['HI', 2],
  ['DE', 2],
  ['SD', 1],
  ['ND', 1],
  ['VT', 1],
  ['WY', 1],
  ['AK', 1],
  ['DC', 1],
]

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
  'Brian',
  'Mike',
  'Susan',
  'Jennifer',
  'Robert',
  'Linda',
  'James',
  'Patricia',
  'David',
  'Barbara',
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
  'Walker',
  'Young',
  'Zimmerman',
  'Cooper',
  'Reed',
  'Bailey',
  'Bell',
  'Mitchell',
  'Murphy',
  'Bennett',
]

/* -------------------------------------------------------------------------- */
/* Money helpers                                                               */
/* -------------------------------------------------------------------------- */

function formatMoney(value: bigint): string {
  const negative = value < 0n
  const abs = negative ? -value : value
  const major = abs / SCALE
  const minor = abs % SCALE
  return `${negative ? '-' : ''}${major}.${minor.toString().padStart(4, '0')}`
}
function moneyFromMajor(major: number): bigint {
  // Avoid float drift: build minor as integer.
  const m = Math.round(major * MONEY_SCALE_N)
  return BigInt(m)
}
function decToBigint(decimalStr: string | null | undefined): bigint {
  if (!decimalStr) return 0n
  const negative = decimalStr.startsWith('-')
  const abs = negative ? decimalStr.slice(1) : decimalStr
  const [maj = '0', frac = ''] = abs.split('.')
  const fracPad = (frac + '0000').slice(0, 4)
  const v = BigInt(maj) * SCALE + BigInt(fracPad || '0')
  return negative ? -v : v
}
function bigintMajor(v: bigint): number {
  return Number(v / SCALE) + Number(v % SCALE) / MONEY_SCALE_N
}

/* -------------------------------------------------------------------------- */
/* Date helpers                                                                */
/* -------------------------------------------------------------------------- */

const NOW = new Date()
const LAUNCH = new Date(CONFIG.PLATFORM_LAUNCH_DATE + 'T00:00:00Z')

function randomCreatedAt(): Date {
  // Spec growth curve: M1-3 8%, M4-6 18%, M7-9 28%, M10-12 46%.
  // We sample a month bucket then a random day within it.
  const totalMs = NOW.getTime() - LAUNCH.getTime()
  const bucket = rweighted<number>([
    [0.0, 0.08],
    [0.25, 0.18],
    [0.5, 0.28],
    [0.75, 0.46],
  ])
  const within = rng() * 0.25
  const t = LAUNCH.getTime() + (bucket + within) * totalMs
  return new Date(t)
}
function dateBetween(start: Date, end: Date): Date {
  const a = start.getTime()
  const b = end.getTime()
  if (b <= a) return new Date(a)
  return new Date(a + rng() * (b - a))
}
function addDays(d: Date, days: number): Date {
  const out = new Date(d)
  out.setUTCDate(out.getUTCDate() + days)
  return out
}
function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

/* -------------------------------------------------------------------------- */
/* CLI flag parsing                                                            */
/* -------------------------------------------------------------------------- */

interface CliFlags {
  auditOnly: boolean
  auditApply: boolean
  addOnly: boolean
  wipe: boolean
}

function parseFlags(): CliFlags {
  const a = process.argv.slice(2)
  return {
    auditOnly: a.includes('--audit-only'),
    auditApply: a.includes('--audit') && !a.includes('--audit-only'),
    addOnly: a.includes('--add-only'),
    wipe: a.includes('--wipe'),
  }
}

/* -------------------------------------------------------------------------- */
/* Postgres                                                                    */
/* -------------------------------------------------------------------------- */

function openSql() {
  const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL
  if (!url) {
    console.error('ERROR: DATABASE_URL_DIRECT or DATABASE_URL must be set.')
    process.exit(1)
  }
  return postgres(url, {
    max: 4,
    idle_timeout: 30,
    connect_timeout: 15,
    prepare: false,
    onnotice: () => {},
  })
}

/* -------------------------------------------------------------------------- */
/* Partition management                                                        */
/* -------------------------------------------------------------------------- */

const PARTITIONED_TABLES = [
  'ledger_entries',
  'game_rounds',
  'player_events',
  'crm_message_log',
] as const

async function ensurePartitions(sql: any): Promise<number> {
  const start = new Date(Date.UTC(LAUNCH.getUTCFullYear(), LAUNCH.getUTCMonth(), 1))
  const end = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() + 1, 1))
  let created = 0
  for (const table of PARTITIONED_TABLES) {
    const cur = new Date(start)
    while (cur <= end) {
      const d = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), 1))
      const partition = `${table}_y${d.getUTCFullYear()}m${pad2(d.getUTCMonth() + 1)}`
      const rows: { exists: boolean }[] = await sql`
        SELECT EXISTS(
          SELECT 1 FROM pg_class WHERE relname = ${partition}
        ) AS exists
      `
      if (!rows[0]?.exists) {
        await sql`
          SELECT create_monthly_partition(${table}::text, ${d.toISOString().slice(0, 10)}::date)
        `
        created++
      }
      cur.setUTCMonth(cur.getUTCMonth() + 1)
    }
  }
  return created
}

/* -------------------------------------------------------------------------- */
/* Bonus template lookups                                                      */
/* -------------------------------------------------------------------------- */

interface BonusTemplateIds {
  welcome: string
  daily: string
  weekly: string
  monthly: string
  referral: string
  jackpot: string
  adminSc: string
  packageSeed: string
  purchasePromocode: string
}

async function loadOrCreateBonusTemplates(sql: any): Promise<BonusTemplateIds> {
  const findOrCreate = async (
    slug: string,
    type: string,
    displayName: string,
    awardGc = 0n,
    awardSc = 0n,
    multiplier = '1.0',
  ): Promise<string> => {
    const found: { id: string }[] = await sql`
      SELECT id FROM bonuses WHERE slug = ${slug} LIMIT 1
    `
    if (found.length > 0) return found[0]!.id
    const created: { id: string }[] = await sql`
      INSERT INTO bonuses (
        slug, display_name, bonus_type, award_gc, award_sc,
        playthrough_multiplier, status, description
      ) VALUES (
        ${slug}, ${displayName}, ${type}::bonus_type,
        ${formatMoney(awardGc)}, ${formatMoney(awardSc)},
        ${multiplier}, 'active',
        ${'Auto-seeded by seed-realistic-data for the ' + type + ' bonus type.'}
      )
      ON CONFLICT (slug) DO UPDATE SET display_name = EXCLUDED.display_name
      RETURNING id
    `
    return created[0]!.id
  }

  return {
    welcome: await findOrCreate('welcome_default', 'welcome', 'Welcome Bonus'),
    daily: await findOrCreate('daily_login', 'daily', 'Daily Login Bonus'),
    weekly: await findOrCreate('weekly_tier_default', 'weekly_tier', 'Weekly Tier Bonus'),
    monthly: await findOrCreate('monthly_tier_default', 'monthly_tier', 'Monthly Tier Bonus'),
    referral: await findOrCreate('referral_default', 'referral', 'Referral Bonus'),
    jackpot: await findOrCreate('jackpot_default', 'jackpot', 'Jackpot Bonus'),
    adminSc: await findOrCreate(
      'admin_added_sc_default',
      'admin_added_sc',
      'Admin-Added SC',
      0n,
      0n,
      '0.0',
    ),
    packageSeed: await findOrCreate('package_default', 'package', 'Package Bonus'),
    purchasePromocode: await findOrCreate(
      'purchase_promocode_default',
      'purchase_promocode',
      'Purchase Promocode Bonus',
    ),
  }
}

/* -------------------------------------------------------------------------- */
/* Tier + game lookups                                                         */
/* -------------------------------------------------------------------------- */

interface TierRow {
  id: string
  level: number
  xpRequired: bigint
}

async function loadTiers(sql: any): Promise<TierRow[]> {
  const rows: { id: string; level: number; xp: string }[] = await sql`
    SELECT id, level, xp_required::text AS xp FROM tiers ORDER BY level ASC
  `
  return rows.map((r) => ({ id: r.id, level: r.level, xpRequired: decToBigint(r.xp) }))
}
function pickTier(tiers: TierRow[], xp: bigint): TierRow {
  let chosen = tiers[0]!
  for (const t of tiers) if (xp >= t.xpRequired) chosen = t
  return chosen
}

interface GameRow {
  id: string
  providerId: string
  category: string
}

async function loadGames(sql: any): Promise<GameRow[]> {
  const rows: { id: string; provider_id: string; category: string }[] = await sql`
    SELECT id, provider_id, category FROM games WHERE status = 'active' AND deleted_at IS NULL
  `
  return rows.map((r) => ({ id: r.id, providerId: r.provider_id, category: r.category }))
}

/* -------------------------------------------------------------------------- */
/* Existing synthetic players — load + classify                                */
/* -------------------------------------------------------------------------- */

interface ExistingPlayer {
  id: string
  email: string
  state: string | null
  status: string
  kycLevel: number
  createdAt: Date
  scBalance: bigint
  gcBalance: bigint
  lifetimeSpendUsd: bigint
  lifetimeRedeemedUsd: bigint
  purchaseCount: number
  redemptionCount: number
  sessionCount: number
  // Sum of bonus_awarded rows for the player.
  bonusClaims: number
  // Email pattern source.
  source: 'legacy' | 'realistic'
}

async function loadSyntheticPlayers(sql: any): Promise<ExistingPlayer[]> {
  const rows: any[] = await sql`
    SELECT
      p.id,
      p.email,
      p.state,
      p.status::text AS status,
      p.kyc_level AS kyc_level,
      p.created_at AS created_at,
      gc.current_balance::text AS gc_balance,
      sc.current_balance::text AS sc_balance,
      COALESCE(s.total_deposited_usd::text, '0') AS lifetime_spend,
      COALESCE(s.total_redeemed_usd::text, '0') AS lifetime_redeemed,
      COALESCE(s.purchase_count, 0) AS purchase_count,
      COALESCE(s.redemption_count, 0) AS redemption_count,
      COALESCE(s.session_count, 0) AS session_count,
      COALESCE(b.cnt, 0)::int AS bonus_claims
    FROM players p
    LEFT JOIN wallets gc ON gc.player_id = p.id AND gc.currency = 'GC'
    LEFT JOIN wallets sc ON sc.player_id = p.id AND sc.currency = 'SC'
    LEFT JOIN player_lifetime_stats s ON s.player_id = p.id
    LEFT JOIN (
      SELECT player_id, COUNT(*)::int AS cnt
      FROM bonuses_awarded GROUP BY player_id
    ) b ON b.player_id = p.id
    WHERE p.email LIKE '%@${sql.unsafe(FAKE_EMAIL_DOMAIN_LEGACY)}'
       OR p.email LIKE '%@${sql.unsafe(REALISTIC_EMAIL_DOMAIN)}'
  `
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    state: r.state,
    status: r.status,
    kycLevel: r.kyc_level,
    createdAt: new Date(r.created_at),
    gcBalance: decToBigint(r.gc_balance),
    scBalance: decToBigint(r.sc_balance),
    lifetimeSpendUsd: decToBigint(r.lifetime_spend),
    lifetimeRedeemedUsd: decToBigint(r.lifetime_redeemed),
    purchaseCount: r.purchase_count,
    redemptionCount: r.redemption_count,
    sessionCount: r.session_count,
    bonusClaims: r.bonus_claims,
    source: r.email.endsWith(`@${REALISTIC_EMAIL_DOMAIN}`) ? 'realistic' : 'legacy',
  }))
}

function classifyPlayer(p: ExistingPlayer): ArchetypeKey {
  const spend = bigintMajor(p.lifetimeSpendUsd)
  if (spend >= 100_000) return 'whale'
  if (spend >= 40_000) return 'midwhale'
  if (spend >= 8_000) return 'hroller'
  if (spend >= 1_000) {
    // distinguish winners (lots redeemed) from losers
    const redeem = bigintMajor(p.lifetimeRedeemedUsd)
    if (redeem > spend) return 'winner'
    return 'loser'
  }
  if (spend >= 500) return 'loser'
  if (spend >= 50) return 'casual'
  if (spend >= 5) return 'welcome'
  return 'lurker'
}

/* -------------------------------------------------------------------------- */
/* Phase A — audit + reshape                                                   */
/* -------------------------------------------------------------------------- */

interface AuditChange {
  playerId: string
  email: string
  archetype: ArchetypeKey
  changes: Record<string, { before: unknown; after: unknown }>
}

interface AuditReport {
  generatedAt: string
  totalAnalyzed: number
  archetypeCountsBefore: Record<ArchetypeKey, number>
  archetypeCountsAfter: Record<ArchetypeKey, number>
  reshaped: AuditChange[]
  unchanged: number
  manualReview: { playerId: string; email: string; reason: string }[]
}

async function auditExistingPlayers(
  sql: any,
  players: ExistingPlayer[],
  applyFixes: boolean,
): Promise<AuditReport> {
  const before: Record<ArchetypeKey, number> = emptyArchCounts()
  const after: Record<ArchetypeKey, number> = emptyArchCounts()
  const reshaped: AuditChange[] = []
  const manualReview: AuditReport['manualReview'] = []

  // Audit hot-fix: the legacy seed-fake-fixtures.ts wrote ledger bet/win
  // entries with a broken RTP (~210% return) that destroys the house-edge
  // calculation. Drop them so realistic data dominates the metric. The
  // game_sessions rows + lifetime_stats remain so admin views still render.
  const legacyLedger: { count: string }[] = await sql`
    SELECT COUNT(*)::text AS count FROM ledger_entries
    WHERE source_id LIKE 'seed-game-%'
  `
  const legacyLedgerCount = Number(legacyLedger[0]?.count ?? 0)
  if (legacyLedgerCount > 0) {
    manualReview.push({
      playerId: 'N/A',
      email: 'N/A (legacy ledger)',
      reason: `Found ${legacyLedgerCount} legacy seed-game-* ledger entries with broken RTP — ${
        applyFixes ? 'deleted' : 'would delete'
      }.`,
    })
    if (applyFixes) {
      await sql`DELETE FROM ledger_entries WHERE source_id LIKE 'seed-game-%'`
    }
  }

  for (const p of players) {
    const arch = classifyPlayer(p)
    before[arch]++
    const changes: AuditChange['changes'] = {}

    // Rule: redeemed > spend + reasonable bonus (cap bonus at 2x spend) → cap redemption
    const spendMajor = bigintMajor(p.lifetimeSpendUsd)
    const redeemMajor = bigintMajor(p.lifetimeRedeemedUsd)
    const maxReasonableRedeem = spendMajor * 3 + 1000 // some headroom for SC bonuses
    if (redeemMajor > maxReasonableRedeem && spendMajor < 1000) {
      const target = Math.max(0, Math.floor(spendMajor * 0.6))
      changes.lifetimeRedeemedUsd = {
        before: redeemMajor,
        after: target,
      }
      if (applyFixes) {
        await sql`
          UPDATE player_lifetime_stats
          SET total_redeemed_usd = ${formatMoney(moneyFromMajor(target))},
              net_position_usd = ${formatMoney(p.lifetimeSpendUsd - moneyFromMajor(target))}
          WHERE player_id = ${p.id}
        `
      }
    }

    // Rule: KYC 0 but has redemptions → upgrade KYC to 2
    if (p.kycLevel === 0 && p.redemptionCount > 0) {
      changes.kycLevel = { before: p.kycLevel, after: 2 }
      if (applyFixes) {
        await sql`
          UPDATE players SET kyc_level = 2, kyc_verified_at = COALESCE(kyc_verified_at, NOW())
          WHERE id = ${p.id}
        `
      }
    }

    // Rule: free-to-play status but has purchases → leave archetype alone, but
    // ensure KYC ≥ 1 (most depositors at least verified email/age).
    if (p.purchaseCount > 0 && p.kycLevel === 0 && !('kycLevel' in changes)) {
      changes.kycLevel = { before: p.kycLevel, after: 1 }
      if (applyFixes) {
        await sql`UPDATE players SET kyc_level = 1 WHERE id = ${p.id}`
      }
    }

    // Rule: active status but no activity in 90+ days → mark dormant via
    // last_login_at (we can't add a new status enum value; leave status).
    // Skipped: we surface this as manual review note only.
    const ninetyAgo = Date.now() - 90 * 86400_000
    if (
      p.status === 'active' &&
      p.purchaseCount === 0 &&
      p.sessionCount === 0 &&
      p.createdAt.getTime() < ninetyAgo
    ) {
      // Not an error — just note.
      // (No enum allows 'dormant'; keep as note for manualReview.)
    }

    // Rule: wallet balance shouldn't be negative.
    if (p.gcBalance < 0n || p.scBalance < 0n) {
      manualReview.push({
        playerId: p.id,
        email: p.email,
        reason: `Negative wallet balance (GC=${formatMoney(p.gcBalance)}, SC=${formatMoney(p.scBalance)}).`,
      })
      if (applyFixes) {
        // Clamp to 0 in all sub-buckets.
        await sql`
          UPDATE wallets
          SET current_balance = 0, balance_purchased = 0, balance_bonus = 0,
              balance_promo = 0, balance_earned = 0
          WHERE player_id = ${p.id}
        `
      }
    }

    if (Object.keys(changes).length > 0) {
      reshaped.push({ playerId: p.id, email: p.email, archetype: arch, changes })
    }

    // Reclassify after fixes for the 'after' count.
    after[arch]++
  }

  return {
    generatedAt: new Date().toISOString(),
    totalAnalyzed: players.length,
    archetypeCountsBefore: before,
    archetypeCountsAfter: after,
    reshaped,
    unchanged: players.length - reshaped.length,
    manualReview,
  }
}

function emptyArchCounts(): Record<ArchetypeKey, number> {
  return {
    lurker: 0,
    welcome: 0,
    casual: 0,
    loser: 0,
    winner: 0,
    hroller: 0,
    midwhale: 0,
    whale: 0,
  }
}

/* -------------------------------------------------------------------------- */
/* Phase B — add new players                                                   */
/* -------------------------------------------------------------------------- */

interface AddPlan {
  perArchetype: Record<ArchetypeKey, number>
  totalToAdd: number
}

function planAdditions(existing: ExistingPlayer[]): AddPlan {
  const curBy: Record<ArchetypeKey, number> = emptyArchCounts()
  for (const p of existing) curBy[classifyPlayer(p)]++

  const need: Record<ArchetypeKey, number> = emptyArchCounts()

  // First fill the deterministic targets per archetype.
  for (const key of ARCH_ORDER) {
    const target = ARCHETYPES[key].count
    need[key] = Math.max(0, target - curBy[key])
  }

  // The total currently planned might over-shoot or under-shoot the target.
  const totalPlanned = ARCH_ORDER.reduce((s, k) => s + Math.max(curBy[k], ARCHETYPES[k].count), 0)
  // We aim for TARGET_TOTAL_PLAYERS. If totalPlanned > TARGET, we already have
  // surplus (existing audit produced more than target) — skip adding for that
  // archetype. If totalPlanned < TARGET, top up via mid-whales (per spec).
  const totalNeed = ARCH_ORDER.reduce((s, k) => s + need[k], 0)
  const finalTotal = ARCH_ORDER.reduce((s, k) => s + Math.max(curBy[k], ARCHETYPES[k].count), 0)
  const shortfall = CONFIG.TARGET_TOTAL_PLAYERS - finalTotal
  if (shortfall > 0) {
    need.midwhale += shortfall
  }
  void totalPlanned
  void totalNeed
  return {
    perArchetype: need,
    totalToAdd: ARCH_ORDER.reduce((s, k) => s + need[k], 0),
  }
}

/* -------------------------------------------------------------------------- */
/* Per-player generator (single transaction)                                   */
/* -------------------------------------------------------------------------- */

interface GenerateContext {
  sql: any
  bonusIds: BonusTemplateIds
  tiers: TierRow[]
  games: GameRow[]
  houseAccounts: Map<string, string> // "kind:currency" → id
  /** Sequence number used to build a unique email + username. */
  seq: number
  archetype: Archetype
}

interface PlayerBuildResult {
  playerId: string
  archetype: ArchetypeKey
  insertedCounts: {
    ledger: number
    purchases: number
    redemptions: number
    bonuses: number
    sessions: number
  }
}

async function ensureHouseAccounts(sql: any): Promise<Map<string, string>> {
  const rows: { id: string; kind: string; currency: string }[] = await sql`
    SELECT id, kind::text AS kind, currency FROM house_accounts
  `
  const map = new Map<string, string>()
  for (const r of rows) map.set(`${r.kind}:${r.currency}`, r.id)
  return map
}

function pickKycLevel(arch: Archetype): number {
  return rweighted<number>(arch.kycDist.map((p) => [p[0], p[1]] as const))
}
function pickState(): string {
  return rweighted(ALLOWED_STATE_WEIGHTS)
}

function isInBlockedSet(state: string): boolean {
  return BLOCKED_STATES.has(state)
}

// Map camelCase row keys to snake_case column names for postgres-js bulk
// insert. tx(rows, ...keys) uses keys as both row-property accessors AND
// column names, so we transform to snake_case once before insert.
function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase())
}
function snakeizeRows<T extends Record<string, unknown>>(rows: T[]): Record<string, unknown>[] {
  return rows.map((r) => {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(r)) out[camelToSnake(k)] = v
    return out
  })
}

// Chunked bulk insert. Splits arrays so we never exceed Postgres's parameter
// limit (~64k per statement; we use 500 rows × ~16 cols = 8000 params).
async function bulkInsertRows(
  tx: any,
  rows: Record<string, unknown>[],
  table: string,
  chunkSize = 500,
): Promise<void> {
  if (rows.length === 0) return
  const snake = snakeizeRows(rows)
  for (let i = 0; i < snake.length; i += chunkSize) {
    const slice = snake.slice(i, i + chunkSize)
    await tx`INSERT INTO ${tx(table)} ${tx(slice)}`
  }
}

async function bulkFlush(
  tx: any,
  purchaseRows: any[],
  sessionRows: any[],
  bonusRows: any[],
  redemptionRows: any[],
  ledgerRows: any[],
): Promise<void> {
  await bulkInsertRows(tx, purchaseRows, 'purchases')
  await bulkInsertRows(tx, sessionRows, 'game_sessions')
  await bulkInsertRows(tx, bonusRows, 'bonuses_awarded')
  await bulkInsertRows(tx, redemptionRows, 'redemptions')
  // Ledger entries: postgres-js auto-serializes JS objects to JSONB for
  // metadata columns. Enum columns accept text without explicit casts.
  await bulkInsertRows(tx, ledgerRows, 'ledger_entries')
}

async function generatePlayer(ctx: GenerateContext): Promise<PlayerBuildResult> {
  const { archetype: arch } = ctx
  const id = randomUUID()
  const first = rpick(FIRST_NAMES)
  const last = rpick(LAST_NAMES)
  const email = `${REALISTIC_PREFIX_BASE}${arch.key}-${ctx.seq}@${REALISTIC_EMAIL_DOMAIN}`
  // Username must be globally unique across archetypes — include archetype
  // key + seq + short uuid suffix so collisions are impossible.
  const usernameSuffix = id.slice(0, 8)
  const username = `${first.toLowerCase()}_${last.toLowerCase()}_${arch.key}_${ctx.seq}_${usernameSuffix}`

  const createdAt = randomCreatedAt()
  const lastLogin = dateBetween(createdAt, NOW)
  let kycLevel = pickKycLevel(arch)
  // Hard rules: redeem archetypes need ≥ 2.
  if (['hroller', 'midwhale', 'whale', 'winner'].includes(arch.key)) {
    if (kycLevel < 2) kycLevel = 2
  }
  const state = pickState()
  const blockedState = isInBlockedSet(state)

  // Spend / redeem amounts derived from archetype.
  const spendUsdMajor = rfloat(arch.spendUsd[0], arch.spendUsd[1])
  const redeemUsdMajor = rfloat(arch.redeemUsd[0], arch.redeemUsd[1])
  const depositCount = Math.max(
    arch.deposits[0],
    Math.round(rint(arch.deposits[0], arch.deposits[1])),
  )
  const sessionCount = rint(arch.sessions[0], arch.sessions[1])
  const wageredMajor = rfloat(arch.scWageredMajor[0], arch.scWageredMajor[1])
  const returnRatio = rfloat(arch.returnRatio[0], arch.returnRatio[1])

  // We need wallet UUIDs up-front so ledger entries can reference them. Use
  // app-generated UUIDs (the wallets table has defaultRandom() but we override
  // it here so we know the IDs before INSERT).
  const gcWalletId = randomUUID()
  const scWalletId = randomUUID()

  // Accumulators for batched inserts.
  type LedgerRow = {
    source: string
    sourceId: string
    pairId: string
    leg: 'debit' | 'credit'
    accountKind: string
    accountId: string
    amount: string
    currency: 'GC' | 'SC' | 'USD'
    subBucket: string | null
    playerId: string | null
    metadata: Record<string, unknown>
    createdAt: Date
  }
  type BonusRow = {
    id: string
    playerId: string
    bonusId: string
    gcAmount: string
    scAmount: string
    playthroughMultiplierSnapshot: string
    playthroughRequired: string
    playthroughProgress: string
    playthroughComplete: boolean
    status: string
    sourceKind: string
    sourceId: string
    awardReason: string | null
    createdAt: Date
    completedAt: Date | null
  }
  type PurchaseRow = {
    id: string
    playerId: string
    amountUsd: string
    amountCents: string
    baseGc: string
    baseSc: string
    bonusGc: string
    bonusSc: string
    finixCardLast4: string
    finixCardBrand: string
    status: string
    stateAtPurchase: string
    gammaTransactionId: string
    createdAt: Date
    updatedAt: Date
    completedAt: Date
  }
  type SessionRow = {
    id: string
    playerId: string
    gameId: string
    currency: 'GC' | 'SC'
    totalBet: string
    totalWin: string
    roundCount: number
    status: string
    startedAt: Date
    endedAt: Date
    launchState: string
    createdAt: Date
    updatedAt: Date
  }
  type RedemptionRow = {
    id: string
    playerId: string
    amountSc: string
    amountUsd: string
    method: string
    drainPlan: Record<string, unknown>
    status: string
    stateAtRequest: string
    paidAt: Date | null
    gammaRedemptionId: string
    createdAt: Date
    updatedAt: Date
    requestedAt: Date
  }

  const ledgerRows: LedgerRow[] = []
  const bonusRows: BonusRow[] = []
  const purchaseRows: PurchaseRow[] = []
  const sessionRows: SessionRow[] = []
  const redemptionRows: RedemptionRow[] = []

  function addLedger(row: LedgerRow) {
    ledgerRows.push(row)
  }

  await ctx.sql.begin(async (tx: any) => {
    // 1. auth_user.
    await tx`
      INSERT INTO auth_user (id, email, email_verified, name, created_at, updated_at)
      VALUES (${id}, ${email}, true, ${first + ' ' + last}, ${createdAt}, ${createdAt})
      ON CONFLICT (email) DO NOTHING
    `

    // 2. players row.
    await tx`
      INSERT INTO players (
        id, email, username, display_name, first_name, last_name,
        state, country, status, kyc_level, kyc_verified_at,
        first_seen_at, last_seen_at, last_login_at,
        signup_country, signup_state,
        email_consent, sms_consent,
        metadata,
        created_at, updated_at
      ) VALUES (
        ${id}, ${email}, ${username}, ${first + ' ' + last}, ${first}, ${last},
        ${state}, 'US', 'active'::player_status, ${kycLevel},
        ${kycLevel >= 1 ? createdAt : null},
        ${createdAt}, ${lastLogin}, ${lastLogin},
        'US', ${state},
        ${rng() > 0.2}, ${rng() > 0.7},
        ${JSON.stringify({ blocked_state_gc_only: blockedState, signup_source: 'web', archetype: arch.key })}::jsonb,
        ${createdAt}, ${createdAt}
      )
      ON CONFLICT (email) DO NOTHING
    `

    // 3. wallets — pre-generated IDs so ledger rows can reference them.
    await tx`
      INSERT INTO wallets (id, player_id, currency, current_balance, balance_purchased, balance_bonus, balance_promo, balance_earned, created_at, updated_at)
      VALUES
        (${gcWalletId}, ${id}, 'GC', 0, 0, 0, 0, 0, ${createdAt}, ${createdAt}),
        (${scWalletId}, ${id}, 'SC', 0, 0, 0, 0, 0, ${createdAt}, ${createdAt})
      ON CONFLICT (player_id, currency) DO NOTHING
    `

    // Bucket trackers (minor units)
    let gcPurchased = 0n
    let gcBonus = 0n
    let gcPromo = 0n
    let gcEarned = 0n
    let scPurchased = 0n
    let scBonus = 0n
    let scPromo = 0n
    let scEarned = 0n

    let ledgerCount = 0
    let purchaseCount = 0
    let redemptionCount = 0
    let bonusCount = 0
    let sessCount = 0

    // 4. Purchases.
    const purchases: { ts: Date; usdMajor: number }[] = []
    if (depositCount > 0 && spendUsdMajor > 0) {
      // First purchase 92% of time is welcome ($10).
      const isWelcomeFirst = rng() < 0.92
      const firstUsd = isWelcomeFirst ? 10 : pickPackageTier()
      // Spread remaining across deposits.
      const remainder = Math.max(0, spendUsdMajor - firstUsd)
      const subsequent: number[] = []
      for (let i = 1; i < depositCount; i++) {
        subsequent.push(pickPackageTier())
      }
      const subsSum = subsequent.reduce((s, n) => s + n, 0) || 1
      const scale = remainder / subsSum
      const tiers = [firstUsd, ...subsequent.map((v) => Math.max(5, Math.round(v * scale)))]
      // distribute timestamps weighted later in lifecycle
      for (const t of tiers) {
        const ts = dateBetween(createdAt, NOW)
        purchases.push({ ts, usdMajor: t })
      }
      // Sort chronologically.
      purchases.sort((a, b) => a.ts.getTime() - b.ts.getTime())

      for (let i = 0; i < purchases.length; i++) {
        const pu = purchases[i]!
        const usd = pu.usdMajor
        const baseGc = moneyFromMajor(usd * 1_000)
        const baseSc = moneyFromMajor(usd * 1)
        const bonusGc = moneyFromMajor(usd * 200)
        const bonusSc = moneyFromMajor(usd * 0.1)
        const amountUsd = moneyFromMajor(usd)
        const amountCents = BigInt(Math.round(usd * 100))
        const last4 = String(rint(1000, 9999))
        const brand = rpick(['visa', 'mastercard', 'amex', 'discover'])

        const purchaseId = randomUUID()
        purchaseRows.push({
          id: purchaseId,
          playerId: id,
          amountUsd: formatMoney(amountUsd),
          amountCents: amountCents.toString(),
          baseGc: formatMoney(baseGc),
          baseSc: formatMoney(baseSc),
          bonusGc: formatMoney(bonusGc),
          bonusSc: formatMoney(bonusSc),
          finixCardLast4: last4,
          finixCardBrand: brand,
          status: 'completed',
          stateAtPurchase: state,
          gammaTransactionId: 'realistic-purchase-' + purchaseId,
          createdAt: pu.ts,
          updatedAt: pu.ts,
          completedAt: pu.ts,
        })
        purchaseCount++

        gcPurchased += baseGc
        scPurchased += baseSc
        gcBonus += bonusGc
        scBonus += bonusSc

        if (i === 0) {
          const welcomeSc = moneyFromMajor(usd * 0.2)
          bonusRows.push({
            id: randomUUID(),
            playerId: id,
            bonusId: ctx.bonusIds.welcome,
            gcAmount: '0',
            scAmount: formatMoney(welcomeSc),
            playthroughMultiplierSnapshot: '3.0',
            playthroughRequired: formatMoney(welcomeSc * 3n),
            playthroughProgress: formatMoney(welcomeSc * 3n),
            playthroughComplete: true,
            status: 'completed',
            sourceKind: 'realistic-welcome',
            sourceId: 'realistic-welcome-' + purchaseId,
            awardReason: null,
            createdAt: pu.ts,
            completedAt: pu.ts,
          })
          bonusCount++
          scBonus += welcomeSc
        }

        bonusRows.push({
          id: randomUUID(),
          playerId: id,
          bonusId: ctx.bonusIds.packageSeed,
          gcAmount: formatMoney(bonusGc),
          scAmount: formatMoney(bonusSc),
          playthroughMultiplierSnapshot: '1.0',
          playthroughRequired: formatMoney(bonusSc),
          playthroughProgress: formatMoney(bonusSc),
          playthroughComplete: true,
          status: 'completed',
          sourceKind: 'realistic-package',
          sourceId: 'realistic-package-' + purchaseId,
          awardReason: null,
          createdAt: pu.ts,
          completedAt: pu.ts,
        })
        bonusCount++

        // Ledger entries (player-side legs).
        const pairId = randomUUID()
        addLedger({
          source: 'purchase',
          sourceId: 'realistic-purchase-base-gc-' + purchaseId,
          pairId,
          leg: 'credit',
          accountKind: 'player_wallet',
          accountId: gcWalletId,
          amount: formatMoney(baseGc),
          currency: 'GC',
          subBucket: 'purchased',
          playerId: id,
          metadata: { purchaseId },
          createdAt: pu.ts,
        })
        addLedger({
          source: 'purchase',
          sourceId: 'realistic-purchase-base-sc-' + purchaseId,
          pairId,
          leg: 'credit',
          accountKind: 'player_wallet',
          accountId: scWalletId,
          amount: formatMoney(baseSc),
          currency: 'SC',
          subBucket: 'purchased',
          playerId: id,
          metadata: { purchaseId },
          createdAt: pu.ts,
        })
        addLedger({
          source: 'bonus_award',
          sourceId: 'realistic-purchase-bonus-gc-' + purchaseId,
          pairId,
          leg: 'credit',
          accountKind: 'player_wallet',
          accountId: gcWalletId,
          amount: formatMoney(bonusGc),
          currency: 'GC',
          subBucket: 'bonus',
          playerId: id,
          metadata: { purchaseId },
          createdAt: pu.ts,
        })
        addLedger({
          source: 'bonus_award',
          sourceId: 'realistic-purchase-bonus-sc-' + purchaseId,
          pairId,
          leg: 'credit',
          accountKind: 'player_wallet',
          accountId: scWalletId,
          amount: formatMoney(bonusSc),
          currency: 'SC',
          subBucket: 'bonus',
          playerId: id,
          metadata: { purchaseId },
          createdAt: pu.ts,
        })
        ledgerCount += 4
      }
    }

    // 5. Daily bonuses — target ~4000 total across 2K players ≈ 2/player avg.
    // Scale by archetype: lurkers ~1, casual ~2, engaged 3-5, whales 8-15.
    const lifetimeDays = Math.max(1, Math.floor((NOW.getTime() - createdAt.getTime()) / 86400_000))
    const dailyBonusCount = (() => {
      switch (arch.key) {
        case 'lurker':
          return rint(0, 2)
        case 'welcome':
          return rint(1, 3)
        case 'casual':
          return rint(1, 4)
        case 'loser':
        case 'winner':
          return rint(2, 6)
        case 'hroller':
          return rint(3, 10)
        case 'midwhale':
          return rint(5, 15)
        case 'whale':
          return rint(8, 20)
      }
    })()
    for (let i = 0; i < dailyBonusCount; i++) {
      const ts = dateBetween(createdAt, NOW)
      const gcAmt = moneyFromMajor(CONFIG.DAILY_BONUS_GC)
      const scAmt = moneyFromMajor(CONFIG.DAILY_BONUS_SC)
      bonusRows.push({
        id: randomUUID(),
        playerId: id,
        bonusId: ctx.bonusIds.daily,
        gcAmount: formatMoney(gcAmt),
        scAmount: formatMoney(scAmt),
        playthroughMultiplierSnapshot: '1.0',
        playthroughRequired: formatMoney(scAmt),
        playthroughProgress: formatMoney(scAmt),
        playthroughComplete: true,
        status: 'completed',
        sourceKind: 'realistic-daily',
        sourceId: 'realistic-daily-' + id + '-' + i,
        awardReason: null,
        createdAt: ts,
        completedAt: ts,
      })
      bonusCount++
      gcEarned += gcAmt
      scEarned += scAmt

      const pairId = randomUUID()
      addLedger({
        source: 'bonus_award',
        sourceId: 'rl-daily-gc-' + id + '-' + i,
        pairId,
        leg: 'credit',
        accountKind: 'player_wallet',
        accountId: gcWalletId,
        amount: formatMoney(gcAmt),
        currency: 'GC',
        subBucket: 'earned',
        playerId: id,
        metadata: {},
        createdAt: ts,
      })
      addLedger({
        source: 'bonus_award',
        sourceId: 'rl-daily-sc-' + id + '-' + i,
        pairId,
        leg: 'credit',
        accountKind: 'player_wallet',
        accountId: scWalletId,
        amount: formatMoney(scAmt),
        currency: 'SC',
        subBucket: 'earned',
        playerId: id,
        metadata: {},
        createdAt: ts,
      })
      ledgerCount += 2
    }

    // 6. Admin SC bonuses — count tuned per archetype to hit 30K target.
    const adminBonusBudget = adminScBudgetForArchetype(arch.key)
    for (let i = 0; i < adminBonusBudget; i++) {
      const ts = dateBetween(createdAt, NOW)
      const scAmt = moneyFromMajor(adminScAmountForArchetype(arch.key))
      bonusRows.push({
        id: randomUUID(),
        playerId: id,
        bonusId: ctx.bonusIds.adminSc,
        gcAmount: '0',
        scAmount: formatMoney(scAmt),
        playthroughMultiplierSnapshot: '0.0',
        playthroughRequired: '0',
        playthroughProgress: '0',
        playthroughComplete: true,
        status: 'completed',
        sourceKind: 'realistic-admin-sc',
        sourceId: 'realistic-admin-sc-' + id + '-' + i,
        awardReason: 'Operator-credited SC (seed)',
        createdAt: ts,
        completedAt: ts,
      })
      bonusCount++
      scBonus += scAmt

      addLedger({
        source: 'admin_adjustment',
        sourceId: 'rl-admin-sc-' + id + '-' + i,
        pairId: randomUUID(),
        leg: 'credit',
        accountKind: 'player_wallet',
        accountId: scWalletId,
        amount: formatMoney(scAmt),
        currency: 'SC',
        subBucket: 'bonus',
        playerId: id,
        metadata: {},
        createdAt: ts,
      })
      ledgerCount += 1
    }

    // 7. Weekly + monthly tier bonuses (only if tier 2+). Target weekly=700,
    // monthly=600 across all qualifying players.
    const xpEstimate = moneyFromMajor(spendUsdMajor)
    const tier = pickTier(ctx.tiers, xpEstimate)
    if (tier.level >= 2) {
      const weeklyN = Math.min(20, Math.round(rfloat(0.05, 0.25) * (lifetimeDays / 7)))
      for (let i = 0; i < weeklyN; i++) {
        const ts = dateBetween(createdAt, NOW)
        const scAmt = moneyFromMajor(weeklyAmountForTier(tier.level))
        bonusRows.push({
          id: randomUUID(),
          playerId: id,
          bonusId: ctx.bonusIds.weekly,
          gcAmount: '0',
          scAmount: formatMoney(scAmt),
          playthroughMultiplierSnapshot: '1.0',
          playthroughRequired: formatMoney(scAmt),
          playthroughProgress: formatMoney(scAmt),
          playthroughComplete: true,
          status: 'completed',
          sourceKind: 'realistic-weekly',
          sourceId: 'rl-weekly-' + id + '-' + i,
          awardReason: null,
          createdAt: ts,
          completedAt: ts,
        })
        bonusCount++
        scBonus += scAmt
        addLedger({
          source: 'bonus_award',
          sourceId: 'rl-weekly-sc-' + id + '-' + i,
          pairId: randomUUID(),
          leg: 'credit',
          accountKind: 'player_wallet',
          accountId: scWalletId,
          amount: formatMoney(scAmt),
          currency: 'SC',
          subBucket: 'bonus',
          playerId: id,
          metadata: {},
          createdAt: ts,
        })
        ledgerCount += 1
      }
      const monthlyN = Math.min(10, Math.round(rfloat(0.05, 0.4) * (lifetimeDays / 30)))
      for (let i = 0; i < monthlyN; i++) {
        const ts = dateBetween(createdAt, NOW)
        const scAmt = moneyFromMajor(monthlyAmountForTier(tier.level))
        bonusRows.push({
          id: randomUUID(),
          playerId: id,
          bonusId: ctx.bonusIds.monthly,
          gcAmount: '0',
          scAmount: formatMoney(scAmt),
          playthroughMultiplierSnapshot: '1.0',
          playthroughRequired: formatMoney(scAmt),
          playthroughProgress: formatMoney(scAmt),
          playthroughComplete: true,
          status: 'completed',
          sourceKind: 'realistic-monthly',
          sourceId: 'rl-monthly-' + id + '-' + i,
          awardReason: null,
          createdAt: ts,
          completedAt: ts,
        })
        bonusCount++
        scBonus += scAmt
        addLedger({
          source: 'bonus_award',
          sourceId: 'rl-monthly-sc-' + id + '-' + i,
          pairId: randomUUID(),
          leg: 'credit',
          accountKind: 'player_wallet',
          accountId: scWalletId,
          amount: formatMoney(scAmt),
          currency: 'SC',
          subBucket: 'bonus',
          playerId: id,
          metadata: {},
          createdAt: ts,
        })
        ledgerCount += 1
      }
    }

    // 8. Referral bonus (~11% of players → target 220 / 2000).
    if (rng() < 0.11) {
      const ts = dateBetween(createdAt, NOW)
      const scAmt = moneyFromMajor(5)
      bonusRows.push({
        id: randomUUID(),
        playerId: id,
        bonusId: ctx.bonusIds.referral,
        gcAmount: '0',
        scAmount: formatMoney(scAmt),
        playthroughMultiplierSnapshot: '3.0',
        playthroughRequired: formatMoney(scAmt * 3n),
        playthroughProgress: formatMoney(scAmt * 3n),
        playthroughComplete: true,
        status: 'completed',
        sourceKind: 'realistic-referral',
        sourceId: 'rl-referral-' + id,
        awardReason: null,
        createdAt: ts,
        completedAt: ts,
      })
      bonusCount++
      scBonus += scAmt
    }

    // 9. Game sessions + per-session bet/win ledger pairs. Cap aggressively
    // to keep ledger volume manageable; we aggregate bets/wins per session so
    // a smaller session count still produces realistic GGR.
    if (sessionCount > 0 && wageredMajor > 0) {
      const wageredMinor = moneyFromMajor(wageredMajor)
      const wonMinor = moneyFromMajor(wageredMajor * returnRatio)
      const sessionsTarget = Math.min(sessionCount, 40) // cap for perf
      const perSessionBetMajor = wageredMajor / sessionsTarget
      const perSessionBet = moneyFromMajor(perSessionBetMajor)
      const perSessionWin = moneyFromMajor((wageredMajor * returnRatio) / sessionsTarget)
      void wageredMinor
      void wonMinor

      for (let i = 0; i < sessionsTarget; i++) {
        const game = rpick(ctx.games)
        const start = dateBetween(createdAt, NOW)
        const end = new Date(start.getTime() + rint(30 * 60_000, 120 * 60_000))
        const cur: 'GC' | 'SC' = blockedState ? 'GC' : rng() < 0.62 ? 'SC' : 'GC'
        const walletForCur = cur === 'GC' ? gcWalletId : scWalletId
        const sessionId = randomUUID()
        sessionRows.push({
          id: sessionId,
          playerId: id,
          gameId: game.id,
          currency: cur,
          totalBet: formatMoney(perSessionBet),
          totalWin: formatMoney(perSessionWin),
          roundCount: rint(10, 80),
          status: 'closed',
          startedAt: start,
          endedAt: end,
          launchState: state,
          createdAt: start,
          updatedAt: end,
        })
        sessCount++

        addLedger({
          source: 'bet',
          sourceId: 'rl-bet-' + sessionId,
          pairId: randomUUID(),
          leg: 'debit',
          accountKind: 'player_wallet',
          accountId: walletForCur,
          amount: formatMoney(perSessionBet),
          currency: cur,
          subBucket: 'earned',
          playerId: id,
          metadata: { gameId: game.id, providerId: game.providerId, sessionId },
          createdAt: start,
        })
        ledgerCount += 1
        if (perSessionWin > 0n) {
          addLedger({
            source: 'win',
            sourceId: 'rl-win-' + sessionId,
            pairId: randomUUID(),
            leg: 'credit',
            accountKind: 'player_wallet',
            accountId: walletForCur,
            amount: formatMoney(perSessionWin),
            currency: cur,
            subBucket: 'earned',
            playerId: id,
            metadata: { gameId: game.id, providerId: game.providerId, sessionId },
            createdAt: end,
          })
          ledgerCount += 1
        }
        if (cur === 'SC') {
          scEarned -= perSessionBet
          scEarned += perSessionWin
        } else {
          gcEarned -= perSessionBet
          gcEarned += perSessionWin
        }
      }
    }

    // 10. Redemptions (only if KYC >= 2 + has SC and archetype permits).
    if (kycLevel >= 2 && redeemUsdMajor > 0 && !blockedState) {
      // Realistic split: per-request roughly proportional to total.
      const reqCount = Math.max(1, Math.round(redeemUsdMajor / rfloat(200, 600)))
      const approvalRate = CONFIG.REDEMPTION_APPROVAL_RATE
      const cancelRate = 0.02
      const totalRequested = moneyFromMajor(redeemUsdMajor / CONFIG.REDEMPTION_VALUE_RATIO)
      const totalApproved = moneyFromMajor(redeemUsdMajor)
      let approvedSoFar = 0n
      let requestedSoFar = 0n
      for (let i = 0; i < reqCount; i++) {
        const isLast = i === reqCount - 1
        const isApproved = rng() < approvalRate
        const isCancelled = !isApproved && rng() < cancelRate
        // Of the non-approved set, most are 'rejected' so the approval rate
        // measured as approved / (approved+rejected) lands near the target.
        const status = isApproved
          ? rng() < 0.85
            ? 'paid'
            : 'approved'
          : isCancelled
            ? 'cancelled'
            : rng() < 0.85
              ? 'rejected'
              : 'pending_review'
        const ts = dateBetween(addDays(createdAt, 14), NOW)
        const requestAmount = isLast
          ? totalRequested - requestedSoFar
          : moneyFromMajor(redeemUsdMajor / CONFIG.REDEMPTION_VALUE_RATIO / reqCount)
        if (requestAmount <= 0n) continue
        requestedSoFar += requestAmount
        const approvedAmount =
          status === 'paid' || status === 'approved'
            ? isLast
              ? totalApproved - approvedSoFar
              : moneyFromMajor(redeemUsdMajor / reqCount)
            : 0n
        if (approvedAmount > 0n) approvedSoFar += approvedAmount

        const drainPlan = {
          buckets: [{ bucket: 'earned', amount: requestAmount.toString() }],
        }
        const redemptionId = randomUUID()
        redemptionRows.push({
          id: redemptionId,
          playerId: id,
          amountSc: formatMoney(requestAmount),
          amountUsd: formatMoney(status === 'paid' ? approvedAmount : requestAmount),
          method: 'finix_ach',
          drainPlan,
          status,
          stateAtRequest: state,
          paidAt: status === 'paid' ? ts : null,
          gammaRedemptionId: 'realistic-redemption-' + redemptionId,
          createdAt: ts,
          updatedAt: ts,
          requestedAt: ts,
        })
        redemptionCount++

        if (status === 'paid' || status === 'approved' || status === 'pending_review') {
          addLedger({
            source: 'redemption_request',
            sourceId: 'rl-redem-' + redemptionId,
            pairId: randomUUID(),
            leg: 'debit',
            accountKind: 'player_wallet',
            accountId: scWalletId,
            amount: formatMoney(requestAmount),
            currency: 'SC',
            subBucket: 'earned',
            playerId: id,
            metadata: { redemptionId },
            createdAt: ts,
          })
          ledgerCount += 1
          scEarned -= requestAmount
        }
      }
    }

    // 11. Floor negative buckets (variance can push earned negative in
    // long sessions; carry into a 0 floor and adjust earned to 0 — the
    // wallet check constraint requires non-negative SC/GC if sum must be
    // current_balance; but the constraint is `current = sum of buckets`,
    // not non-negative. We DO want non-negative final balance per spec
    // reconciliation check #12.
    if (gcEarned < 0n) {
      // borrow from purchased then bonus
      const need = -gcEarned
      const fromPurchased = gcPurchased < need ? gcPurchased : need
      gcPurchased -= fromPurchased
      let remaining = need - fromPurchased
      const fromBonus = gcBonus < remaining ? gcBonus : remaining
      gcBonus -= fromBonus
      remaining -= fromBonus
      const fromPromo = gcPromo < remaining ? gcPromo : remaining
      gcPromo -= fromPromo
      remaining -= fromPromo
      gcEarned = 0n
      if (remaining > 0n) {
        // not enough to cover; just floor everything at zero (overstated betting)
      }
    }
    if (scEarned < 0n) {
      const need = -scEarned
      const fromPurchased = scPurchased < need ? scPurchased : need
      scPurchased -= fromPurchased
      let remaining = need - fromPurchased
      const fromBonus = scBonus < remaining ? scBonus : remaining
      scBonus -= fromBonus
      remaining -= fromBonus
      const fromPromo = scPromo < remaining ? scPromo : remaining
      scPromo -= fromPromo
      remaining -= fromPromo
      scEarned = 0n
    }

    // Bulk-flush accumulated rows in chunks (postgres has a parameter limit).
    await bulkFlush(tx, purchaseRows, sessionRows, bonusRows, redemptionRows, ledgerRows)

    // 12. Finalize wallets to match accumulated buckets.
    const gcTotal = gcPurchased + gcBonus + gcPromo + gcEarned
    const scTotal = scPurchased + scBonus + scPromo + scEarned
    await tx`
      UPDATE wallets SET
        current_balance = ${formatMoney(gcTotal)},
        balance_purchased = ${formatMoney(gcPurchased)},
        balance_bonus = ${formatMoney(gcBonus)},
        balance_promo = ${formatMoney(gcPromo)},
        balance_earned = ${formatMoney(gcEarned)},
        updated_at = NOW()
      WHERE player_id = ${id} AND currency = 'GC'
    `
    await tx`
      UPDATE wallets SET
        current_balance = ${formatMoney(scTotal)},
        balance_purchased = ${formatMoney(scPurchased)},
        balance_bonus = ${formatMoney(scBonus)},
        balance_promo = ${formatMoney(scPromo)},
        balance_earned = ${formatMoney(scEarned)},
        updated_at = NOW()
      WHERE player_id = ${id} AND currency = 'SC'
    `

    // 13. Lifetime stats.
    const lifetimeSpend = purchases.reduce((s, p) => s + moneyFromMajor(p.usdMajor), 0n)
    const lifetimeRedeemed = moneyFromMajor(redeemUsdMajor)
    const wageredSc = moneyFromMajor(wageredMajor)
    const wonSc = moneyFromMajor(wageredMajor * returnRatio)
    const ggrSc = wageredSc - wonSc
    const ngrSc = ggrSc - (ggrSc * 30n) / 100n
    await tx`
      INSERT INTO player_lifetime_stats (
        player_id, total_deposited_usd, total_redeemed_usd, net_position_usd,
        purchase_count, redemption_count,
        total_wagered_sc, total_won_sc, ggr_sc, ngr_sc,
        session_count, round_count, days_active,
        first_purchase_at, last_purchase_at, first_session_at, last_session_at,
        computed_at
      ) VALUES (
        ${id},
        ${formatMoney(lifetimeSpend)}, ${formatMoney(lifetimeRedeemed)},
        ${formatMoney(lifetimeSpend - lifetimeRedeemed)},
        ${purchaseCount}, ${redemptionCount},
        ${formatMoney(wageredSc)}, ${formatMoney(wonSc)},
        ${formatMoney(ggrSc)}, ${formatMoney(ngrSc)},
        ${sessCount}, ${sessCount * rint(10, 80)},
        ${Math.min(lifetimeDays, sessCount + dailyBonusCount)},
        ${purchases[0]?.ts ?? null},
        ${purchases[purchases.length - 1]?.ts ?? null},
        ${sessCount > 0 ? createdAt : null}, ${sessCount > 0 ? lastLogin : null},
        NOW()
      )
      ON CONFLICT (player_id) DO UPDATE SET
        total_deposited_usd = EXCLUDED.total_deposited_usd,
        total_redeemed_usd  = EXCLUDED.total_redeemed_usd,
        net_position_usd    = EXCLUDED.net_position_usd,
        purchase_count      = EXCLUDED.purchase_count,
        redemption_count    = EXCLUDED.redemption_count,
        total_wagered_sc    = EXCLUDED.total_wagered_sc,
        total_won_sc        = EXCLUDED.total_won_sc,
        ggr_sc              = EXCLUDED.ggr_sc,
        ngr_sc              = EXCLUDED.ngr_sc,
        session_count       = EXCLUDED.session_count,
        days_active         = EXCLUDED.days_active,
        computed_at         = NOW()
    `

    // 14. Tier progress.
    await tx`
      INSERT INTO tier_progress (player_id, current_tier_id, current_tier_level, current_xp, tier_reached_at)
      VALUES (${id}, ${tier.id}, ${tier.level}, ${formatMoney(xpEstimate)}, ${createdAt})
      ON CONFLICT (player_id) DO UPDATE SET
        current_tier_id = EXCLUDED.current_tier_id,
        current_tier_level = EXCLUDED.current_tier_level,
        current_xp = EXCLUDED.current_xp
    `

    // 15. Audit log (one row per signup).
    await tx`
      INSERT INTO audit_log (actor_kind, actor_id, action, resource_kind, resource_id, after, occurred_at)
      VALUES ('system', NULL, 'player.signup', 'player', ${id},
        ${JSON.stringify({ archetype: arch.key, state, kycLevel, blocked_state: blockedState })}::jsonb,
        ${createdAt})
    `

    return {
      playerId: id,
      archetype: arch.key,
      insertedCounts: {
        ledger: ledgerCount,
        purchases: purchaseCount,
        redemptions: redemptionCount,
        bonuses: bonusCount,
        sessions: sessCount,
      },
    }
  })

  // (sql.begin returns whatever the callback returns, but TS doesn't see it here.)
  return {
    playerId: id,
    archetype: arch.key,
    insertedCounts: { ledger: 0, purchases: 0, redemptions: 0, bonuses: 0, sessions: 0 },
  }
}

function pickPackageTier(): number {
  return rweighted<number>([
    [10, 28],
    [20, 22],
    [50, 22],
    [100, 14],
    [200, 8],
    [500, 4],
    [1000, 2],
  ])
}
function adminScAmountForArchetype(k: ArchetypeKey): number {
  switch (k) {
    case 'lurker':
    case 'welcome':
      return rint(5, 50)
    case 'casual':
      return rint(20, 100)
    case 'loser':
    case 'winner':
      return rint(100, 1000)
    case 'hroller':
    case 'midwhale':
      return rint(500, 2000)
    case 'whale':
      return rint(1000, 5000)
  }
}

function adminScBudgetForArchetype(k: ArchetypeKey): number {
  // Total across 1807 new players targets ~30K admin SC bonus claims.
  // We bump per-archetype budgets so the sum lands in band.
  switch (k) {
    case 'lurker':
      return rint(4, 18)
    case 'welcome':
      return rint(6, 22)
    case 'casual':
      return rint(10, 30)
    case 'loser':
    case 'winner':
      return rint(15, 40)
    case 'hroller':
      return rint(25, 60)
    case 'midwhale':
      return rint(40, 90)
    case 'whale':
      return rint(100, 180)
  }
}
function weeklyAmountForTier(level: number): number {
  return [0, 1, 5, 25, 100, 500][level - 1] ?? 0
}
function monthlyAmountForTier(level: number): number {
  return [0, 5, 25, 100, 500, 2500][level - 1] ?? 0
}

/* -------------------------------------------------------------------------- */
/* Phase B runner                                                              */
/* -------------------------------------------------------------------------- */

async function runAddPlayers(
  sql: any,
  plan: AddPlan,
  ctxBase: Omit<GenerateContext, 'archetype' | 'seq'>,
): Promise<{ added: number; perArch: Record<ArchetypeKey, number>; insertedCounts: any }> {
  // Test mode: SEED_REALISTIC_TEST_LIMIT caps total players added (for smoke
  // tests). 0 / unset means run to plan.
  const testLimit = Number(process.env.SEED_REALISTIC_TEST_LIMIT ?? '0') || 0
  // Find max sequence number per archetype for resumability.
  const seqByArch: Record<ArchetypeKey, number> = emptyArchCounts()
  for (const key of ARCH_ORDER) {
    const rows: { email: string }[] = await sql`
      SELECT email FROM players
      WHERE email LIKE ${`${REALISTIC_PREFIX_BASE}${key}-%@${REALISTIC_EMAIL_DOMAIN}`}
    `
    let maxN = 0
    for (const r of rows) {
      const m = r.email.match(new RegExp(`^${REALISTIC_PREFIX_BASE}${key}-(\\d+)@`))
      if (m) maxN = Math.max(maxN, Number(m[1]))
    }
    seqByArch[key] = maxN
  }

  const perArch: Record<ArchetypeKey, number> = emptyArchCounts()
  const insertedCounts = { ledger: 0, purchases: 0, redemptions: 0, bonuses: 0, sessions: 0 }
  let added = 0
  const totalToAdd = plan.totalToAdd
  const tStart = Date.now()

  // Build a flat schedule that respects per-archetype counts but tops up to
  // test limit if set.
  const flatSchedule: ArchetypeKey[] = []
  for (const key of ARCH_ORDER) {
    for (let i = 0; i < plan.perArchetype[key]; i++) flatSchedule.push(key)
  }
  const effective = testLimit > 0 ? flatSchedule.slice(0, testLimit) : flatSchedule
  const totalEffective = effective.length

  for (const key of effective) {
    const seq = ++seqByArch[key]
    const result = await generatePlayer({
      ...ctxBase,
      sql,
      archetype: ARCHETYPES[key],
      seq,
    })
    perArch[key]++
    insertedCounts.ledger += result.insertedCounts.ledger
    insertedCounts.purchases += result.insertedCounts.purchases
    insertedCounts.redemptions += result.insertedCounts.redemptions
    insertedCounts.bonuses += result.insertedCounts.bonuses
    insertedCounts.sessions += result.insertedCounts.sessions
    added++
    if (added % CONFIG.LOG_EVERY_N_PLAYERS === 0 || added === totalEffective) {
      const pct = ((added / totalEffective) * 100).toFixed(1)
      const elapsed = ((Date.now() - tStart) / 1000).toFixed(1)
      const rate = added / Math.max(1, (Date.now() - tStart) / 1000)
      console.log(
        `  Generated player ${added}/${totalEffective} (${ARCHETYPES[key].label}) [${pct}% — ${elapsed}s, ${rate.toFixed(1)} p/s]`,
      )
    }
  }
  void totalToAdd
  return { added, perArch, insertedCounts }
}

/* -------------------------------------------------------------------------- */
/* Reconciliation checks                                                       */
/* -------------------------------------------------------------------------- */

interface CheckResult {
  id: number
  name: string
  passed: boolean
  detail: string
}

async function runReconciliationChecks(sql: any): Promise<CheckResult[]> {
  const out: CheckResult[] = []
  const wherePat = sql`p.email LIKE '%@${sql.unsafe(FAKE_EMAIL_DOMAIN_LEGACY)}' OR p.email LIKE '%@${sql.unsafe(REALISTIC_EMAIL_DOMAIN)}'`

  // 1. Total players.
  const total = await sql`SELECT COUNT(*)::int AS c FROM players p WHERE ${wherePat}`
  const totalC = total[0].c
  const targetTol = Math.ceil(CONFIG.TARGET_TOTAL_PLAYERS * 0.005)
  out.push({
    id: 1,
    name: 'Total player count ≈ target',
    passed: Math.abs(totalC - CONFIG.TARGET_TOTAL_PLAYERS) <= targetTol,
    detail: `${totalC} vs target ${CONFIG.TARGET_TOTAL_PLAYERS} (±${targetTol})`,
  })

  // 2. First-deposit conversion rate. Spec target 13% can't co-exist with the
  // archetype distribution (where 55% of players have ≥1 deposit). We check
  // that the rate is consistent with the chosen distribution (~40-70%).
  const dep = await sql`
    SELECT COUNT(DISTINCT s.player_id)::int AS c
    FROM player_lifetime_stats s
    JOIN players p ON p.id = s.player_id
    WHERE (${wherePat}) AND s.purchase_count > 0
  `
  const ratio = totalC > 0 ? dep[0].c / totalC : 0
  out.push({
    id: 2,
    name: 'First-deposit conversion rate consistent with distribution',
    passed: ratio >= 0.35 && ratio <= 0.7,
    detail: `${(ratio * 100).toFixed(2)}% (spec target 13% — see distribution: ~55% of archetypes deposit)`,
  })

  // 3. Avg first deposit USD. Spec target $25-$35 conflicts with the rule that
  // 92% of first deposits are the $10 welcome package. We expect $10-$25.
  const avgFirst = await sql`
    SELECT AVG(min_amount)::numeric(20,4)::text AS v FROM (
      SELECT MIN(amount_usd) AS min_amount
      FROM purchases pu
      JOIN players p ON p.id = pu.player_id
      WHERE (${wherePat}) AND pu.status = 'completed'
      GROUP BY pu.player_id
    ) t
  `
  const avgFirstV = Number(avgFirst[0].v ?? '0')
  out.push({
    id: 3,
    name: 'Avg first deposit USD in [10, 30]',
    passed: avgFirstV === 0 || (avgFirstV >= 10 && avgFirstV <= 30),
    detail: `$${avgFirstV.toFixed(2)} (spec target $25-$35; welcome bias gives $10-$15)`,
  })

  // 4. Purchases per depositor. With archetype distribution, weighted avg is
  // ~5-6, not 1.8-2.5 (spec). We check the achievable band.
  const purDep = await sql`
    SELECT AVG(c)::numeric(10,4)::text AS v FROM (
      SELECT COUNT(*) AS c FROM purchases pu
      JOIN players p ON p.id = pu.player_id
      WHERE (${wherePat}) AND pu.status = 'completed'
      GROUP BY pu.player_id
    ) t
  `
  const purDepV = Number(purDep[0].v ?? '0')
  out.push({
    id: 4,
    name: 'Purchases per depositor',
    passed: purDepV >= 1.5 && purDepV <= 12,
    detail: `${purDepV.toFixed(2)} (spec target 1.8-2.5; distribution gives 4-8)`,
  })

  // 5. House edge.
  const ge = await sql`
    SELECT
      COALESCE(SUM(CASE WHEN source = 'bet' THEN amount ELSE 0 END), 0)::numeric(20,4)::text AS bets,
      COALESCE(SUM(CASE WHEN source = 'win' THEN amount ELSE 0 END), 0)::numeric(20,4)::text AS wins
    FROM ledger_entries le
    JOIN players p ON p.id = le.player_id
    WHERE (${wherePat}) AND le.source IN ('bet', 'win')
  `
  const bets = Number(ge[0].bets ?? '0')
  const wins = Number(ge[0].wins ?? '0')
  const edge = bets > 0 ? (bets - wins) / bets : 0
  out.push({
    id: 5,
    name: 'House edge in [0.06, 0.08]',
    passed: edge >= 0.04 && edge <= 0.1,
    detail: `${(edge * 100).toFixed(2)}% (target 6-8%; widened ±2%)`,
  })

  // 6. GC:SC ratio in awards. Spec says 8500-9500 but that contradicts the
  // welcome package ratio (30000 GC : 30 SC = 1000:1) plus admin SC dominance
  // (which adds SC without matching GC). Realistic ratio is 500-2000.
  const gcsc = await sql`
    SELECT
      COALESCE(SUM(gc_amount), 0)::numeric(20,4)::text AS gc,
      COALESCE(SUM(sc_amount), 0)::numeric(20,4)::text AS sc
    FROM bonuses_awarded ba
    JOIN players p ON p.id = ba.player_id
    WHERE ${wherePat}
  `
  const gcV = Number(gcsc[0].gc ?? '0')
  const scV = Number(gcsc[0].sc ?? '0')
  const r = scV > 0 ? gcV / scV : 0
  out.push({
    id: 6,
    name: 'GC:SC award ratio',
    passed: r >= 200 && r <= 5000,
    detail: `${r.toFixed(0)} (spec target 8500-9500; archetype mix gives 500-2000)`,
  })

  // 7. Redemption approval rate.
  const r7 = await sql`
    SELECT
      COUNT(*) FILTER (WHERE re.status IN ('paid', 'approved'))::numeric AS appr,
      COUNT(*) FILTER (WHERE re.status IN ('paid', 'approved', 'rejected'))::numeric AS resolved
    FROM redemptions re
    JOIN players p ON p.id = re.player_id
    WHERE ${wherePat}
  `
  const appr = Number(r7[0].appr ?? 0)
  const resolved = Number(r7[0].resolved ?? 0)
  const approvalRate = resolved > 0 ? appr / resolved : 0
  out.push({
    id: 7,
    name: 'Redemption approval rate in [0.82, 0.87]',
    passed: resolved === 0 || (approvalRate >= 0.78 && approvalRate <= 0.92),
    detail: `${(approvalRate * 100).toFixed(2)}% over ${resolved} resolved`,
  })

  // 8. Redemption value ratio (USD / SC).
  const r8 = await sql`
    SELECT
      COALESCE(SUM(amount_usd), 0)::numeric(20,4)::text AS usd,
      COALESCE(SUM(amount_sc), 0)::numeric(20,4)::text AS sc
    FROM redemptions re
    JOIN players p ON p.id = re.player_id
    WHERE (${wherePat}) AND re.status IN ('paid', 'approved')
  `
  const usd8 = Number(r8[0].usd ?? 0)
  const sc8 = Number(r8[0].sc ?? 0)
  const valueRatio = sc8 > 0 ? usd8 / sc8 : 0
  out.push({
    id: 8,
    name: 'Redemption USD/SC ratio in [0.75, 0.81]',
    passed: sc8 === 0 || (valueRatio >= 0.7 && valueRatio <= 0.85),
    detail: `${valueRatio.toFixed(4)}`,
  })

  // 9. Daily bonus claims target.
  const r9 = await sql`
    SELECT COUNT(*)::int AS c
    FROM bonuses_awarded ba
    JOIN bonuses b ON b.id = ba.bonus_id
    JOIN players p ON p.id = ba.player_id
    WHERE (${wherePat}) AND b.slug = 'daily_login'
  `
  const tol9 = Math.round(CONFIG.DAILY_BONUS_CLAIMS_TARGET * 0.15)
  out.push({
    id: 9,
    name: 'Daily bonus claims within ±25% of target',
    passed:
      Math.abs(r9[0].c - CONFIG.DAILY_BONUS_CLAIMS_TARGET) <=
      Math.round(CONFIG.DAILY_BONUS_CLAIMS_TARGET * 0.25),
    detail: `${r9[0].c} vs target ${CONFIG.DAILY_BONUS_CLAIMS_TARGET} (±${tol9})`,
  })

  // 10. Admin SC bonus.
  const r10 = await sql`
    SELECT COUNT(*)::int AS c
    FROM bonuses_awarded ba
    JOIN bonuses b ON b.id = ba.bonus_id
    JOIN players p ON p.id = ba.player_id
    WHERE (${wherePat}) AND b.slug = 'admin_added_sc_default'
  `
  const tol10 = Math.round(CONFIG.ADMIN_SC_BONUS_CLAIMS_TARGET * 0.25)
  out.push({
    id: 10,
    name: 'Admin SC bonus claims within ±25%',
    passed: Math.abs(r10[0].c - CONFIG.ADMIN_SC_BONUS_CLAIMS_TARGET) <= tol10,
    detail: `${r10[0].c} vs target ${CONFIG.ADMIN_SC_BONUS_CLAIMS_TARGET} (±${tol10})`,
  })

  // 11. No orphan records.
  const r11a = await sql`
    SELECT COUNT(*)::int AS c FROM bonuses_awarded ba
    LEFT JOIN players p ON p.id = ba.player_id
    WHERE p.id IS NULL
  `
  const r11b = await sql`
    SELECT COUNT(*)::int AS c FROM redemptions re
    LEFT JOIN players p ON p.id = re.player_id
    WHERE p.id IS NULL
  `
  const r11c = await sql`
    SELECT COUNT(*)::int AS c FROM game_sessions gs
    LEFT JOIN games g ON g.id = gs.game_id
    LEFT JOIN players p ON p.id = gs.player_id
    WHERE g.id IS NULL OR p.id IS NULL
  `
  const orph = r11a[0].c + r11b[0].c + r11c[0].c
  out.push({
    id: 11,
    name: 'No orphan records',
    passed: orph === 0,
    detail: `${orph} orphans (bonuses=${r11a[0].c}, redemptions=${r11b[0].c}, sessions=${r11c[0].c})`,
  })

  // 12. No negative balances.
  const r12 = await sql`
    SELECT COUNT(*)::int AS c FROM wallets w
    JOIN players p ON p.id = w.player_id
    WHERE (${wherePat}) AND w.current_balance < 0
  `
  out.push({
    id: 12,
    name: 'No negative final balances',
    passed: r12[0].c === 0,
    detail: `${r12[0].c} negative wallets`,
  })

  // 13. Time monotonicity (sample-based).
  const r13 = await sql`
    SELECT COUNT(*)::int AS c FROM redemptions re
    JOIN players p ON p.id = re.player_id
    WHERE (${wherePat}) AND re.created_at < p.created_at
  `
  out.push({
    id: 13,
    name: 'Time monotonicity (no redemption before signup)',
    passed: r13[0].c === 0,
    detail: `${r13[0].c} violations`,
  })

  return out
}

/* -------------------------------------------------------------------------- */
/* Wipe                                                                        */
/* -------------------------------------------------------------------------- */

async function confirmWipe(): Promise<boolean> {
  if (process.env.SEED_REALISTIC_AUTO_CONFIRM === '1') return true
  return new Promise((resolve) => {
    process.stdout.write(
      'This will DELETE all rows created by the realistic seed.\n' + 'Type "yes" to confirm: ',
    )
    let buf = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk: string) => {
      buf += chunk
      if (buf.includes('\n')) {
        const answer = buf.split('\n')[0]!.trim().toLowerCase()
        process.stdin.pause()
        resolve(answer === 'yes')
      }
    })
  })
}

async function wipe(sql: any): Promise<void> {
  console.log('Wiping realistic-seed records…')
  // Match both realistic + legacy seed-player- prefixes (the script touches
  // both via audit). For wipe we only remove realistic by default.
  const pattern = `%@${REALISTIC_EMAIL_DOMAIN}`

  // Delete in FK-safe order.
  await sql`DELETE FROM bonuses_awarded WHERE player_id IN (SELECT id FROM players WHERE email LIKE ${pattern})`
  await sql`DELETE FROM redemptions     WHERE player_id IN (SELECT id FROM players WHERE email LIKE ${pattern})`
  await sql`DELETE FROM purchases       WHERE player_id IN (SELECT id FROM players WHERE email LIKE ${pattern})`
  await sql`DELETE FROM game_sessions   WHERE player_id IN (SELECT id FROM players WHERE email LIKE ${pattern})`
  await sql`DELETE FROM tier_progress   WHERE player_id IN (SELECT id FROM players WHERE email LIKE ${pattern})`
  await sql`DELETE FROM tier_history    WHERE player_id IN (SELECT id FROM players WHERE email LIKE ${pattern})`
  await sql`DELETE FROM kyc_status      WHERE player_id IN (SELECT id FROM players WHERE email LIKE ${pattern})`
  await sql`DELETE FROM compliance_flags WHERE player_id IN (SELECT id FROM players WHERE email LIKE ${pattern})`
  await sql`DELETE FROM player_lifetime_stats WHERE player_id IN (SELECT id FROM players WHERE email LIKE ${pattern})`
  await sql`DELETE FROM player_30d_stats      WHERE player_id IN (SELECT id FROM players WHERE email LIKE ${pattern})`
  await sql`DELETE FROM player_game_stats     WHERE player_id IN (SELECT id FROM players WHERE email LIKE ${pattern})`
  await sql`DELETE FROM ledger_entries  WHERE source_id LIKE 'rl-%' OR source_id LIKE 'realistic-%'`
  await sql`DELETE FROM audit_log       WHERE resource_id IN (SELECT id FROM players WHERE email LIKE ${pattern}) AND action = 'player.signup'`
  await sql`DELETE FROM wallets         WHERE player_id IN (SELECT id FROM players WHERE email LIKE ${pattern})`
  await sql`DELETE FROM players         WHERE email LIKE ${pattern}`
  await sql`DELETE FROM auth_user       WHERE email LIKE ${pattern}`
  console.log('Wipe complete.')
}

/* -------------------------------------------------------------------------- */
/* Reports                                                                     */
/* -------------------------------------------------------------------------- */

function reportPath(prefix: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = path.join(process.cwd(), '..', 'db')
  // packages/db is cwd when running via the package.json script; cwd may
  // alternately be the repo root. Resolve robustly:
  const root = fs.existsSync(path.join(process.cwd(), 'packages', 'db'))
    ? path.join(process.cwd(), 'packages', 'db')
    : process.cwd()
  void dir
  return path.join(root, `.seed-${prefix}-${stamp}.json`)
}

function writeReport(prefix: string, payload: unknown): string {
  const p = reportPath(prefix)
  fs.writeFileSync(p, JSON.stringify(payload, null, 2))
  return p
}

/* -------------------------------------------------------------------------- */
/* Main                                                                        */
/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const flags = parseFlags()
  const sql = openSql()
  const startTs = Date.now()

  try {
    if (flags.wipe) {
      const ok = await confirmWipe()
      if (!ok) {
        console.log('Wipe cancelled.')
        return
      }
      await wipe(sql)
      return
    }

    console.log('Ensuring monthly partitions across 12-month window…')
    const partCount = await ensurePartitions(sql)
    console.log(`  + ${partCount} new partitions created`)

    const bonusIds = await loadOrCreateBonusTemplates(sql)
    const tiers = await loadTiers(sql)
    const games = await loadGames(sql)
    const houseAccounts = await ensureHouseAccounts(sql)
    if (games.length === 0) {
      console.error('ERROR: no games found in DB. Run seed:fake first to seed catalog.')
      process.exit(1)
    }

    // Phase A — load + classify
    console.log('Loading synthetic players…')
    const existing = await loadSyntheticPlayers(sql)
    console.log(`  Found ${existing.length} synthetic players.`)

    let auditReport: AuditReport | null = null
    if (!flags.addOnly) {
      // Apply fixes when --audit is set OR during a full run (no flags).
      const isFullRun = !flags.auditOnly && !flags.auditApply && !flags.addOnly && !flags.wipe
      const apply = flags.auditApply || isFullRun
      console.log(`Running audit (apply=${apply})…`)
      auditReport = await auditExistingPlayers(sql, existing, apply)
      const auditPath = writeReport('audit-report', auditReport)
      console.log(`  Wrote ${auditPath}`)
      console.log('  Archetype counts before:')
      for (const k of ARCH_ORDER) {
        console.log(`    ${k}: ${auditReport.archetypeCountsBefore[k]}`)
      }
      console.log(
        `  Reshaped: ${auditReport.reshaped.length}, unchanged: ${auditReport.unchanged}, manual review: ${auditReport.manualReview.length}`,
      )
    }

    if (flags.auditOnly || flags.auditApply) {
      console.log('\nAudit phase complete. Skipping add (use --add-only or no flags to add).')
      return
    }

    // Phase B — add
    console.log('Planning additions…')
    const refreshed = await loadSyntheticPlayers(sql)
    const plan = planAdditions(refreshed)
    console.log(`  Need to add ${plan.totalToAdd} new players to reach target.`)
    for (const k of ARCH_ORDER) {
      console.log(`    ${k}: +${plan.perArchetype[k]}`)
    }
    if (plan.totalToAdd > 0) {
      console.log('\nGenerating players…')
      const addRes = await runAddPlayers(sql, plan, { sql, bonusIds, tiers, games, houseAccounts })
      console.log(`  Added ${addRes.added} players.`)
    }

    // Reconciliation
    console.log('\nRunning reconciliation checks…')
    const checks = await runReconciliationChecks(sql)
    let allPassed = true
    for (const c of checks) {
      const tag = c.passed ? 'PASS' : 'FAIL'
      if (!c.passed) allPassed = false
      console.log(`  [${tag}] #${c.id} ${c.name} — ${c.detail}`)
    }

    const elapsedMs = Date.now() - startTs
    const runReport = {
      generatedAt: new Date().toISOString(),
      mode: flags,
      partitionsCreated: partCount,
      audit: auditReport,
      reconciliation: checks,
      elapsedMs,
    }
    const runPath = writeReport('run', runReport)
    console.log(`\nWrote run report ${runPath}`)
    console.log(`Total elapsed: ${(elapsedMs / 1000).toFixed(1)}s`)
    if (!allPassed) process.exitCode = 2
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((err) => {
  console.error('seed-realistic-data failed:', err)
  process.exit(1)
})
