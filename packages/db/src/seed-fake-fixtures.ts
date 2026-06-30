/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Seed the supporting catalog + activity fixtures used by every M2 admin page.
 *
 * Idempotent: every insert uses ON CONFLICT DO NOTHING. Re-running is safe.
 *
 * Pass a `Sql` (postgres-js) client and the existing fake-player rows.
 *
 * Coverage:
 *   - 1 aggregator (alea is migration-seeded; we extend with a 2nd one)
 *   - 6 game providers + 50 games + sub-categories
 *   - 3 jackpot pools (modeled via `bonuses` rows of type 'jackpot')
 *   - 15 extra bonus templates
 *   - 50 promo codes (10 expired, 30 active, 10 scheduled) + 5 mappings
 *   - 5 blocked promo codes
 *   - 15 blocked email domains
 *   - Game activity: ledger bet/win pairs spread across the partition window
 *   - 5 hero/promo/popup banners + lobby banners (banners table + site_content)
 *   - 100 fake email messages (crm_message_log)
 *   - 50 in-app notifications
 *   - 30 admin adjustments
 */

import { randomUUID } from 'node:crypto'

import bcrypt from 'bcryptjs'

const SCALE = 10_000n
const FAKE_PROVIDER_PREFIX = 'seed-'
const FAKE_GAME_PREFIX = 'seed-'
const FAKE_BONUS_PREFIX = 'seed-bonus-'
const FAKE_PROMO_PREFIX = 'SEED'
const FAKE_BANNER_PREFIX = 'seed-banner-'
const FAKE_SITE_CONTENT_PREFIX = 'seed-cms-'
const FAKE_NOTIFICATION_TAG = 'seed-notification'
const FAKE_LEDGER_SOURCE_PREFIX = 'seed-game-'
const FAKE_MESSAGE_TAG = 'seed-msg-'
const FAKE_ADJUSTMENT_REASON_TAG = '[seed]'

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

const PROVIDERS: { slug: string; displayName: string }[] = [
  { slug: 'hacksaw-gaming', displayName: 'Hacksaw Gaming' },
  { slug: 'nolimit-city', displayName: 'NoLimit City' },
  { slug: 'pragmatic-play', displayName: 'Pragmatic Play' },
  { slug: 'evolution', displayName: 'Evolution Gaming' },
  { slug: 'red-tiger', displayName: 'Red Tiger' },
  { slug: 'booming-games', displayName: 'Booming Games' },
]

const SUB_CATEGORIES: { slug: string; displayName: string; type: string }[] = [
  { slug: 'slots', displayName: 'Slots', type: 'slots' },
  { slug: 'table-games', displayName: 'Table Games', type: 'table' },
  { slug: 'live-dealer', displayName: 'Live Dealer', type: 'live' },
  { slug: 'crash', displayName: 'Crash', type: 'instant' },
  { slug: 'instant-win', displayName: 'Instant Win', type: 'instant' },
]

const GAME_NAME_FIRSTS = [
  'Cosmic',
  'Royal',
  'Ancient',
  'Lucky',
  'Wild',
  'Diamond',
  'Golden',
  'Mystic',
  'Phoenix',
  'Dragon',
  'Crystal',
  'Sapphire',
  'Hyper',
  'Mega',
  'Imperial',
  'Sacred',
  'Bonanza',
  'Atomic',
  'Voodoo',
  'Twilight',
]

const GAME_NAME_LASTS = [
  'Riches',
  'Fortune',
  'Reels',
  'Quest',
  'Treasure',
  'Spins',
  'Empire',
  'Heist',
  'Strike',
  'Run',
  'Vault',
  'Bonanza',
  'Crash',
  'Royale',
  'Drop',
  'Burst',
  'Stars',
  'Gems',
  'Storm',
  'Wilds',
]

const VOLATILITIES = ['low', 'medium', 'high', 'very_high']

export async function seedAllFixtures(sql: any, players: SeededPlayer[]): Promise<void> {
  console.log('\nSeeding catalog + activity fixtures…')

  const providerIds = await seedProviders(sql)
  console.log(`  + ${Object.keys(providerIds).length} game providers`)

  const subCatCount = await seedSubCategories(sql)
  console.log(`  + ${subCatCount} sub-categories (via site_content)`)

  const gameIds = await seedGames(sql, providerIds)
  console.log(`  + ${gameIds.length} games`)

  const jackpotCount = await seedJackpots(sql)
  console.log(`  + ${jackpotCount} jackpot pools`)

  const bonusCount = await seedExtraBonusTemplates(sql)
  console.log(`  + ${bonusCount} extra bonus templates (total now 15+)`)

  const promoCount = await seedPromoCodes(sql)
  console.log(`  + ${promoCount} promo codes`)

  const blockedPromoCount = await seedBlockedPromoCodes(sql)
  console.log(`  + ${blockedPromoCount} blocked promo codes`)

  const blockedDomainCount = await seedBlockedDomains(sql)
  console.log(`  + ${blockedDomainCount} blocked email domains`)

  await assignTierProgress(sql, players)
  console.log(`  + tier_progress assigned for ${players.length} players`)

  const eventCount = await seedGameActivity(sql, players, gameIds)
  console.log(`  + ${eventCount} ledger bet/win entries (game activity)`)

  const bannerCount = await seedBanners(sql)
  console.log(`  + ${bannerCount} banners`)

  const cmsCount = await seedSiteContent(sql)
  console.log(`  + ${cmsCount} CMS items (hero/promo/popups)`)

  const segmentCount = await seedCrmSegments(sql)
  console.log(`  + ${segmentCount} saved CRM segments`)

  const campaignCount = await seedHistoricalCampaigns(sql, players)
  console.log(`  + ${campaignCount} historical CRM campaigns`)

  const messageCount = await seedMessageLog(sql, players)
  console.log(`  + ${messageCount} email/SMS messages (crm_message_log)`)

  const flowEnrollCount = await seedFlowEnrollments(sql, players)
  console.log(`  + ${flowEnrollCount} flow enrollments`)

  const notifCount = await seedInAppNotifications(sql, players)
  console.log(`  + ${notifCount} in-app notifications`)

  const adjustmentCount = await seedAdminAdjustments(sql, players)
  console.log(`  + ${adjustmentCount} admin adjustments`)

  const vipHostSummary = await seedVipHosts(sql, players)
  console.log(
    `  + ${vipHostSummary.hosts} hosts, ${vipHostSummary.assignedVips} VIPs assigned (${vipHostSummary.unassigned} left for master to assign), ${vipHostSummary.interactions} interactions`,
  )
}

/* -------------------------------------------------------------------------- */
/* Casino catalog                                                              */
/* -------------------------------------------------------------------------- */

async function seedProviders(sql: any): Promise<Record<string, string>> {
  // Find the alea aggregator (seeded by migration 0002).
  const aggRows: { id: string }[] =
    await sql`SELECT id FROM aggregators WHERE slug = 'alea' LIMIT 1`
  if (aggRows.length === 0) {
    throw new Error("aggregator 'alea' not found — migrations not applied?")
  }
  const aggId = aggRows[0]!.id

  const out: Record<string, string> = {}
  for (const p of PROVIDERS) {
    const slug = `${FAKE_PROVIDER_PREFIX}${p.slug}`
    const existing: { id: string }[] = await sql`
      SELECT id FROM game_providers WHERE slug = ${slug} LIMIT 1
    `
    if (existing.length > 0) {
      out[slug] = existing[0]!.id
      continue
    }
    const inserted: { id: string }[] = await sql`
      INSERT INTO game_providers (aggregator_id, slug, display_name, status)
      VALUES (${aggId}, ${slug}, ${p.displayName}, 'active')
      ON CONFLICT (aggregator_id, slug) DO UPDATE SET display_name = EXCLUDED.display_name
      RETURNING id
    `
    out[slug] = inserted[0]!.id
  }
  return out
}

async function seedSubCategories(sql: any): Promise<number> {
  // Sub-categories aren't a dedicated table — we store them as site_content
  // rows so the admin page has CRUD-able items even before a real schema lands.
  let inserted = 0
  for (const c of SUB_CATEGORIES) {
    const key = `${FAKE_SITE_CONTENT_PREFIX}subcat-${c.slug}`
    const result = await sql`
      INSERT INTO site_content (key, value_json, version, audience)
      VALUES (
        ${key},
        ${JSON.stringify({
          kind: 'sub_category',
          slug: c.slug,
          displayName: c.displayName,
          type: c.type,
          status: 'active',
          ordering: SUB_CATEGORIES.indexOf(c) + 1,
        })}::jsonb,
        1,
        'admin'
      )
      ON CONFLICT (key) DO NOTHING
      RETURNING id
    `
    if (result.length > 0) inserted++
  }
  return inserted
}

async function seedGames(
  sql: any,
  providerIds: Record<string, string>,
): Promise<{ id: string; providerId: string }[]> {
  const providerSlugs = Object.keys(providerIds)
  const out: { id: string; providerId: string }[] = []
  const targetCount = 50

  // Skip if we already have plenty of seed games.
  const existing: { count: string }[] = await sql`
    SELECT COUNT(*)::text AS count FROM games WHERE slug LIKE ${FAKE_GAME_PREFIX + '%'}
  `
  const existingCount = Number(existing[0]?.count ?? 0)

  if (existingCount >= targetCount) {
    const rows: { id: string; provider_id: string }[] = await sql`
      SELECT id, provider_id FROM games WHERE slug LIKE ${FAKE_GAME_PREFIX + '%'} LIMIT ${targetCount}
    `
    return rows.map((r) => ({ id: r.id, providerId: r.provider_id }))
  }

  for (let i = existingCount; i < targetCount; i++) {
    const providerSlug = providerSlugs[i % providerSlugs.length]!
    const providerId = providerIds[providerSlug]!
    const first = pickRandom(GAME_NAME_FIRSTS)
    const last = pickRandom(GAME_NAME_LASTS)
    const name = `${first} ${last}`
    const slug = `${FAKE_GAME_PREFIX}${first.toLowerCase()}-${last.toLowerCase()}-${i}`
    const externalId = `ext-${slug}`
    const category = pickRandom(SUB_CATEGORIES.map((c) => c.type))
    const subCategory = pickRandom(SUB_CATEGORIES.map((c) => c.slug))
    // rtp column is numeric(5,4) — store as fraction (0.94–0.97), not percent.
    const rtp = (0.94 + Math.random() * 0.03).toFixed(4)
    const volatility = pickRandom(VOLATILITIES)
    const minBet = (10n * SCALE) / 100n // 0.10 SC
    const maxBet = BigInt(pickRandom([50, 100, 250, 500])) * SCALE
    const lobbyOrder = i
    const isFeatured = Math.random() < 0.2
    const isNew = Math.random() < 0.15

    const inserted: { id: string }[] = await sql`
      INSERT INTO games (
        provider_id, slug, external_id, display_name,
        category, sub_category, rtp, volatility, min_bet_sc, max_bet_sc,
        lobby_order, is_featured, is_new, status, customer_facing,
        available_in_gc, available_in_sc
      ) VALUES (
        ${providerId}, ${slug}, ${externalId}, ${name},
        ${category}, ${subCategory},
        ${rtp}::numeric, ${volatility},
        ${formatMoney(minBet)}, ${formatMoney(maxBet)},
        ${lobbyOrder}, ${isFeatured}, ${isNew}, 'active', true, true, true
      )
      ON CONFLICT (slug) DO UPDATE SET display_name = EXCLUDED.display_name
      RETURNING id
    `
    out.push({ id: inserted[0]!.id, providerId })
  }
  // Re-read all to include any pre-existing.
  const all: { id: string; provider_id: string }[] = await sql`
    SELECT id, provider_id FROM games WHERE slug LIKE ${FAKE_GAME_PREFIX + '%'}
  `
  return all.map((r) => ({ id: r.id, providerId: r.provider_id }))
}

async function seedJackpots(sql: any): Promise<number> {
  // Jackpots are modeled as bonuses of type='jackpot' with a metadata jsonb
  // payload describing pool + history. We seed three.
  const slugs = ['seed-jackpot-mega', 'seed-jackpot-grand', 'seed-jackpot-daily']
  const names = ['Mega Cosmic Jackpot', 'Grand Royal Jackpot', 'Daily Lightning Jackpot']
  const pools = [25_000_000n * SCALE, 5_000_000n * SCALE, 250_000n * SCALE]
  let inserted = 0

  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i]!
    const name = names[i]!
    const pool = pools[i]!

    const existing: { id: string }[] = await sql`SELECT id FROM bonuses WHERE slug = ${slug}`
    if (existing.length > 0) continue

    await sql`
      INSERT INTO bonuses (
        slug, display_name, bonus_type,
        award_gc, award_sc,
        playthrough_multiplier,
        status, description
      ) VALUES (
        ${slug}, ${name}, 'jackpot',
        ${formatMoney(0n)}, ${formatMoney(pool)},
        '5.0', 'active',
        ${'Live progressive jackpot pool. Current pool seeded at $' + Number(pool / SCALE).toLocaleString()}
      )
      ON CONFLICT (slug) DO NOTHING
    `
    inserted++
  }
  return inserted
}

/* -------------------------------------------------------------------------- */
/* Bonus templates (extra)                                                     */
/* -------------------------------------------------------------------------- */

async function seedExtraBonusTemplates(sql: any): Promise<number> {
  const templates: Array<{
    slug: string
    name: string
    type: string
    awardGc: bigint
    awardSc: bigint
    multiplier: string
    windowH: number | null
    desc: string
  }> = [
    {
      slug: 'seed-promo-vip',
      name: 'VIP Reload Bonus',
      type: 'promotion',
      awardGc: 200_000n * SCALE,
      awardSc: 50n * SCALE,
      multiplier: '4.0',
      windowH: 168,
      desc: 'Weekly reload for VIP players.',
    },
    {
      slug: 'seed-promo-weekend',
      name: 'Weekend Warrior',
      type: 'promotion',
      awardGc: 100_000n * SCALE,
      awardSc: 25n * SCALE,
      multiplier: '3.0',
      windowH: 72,
      desc: 'Boost for active weekend players.',
    },
    {
      slug: 'seed-promo-cashback',
      name: 'Cashback Booster',
      type: 'promotion',
      awardGc: 0n,
      awardSc: 15n * SCALE,
      multiplier: '1.0',
      windowH: 168,
      desc: 'Weekly net-loss cashback.',
    },
    {
      slug: 'seed-promo-comeback',
      name: 'We Miss You',
      type: 'promotion',
      awardGc: 50_000n * SCALE,
      awardSc: 10n * SCALE,
      multiplier: '2.0',
      windowH: 336,
      desc: 'Reactivation bonus after 14 days inactive.',
    },
    {
      slug: 'seed-purchase-firstbuy',
      name: 'First Purchase Boost',
      type: 'package',
      awardGc: 250_000n * SCALE,
      awardSc: 100n * SCALE,
      multiplier: '3.0',
      windowH: 168,
      desc: 'Extra coins on your very first purchase.',
    },
    {
      slug: 'seed-purchase-doubler',
      name: 'Double GC Top-Up',
      type: 'package',
      awardGc: 500_000n * SCALE,
      awardSc: 0n,
      multiplier: '1.0',
      windowH: 24,
      desc: 'Doubles GC on any package $20+.',
    },
    {
      slug: 'seed-affiliate-default',
      name: 'Affiliate Welcome',
      type: 'affiliate',
      awardGc: 100_000n * SCALE,
      awardSc: 25n * SCALE,
      multiplier: '5.0',
      windowH: 720,
      desc: 'Awarded to players who arrive via affiliate links.',
    },
    {
      slug: 'seed-crm-survey',
      name: 'Survey Reward',
      type: 'crm_promocode',
      awardGc: 25_000n * SCALE,
      awardSc: 5n * SCALE,
      multiplier: '1.0',
      windowH: 168,
      desc: 'Earned by completing a player survey.',
    },
    {
      slug: 'seed-crm-birthday',
      name: 'Birthday Gift',
      type: 'crm_promocode',
      awardGc: 100_000n * SCALE,
      awardSc: 50n * SCALE,
      multiplier: '2.0',
      windowH: 168,
      desc: 'Birthday bonus from CoinFrenzy.',
    },
    {
      slug: 'seed-crm-anniversary',
      name: 'Anniversary Treat',
      type: 'crm_promocode',
      awardGc: 250_000n * SCALE,
      awardSc: 100n * SCALE,
      multiplier: '3.0',
      windowH: 168,
      desc: 'Marking the anniversary of your signup.',
    },
    {
      slug: 'seed-tier-bronze',
      name: 'Bronze Tier Reward',
      type: 'tier_up',
      awardGc: 50_000n * SCALE,
      awardSc: 5n * SCALE,
      multiplier: '2.0',
      windowH: 168,
      desc: 'Awarded when reaching Bronze tier.',
    },
    {
      slug: 'seed-tier-platinum',
      name: 'Platinum Tier Reward',
      type: 'tier_up',
      awardGc: 1_000_000n * SCALE,
      awardSc: 500n * SCALE,
      multiplier: '3.0',
      windowH: 336,
      desc: 'Awarded when reaching Platinum tier.',
    },
    {
      slug: 'seed-promo-tournament',
      name: 'Tournament Buy-In',
      type: 'promotion',
      awardGc: 0n,
      awardSc: 25n * SCALE,
      multiplier: '5.0',
      windowH: 48,
      desc: 'Free buy-in for slot tournaments.',
    },
    {
      slug: 'seed-purchase-megapack',
      name: 'Mega Pack Bonus',
      type: 'purchase_promocode',
      awardGc: 1_000_000n * SCALE,
      awardSc: 250n * SCALE,
      multiplier: '4.0',
      windowH: 168,
      desc: 'Extra value on $200+ packages.',
    },
    {
      slug: 'seed-amoe-mailin',
      name: 'AMOE Mail-In Reward',
      type: 'amoe',
      awardGc: 0n,
      awardSc: 10n * SCALE,
      multiplier: '1.0',
      windowH: 720,
      desc: 'Free SC awarded for valid mail-in entry.',
    },
  ]

  let inserted = 0
  for (const t of templates) {
    const result = await sql`
      INSERT INTO bonuses (
        slug, display_name, bonus_type,
        award_gc, award_sc,
        playthrough_multiplier, playthrough_window_hours,
        status, description
      ) VALUES (
        ${t.slug}, ${t.name}, ${t.type}::bonus_type,
        ${formatMoney(t.awardGc)}, ${formatMoney(t.awardSc)},
        ${t.multiplier}, ${t.windowH},
        'active', ${t.desc}
      )
      ON CONFLICT (slug) DO NOTHING
      RETURNING id
    `
    if (result.length > 0) inserted++
  }
  return inserted
}

/* -------------------------------------------------------------------------- */
/* Promo codes                                                                 */
/* -------------------------------------------------------------------------- */

const PROMO_PREFIXES = [
  'WELCOME',
  'LUCKY',
  'BIGWIN',
  'BOOST',
  'VIP',
  'CASH',
  'FREE',
  'SPIN',
  'JACKPOT',
  'SUMMER',
]

async function seedPromoCodes(sql: any): Promise<number> {
  // Pick a fallback bonus to attach codes to (welcome_default exists from migration).
  const bonusRow: { id: string }[] = await sql`
    SELECT id FROM bonuses WHERE slug = 'welcome_default' LIMIT 1
  `
  if (bonusRow.length === 0) {
    console.warn('skipping promo seed — welcome_default bonus not found')
    return 0
  }
  const fallbackBonusId = bonusRow[0]!.id

  // Pull all our seed bonus templates so codes can map across them.
  const seedBonuses: { id: string; slug: string }[] = await sql`
    SELECT id, slug FROM bonuses WHERE slug LIKE 'seed-%'
  `
  const allBonusIds = [fallbackBonusId, ...seedBonuses.map((b) => b.id)]

  const targetCount = 50
  const existing: { count: string }[] = await sql`
    SELECT COUNT(*)::text AS count FROM promo_codes WHERE code LIKE ${FAKE_PROMO_PREFIX + '%'}
  `
  const have = Number(existing[0]?.count ?? 0)
  if (have >= targetCount) return have

  let inserted = 0
  for (let i = have; i < targetCount; i++) {
    const prefix = PROMO_PREFIXES[i % PROMO_PREFIXES.length]!
    const code = `${FAKE_PROMO_PREFIX}-${prefix}${String(i + 1).padStart(3, '0')}`
    const bonusId = allBonusIds[i % allBonusIds.length]!

    // Status mix: 10 expired, 30 active, 10 scheduled.
    let status = 'active'
    let validFrom: Date | null = null
    let validUntil: Date | null = null
    const now = new Date()
    if (i < 10) {
      status = 'archived'
      validFrom = daysFromNow(-60)
      validUntil = daysFromNow(-7)
    } else if (i >= 40) {
      status = 'active'
      validFrom = daysFromNow(7 + (i - 40))
      validUntil = daysFromNow(60 + (i - 40))
    } else {
      status = 'active'
      validFrom = daysFromNow(-15)
      validUntil = daysFromNow(30)
    }

    const requiredContext = pickRandom(['signup', 'purchase', 'standalone'])
    const maxTotalUses = pickRandom([null, 100, 500, 1000, 5000])
    const maxPerPlayer = pickRandom([1, 1, 1, 3, 5])
    const usesCount = status === 'archived' ? randomInt(50, 5000) : randomInt(0, 200)

    await sql`
      INSERT INTO promo_codes (
        code, description, bonus_id,
        playthrough_multiplier, playthrough_window_hours,
        required_context, max_per_player, max_total_uses, uses_count,
        status, valid_from, valid_until
      ) VALUES (
        ${code},
        ${'Seeded promo code — ' + prefix},
        ${bonusId},
        ${pickRandom(['1.0', '2.0', '3.0', '5.0'])}::numeric,
        ${pickRandom([24, 72, 168, 336])},
        ${requiredContext},
        ${maxPerPlayer},
        ${maxTotalUses},
        ${usesCount},
        ${status},
        ${validFrom},
        ${validUntil}
      )
      ON CONFLICT (code) DO NOTHING
    `
    void now
    inserted++
  }
  return inserted
}

async function seedBlockedPromoCodes(sql: any): Promise<number> {
  const codes = [
    { code: 'STAFF', reason: 'Internal staff use only' },
    { code: 'TESTPROMO', reason: 'Reserved for QA testing' },
    { code: 'INFLUENCER', reason: 'Reserved for partner program' },
    { code: 'FRAUDFIVE', reason: 'Linked to fraud ring 2026-04' },
    { code: 'CHARGEBACK', reason: 'Used by chargebacking accounts' },
  ]
  let inserted = 0
  for (const c of codes) {
    const result = await sql`
      INSERT INTO blocked_promo_codes (code, reason)
      VALUES (${c.code}, ${c.reason})
      ON CONFLICT (code) DO NOTHING
      RETURNING code
    `
    if (result.length > 0) inserted++
  }
  return inserted
}

/* -------------------------------------------------------------------------- */
/* Blocked email domains                                                       */
/* -------------------------------------------------------------------------- */

const BLOCKED_DOMAINS_LIST = [
  { domain: 'tempmail.com', reason: 'Disposable email service' },
  { domain: 'guerrillamail.com', reason: 'Disposable email service' },
  { domain: '10minutemail.com', reason: 'Disposable email service' },
  { domain: 'mailinator.com', reason: 'Disposable email service' },
  { domain: 'throwawaymail.com', reason: 'Disposable email service' },
  { domain: 'yopmail.com', reason: 'Disposable email service' },
  { domain: 'sharklasers.com', reason: 'Disposable email service' },
  { domain: 'maildrop.cc', reason: 'Disposable email service' },
  { domain: 'getnada.com', reason: 'Disposable email service' },
  { domain: 'tempinbox.com', reason: 'Disposable email service' },
  { domain: 'fakeinbox.com', reason: 'Disposable email service' },
  { domain: 'spamgourmet.com', reason: 'Aliased forwarder — abuse risk' },
  { domain: 'protonmail.ch', reason: 'High-anonymity provider — manual review' },
  { domain: 'tutanota.com', reason: 'High-anonymity provider — manual review' },
  { domain: 'cock.li', reason: 'Anonymous provider — abuse risk' },
]

async function seedBlockedDomains(sql: any): Promise<number> {
  let inserted = 0
  for (const d of BLOCKED_DOMAINS_LIST) {
    const result = await sql`
      INSERT INTO blocked_domains (domain, reason)
      VALUES (${d.domain}, ${d.reason})
      ON CONFLICT (domain) DO NOTHING
      RETURNING domain
    `
    if (result.length > 0) inserted++
  }
  return inserted
}

/* -------------------------------------------------------------------------- */
/* Tier progress                                                               */
/* -------------------------------------------------------------------------- */

async function assignTierProgress(sql: any, players: SeededPlayer[]): Promise<void> {
  const tierRows: { id: string; level: number; xp_required: string }[] = await sql`
    SELECT id, level, xp_required::text FROM tiers ORDER BY level ASC
  `
  if (tierRows.length === 0) return

  for (const p of players) {
    // Pick tier based on lifetime spend converted to XP-ish.
    const xpish = Number(p.lifetimeSpendUsd / SCALE) // major USD
    const tier = pickTierByXp(tierRows, xpish)
    const xp = formatMoney(p.lifetimeSpendUsd)
    await sql`
      INSERT INTO tier_progress (
        player_id, current_tier_id, current_tier_level,
        current_xp, tier_reached_at
      ) VALUES (
        ${p.id}, ${tier.id}, ${tier.level},
        ${xp}, ${p.createdAt}
      )
      ON CONFLICT (player_id) DO NOTHING
    `
  }
}

function pickTierByXp(
  tiers: { id: string; level: number; xp_required: string }[],
  xp: number,
): { id: string; level: number } {
  let chosen = tiers[0]!
  for (const t of tiers) {
    const required = Number(t.xp_required.split('.')[0])
    if (xp >= required) chosen = t
  }
  return chosen
}

/* -------------------------------------------------------------------------- */
/* Game activity (ledger bet/win)                                              */
/* -------------------------------------------------------------------------- */

async function seedGameActivity(
  sql: any,
  players: SeededPlayer[],
  games: { id: string; providerId: string }[],
): Promise<number> {
  if (games.length === 0) return 0
  // Idempotency guard: skip when we already have at least N seed-tagged entries.
  const existing: { count: string }[] = await sql`
    SELECT COUNT(*)::text AS count
    FROM ledger_entries
    WHERE source_id LIKE ${FAKE_LEDGER_SOURCE_PREFIX + '%'}
  `
  const have = Number(existing[0]?.count ?? 0)
  if (have >= 5000) return have

  // Also seed a couple of game_sessions per active player so the round_id /
  // session_id columns in the Game Activity tab feel real.
  const activePlayers = players.filter((p) => p.status === 'active')

  let inserted = 0
  // We'll write *only* the player-side leg to keep things simple — the Game
  // Activity tab queries by player_id, so a single row per bet/win is enough.
  const batchSize = 100
  const batch: string[] = []

  for (const p of activePlayers) {
    const totalEvents = randomInt(0, 50)
    if (totalEvents === 0) continue

    for (let i = 0; i < totalEvents; i++) {
      const game = pickRandom(games)
      // Days back capped to last 13 days to stay within the 2026-05 partition.
      const daysBack = randomInt(0, 13)
      const ts = daysAgo(daysBack, true)
      const currency = Math.random() < 0.6 ? 'SC' : 'GC'
      const betMajor = pickRandom([1, 1, 2, 5, 5, 10, 10, 25, 50])
      const betAmount = BigInt(betMajor) * SCALE
      // ~96% RTP: win amount averages 0.96 * bet, with variance.
      const isWin = Math.random() < 0.42 // ~42% of rounds have a non-zero return
      const winAmount = isWin
        ? BigInt(Math.floor(betMajor * pickRandom([0.5, 1, 1, 1.5, 2, 2, 3, 5, 10, 25]))) * SCALE
        : 0n

      const sessionId = randomUUID()
      const betPairId = randomUUID()
      const betSourceId = `${FAKE_LEDGER_SOURCE_PREFIX}bet-${betPairId}`

      // Insert bet (player_wallet debit)
      await sql`
        INSERT INTO ledger_entries (
          source, source_id, pair_id, leg,
          account_kind, account_id,
          amount, currency, sub_bucket,
          player_id, metadata, created_at
        ) VALUES (
          'bet', ${betSourceId}, ${betPairId}, 'debit',
          'player_wallet', ${p.id},
          ${formatMoney(betAmount)}, ${currency}, 'earned',
          ${p.id},
          ${JSON.stringify({ gameId: game.id, providerId: game.providerId, sessionId })}::jsonb,
          ${ts}
        )
        ON CONFLICT DO NOTHING
      `
      inserted++

      if (winAmount > 0n) {
        const winPairId = randomUUID()
        const winSourceId = `${FAKE_LEDGER_SOURCE_PREFIX}win-${winPairId}`
        const winTs = new Date(ts.getTime() + 1000) // 1s later
        await sql`
          INSERT INTO ledger_entries (
            source, source_id, pair_id, leg,
            account_kind, account_id,
            amount, currency, sub_bucket,
            player_id, metadata, created_at
          ) VALUES (
            'win', ${winSourceId}, ${winPairId}, 'credit',
            'player_wallet', ${p.id},
            ${formatMoney(winAmount)}, ${currency}, 'earned',
            ${p.id},
            ${JSON.stringify({ gameId: game.id, providerId: game.providerId, sessionId })}::jsonb,
            ${winTs}
          )
          ON CONFLICT DO NOTHING
        `
        inserted++
      }

      void batch
      void batchSize
    }
  }
  return inserted
}

/* -------------------------------------------------------------------------- */
/* CMS / Banners / Site content                                                */
/* -------------------------------------------------------------------------- */

async function seedBanners(sql: any): Promise<number> {
  const banners = [
    {
      slug: 'seed-banner-summer-jackpot',
      title: 'Summer Jackpot Festival',
      body: 'Spin daily for your share of $50,000.',
      ctaLabel: 'Play now',
      ctaUrl: '/promotions/summer-jackpot',
      pages: ['homepage', 'lobby'],
      offsetDays: -2,
      durationDays: 14,
      status: 'active',
    },
    {
      slug: 'seed-banner-vip-club',
      title: 'Join the VIP Club',
      body: 'Exclusive bonuses, faster cashouts, dedicated host.',
      ctaLabel: 'Apply',
      ctaUrl: '/vip',
      pages: ['homepage', 'cashier'],
      offsetDays: -10,
      durationDays: 60,
      status: 'active',
    },
    {
      slug: 'seed-banner-welcome',
      title: '300% Welcome Bonus',
      body: 'Triple your first purchase — first 7 days only.',
      ctaLabel: 'Buy coins',
      ctaUrl: '/cashier',
      pages: ['homepage'],
      offsetDays: 0,
      durationDays: 365,
      status: 'active',
    },
    {
      slug: 'seed-banner-new-game',
      title: 'New: Cosmic Bonanza',
      body: "Hacksaw's newest hit, live now.",
      ctaLabel: 'Play',
      ctaUrl: '/lobby/cosmic-bonanza',
      pages: ['lobby'],
      offsetDays: -1,
      durationDays: 30,
      status: 'active',
    },
    {
      slug: 'seed-banner-cashback',
      title: 'Weekly Cashback',
      body: 'Get 5% back on net losses every Monday.',
      ctaLabel: 'Learn more',
      ctaUrl: '/promotions/cashback',
      pages: ['homepage', 'lobby', 'cashier'],
      offsetDays: -30,
      durationDays: 365,
      status: 'active',
    },
    {
      slug: 'seed-banner-tournament-fall',
      title: 'Fall Slot Tournament',
      body: 'Starts October 1st. $25K prize pool.',
      ctaLabel: 'Pre-register',
      ctaUrl: '/tournaments',
      pages: ['homepage'],
      offsetDays: 30,
      durationDays: 30,
      status: 'active',
    },
    {
      slug: 'seed-banner-amoe',
      title: 'AMOE entries available',
      body: 'Mail in your free entry. Terms apply.',
      ctaLabel: 'Get details',
      ctaUrl: '/amoe',
      pages: ['homepage', 'cashier'],
      offsetDays: -90,
      durationDays: 365,
      status: 'active',
    },
    {
      slug: 'seed-banner-expired-promo',
      title: 'Spring Madness',
      body: 'Expired promotion — kept for reporting.',
      ctaLabel: 'Past',
      ctaUrl: '/',
      pages: ['homepage'],
      offsetDays: -120,
      durationDays: 30,
      status: 'inactive',
    },
    {
      slug: 'seed-banner-referral',
      title: 'Refer a friend',
      body: 'Earn 50 SC for every friend who plays.',
      ctaLabel: 'Share link',
      ctaUrl: '/refer',
      pages: ['homepage'],
      offsetDays: -45,
      durationDays: 365,
      status: 'active',
    },
    {
      slug: 'seed-banner-rg',
      title: 'Play responsibly',
      body: 'Set purchase limits and play safe.',
      ctaLabel: 'Limits',
      ctaUrl: '/responsible',
      pages: ['homepage', 'lobby', 'cashier'],
      offsetDays: -200,
      durationDays: 999,
      status: 'active',
    },
  ]
  let inserted = 0
  for (let i = 0; i < banners.length; i++) {
    const b = banners[i]!
    const startsAt = daysFromNow(b.offsetDays)
    const endsAt = daysFromNow(b.offsetDays + b.durationDays)
    const result = await sql`
      INSERT INTO banners (
        slug, title, body, cta_label, cta_url, pages,
        starts_at, ends_at, sort_order, status
      ) VALUES (
        ${b.slug}, ${b.title}, ${b.body}, ${b.ctaLabel}, ${b.ctaUrl},
        ${b.pages},
        ${startsAt}, ${endsAt}, ${i}, ${b.status}
      )
      ON CONFLICT (slug) DO NOTHING
      RETURNING id
    `
    if (result.length > 0) inserted++
  }
  return inserted
}

async function seedSiteContent(sql: any): Promise<number> {
  // Hero / promo / popup content lives in site_content with a shape hint so
  // the CMS admin page can render a typed list.
  const items: Array<{ key: string; kind: string; payload: Record<string, unknown> }> = [
    {
      key: `${FAKE_SITE_CONTENT_PREFIX}hero-default`,
      kind: 'hero',
      payload: {
        headline: 'Welcome to CoinFrenzy',
        subhead: 'Play 500+ slots and table games. Sweep prizes daily.',
        ctaText: 'Get started',
        ctaUrl: '/signup',
        imageUrl: null,
        status: 'live',
      },
    },
    {
      key: `${FAKE_SITE_CONTENT_PREFIX}hero-summer`,
      kind: 'hero',
      payload: {
        headline: 'Summer of Slots',
        subhead: 'Daily jackpots all summer long.',
        ctaText: 'Play now',
        ctaUrl: '/lobby',
        imageUrl: null,
        status: 'scheduled',
      },
    },
    {
      key: `${FAKE_SITE_CONTENT_PREFIX}hero-vip`,
      kind: 'hero',
      payload: {
        headline: 'VIP players get more',
        subhead: 'Exclusive packs, instant cashouts, host access.',
        ctaText: 'Apply',
        ctaUrl: '/vip',
        imageUrl: null,
        status: 'live',
      },
    },
    {
      key: `${FAKE_SITE_CONTENT_PREFIX}hero-new-player`,
      kind: 'hero',
      payload: {
        headline: 'New to CoinFrenzy?',
        subhead: '300% welcome bonus on your first purchase.',
        ctaText: 'Claim',
        ctaUrl: '/cashier',
        imageUrl: null,
        status: 'live',
      },
    },
    {
      key: `${FAKE_SITE_CONTENT_PREFIX}hero-expired`,
      kind: 'hero',
      payload: {
        headline: 'Spring Spin Festival',
        subhead: 'Now ended.',
        ctaText: 'Past',
        ctaUrl: '/',
        imageUrl: null,
        status: 'expired',
      },
    },
    // Promo banners (8)
    ...Array.from({ length: 8 }).map((_, i) => ({
      key: `${FAKE_SITE_CONTENT_PREFIX}promo-${i + 1}`,
      kind: 'promo',
      payload: {
        headline: `Promo Tile #${i + 1}`,
        subhead: pickRandom([
          'Free spins on Cosmic Bonanza.',
          'Buy coins, get 50% extra GC.',
          'Win up to 1,000 SC daily.',
          'Tournament starts Friday.',
        ]),
        ctaText: 'Open',
        ctaUrl: '/promotions',
        status: i === 7 ? 'expired' : 'live',
      },
    })),
    // Popups (3)
    ...Array.from({ length: 3 }).map((_, i) => ({
      key: `${FAKE_SITE_CONTENT_PREFIX}popup-${i + 1}`,
      kind: 'popup',
      payload: {
        headline: ['Don’t leave!', 'Claim your bonus', 'Daily login reward'][i],
        body: 'Limited-time offer — claim before midnight.',
        ctaText: 'Claim',
        ctaUrl: '/cashier',
        status: 'live',
      },
    })),
  ]

  let inserted = 0
  for (const item of items) {
    const result = await sql`
      INSERT INTO site_content (key, value_json, version, audience)
      VALUES (
        ${item.key},
        ${JSON.stringify({ kind: item.kind, ...item.payload })}::jsonb,
        1, 'public'
      )
      ON CONFLICT (key) DO NOTHING
      RETURNING id
    `
    if (result.length > 0) inserted++
  }
  return inserted
}

/* -------------------------------------------------------------------------- */
/* CRM message log (Email Center)                                              */
/* -------------------------------------------------------------------------- */

async function seedMessageLog(sql: any, players: SeededPlayer[]): Promise<number> {
  const target = 150
  const existing: { count: string }[] = await sql`
    SELECT COUNT(*)::text AS count
    FROM crm_message_log
    WHERE sendgrid_message_id LIKE ${FAKE_MESSAGE_TAG + '%'}
  `
  const have = Number(existing[0]?.count ?? 0)
  if (have >= target) return have

  const subjects = [
    'Welcome to CoinFrenzy',
    'Your weekly bonus is ready',
    "Don't miss tonight's jackpot",
    'Daily login streak: keep it alive',
    "You've been awarded 5,000 GC",
    'New game alert: Cosmic Bonanza',
    'Reactivate your account',
    'Limited-time package — 50% extra',
    'KYC verification required',
    'Your redemption is on the way',
  ]
  const statuses: { value: string; weight: number }[] = [
    { value: 'delivered', weight: 0.55 },
    { value: 'opened', weight: 0.2 },
    { value: 'clicked', weight: 0.1 },
    { value: 'bounced', weight: 0.07 },
    { value: 'failed', weight: 0.05 },
    { value: 'unsubscribed', weight: 0.03 },
  ]

  let inserted = 0
  for (let i = have; i < target; i++) {
    const player = pickRandom(players)
    const subj = pickRandom(subjects)
    const status = pickWeighted(statuses.map((s) => [s.value, s.weight]))
    const created = daysAgo(randomInt(0, 13), true)
    const sentAt = new Date(created.getTime() + 60_000)
    const deliveredAt =
      status === 'failed' || status === 'bounced' ? null : new Date(created.getTime() + 120_000)
    const openedAt =
      status === 'opened' || status === 'clicked' ? new Date(created.getTime() + 600_000) : null
    const clickedAt = status === 'clicked' ? new Date(created.getTime() + 900_000) : null
    const channel = Math.random() < 0.85 ? 'email' : 'sms'

    await sql`
      INSERT INTO crm_message_log (
        player_id, channel, recipient,
        subject, body_preview,
        status, sendgrid_message_id,
        queued_at, sent_at, delivered_at, opened_at, clicked_at,
        created_at
      ) VALUES (
        ${player.id}, ${channel}, ${channel === 'email' ? player.email : '+1555' + String(i).padStart(7, '0')},
        ${subj}, ${'Hi there, ' + subj.toLowerCase() + ' — open to learn more.'},
        ${status}, ${FAKE_MESSAGE_TAG + i},
        ${created}, ${sentAt}, ${deliveredAt}, ${openedAt}, ${clickedAt},
        ${created}
      )
      ON CONFLICT DO NOTHING
    `
    inserted++
  }
  return inserted
}

/* -------------------------------------------------------------------------- */
/* In-app notifications                                                        */
/* -------------------------------------------------------------------------- */

async function seedInAppNotifications(sql: any, players: SeededPlayer[]): Promise<number> {
  const target = 50
  const existing: { count: string }[] = await sql`
    SELECT COUNT(*)::text AS count
    FROM notifications
    WHERE source_kind = ${FAKE_NOTIFICATION_TAG}
  `
  const have = Number(existing[0]?.count ?? 0)
  if (have >= target) return have

  const titles = [
    { title: 'You won 250 SC!', body: 'Your spin on Cosmic Bonanza paid out.', priority: 'normal' },
    { title: 'KYC verification complete', body: 'You can now redeem.', priority: 'high' },
    {
      title: 'Daily login bonus ready',
      body: 'Claim 5,000 GC before midnight.',
      priority: 'normal',
    },
    {
      title: 'New tournament starting',
      body: 'Cosmic slots tournament begins in 1 hour.',
      priority: 'normal',
    },
    { title: 'Weekly cashback paid', body: 'You received 8 SC cashback.', priority: 'low' },
    { title: 'Compliance check', body: 'Please confirm your address.', priority: 'high' },
  ]

  let inserted = 0
  for (let i = have; i < target; i++) {
    const player = pickRandom(players)
    const t = pickRandom(titles)
    const created = daysAgo(randomInt(0, 13), true)
    const isRead = Math.random() < 0.4
    await sql`
      INSERT INTO notifications (
        player_id, title, body, category, priority,
        read_at, source_kind, source_id, created_at
      ) VALUES (
        ${player.id}, ${t.title}, ${t.body},
        'system', ${t.priority},
        ${isRead ? new Date(created.getTime() + 3600_000) : null},
        ${FAKE_NOTIFICATION_TAG},
        ${'seed-' + i},
        ${created}
      )
    `
    inserted++
  }
  return inserted
}

/* -------------------------------------------------------------------------- */
/* Admin adjustments                                                           */
/* -------------------------------------------------------------------------- */

async function seedAdminAdjustments(sql: any, players: SeededPlayer[]): Promise<number> {
  // Find any admin to attribute the adjustments to.
  const adminRows: { id: string }[] = await sql`SELECT id FROM admins LIMIT 1`
  if (adminRows.length === 0) {
    console.warn('skipping admin_adjustments seed — no admin row found')
    return 0
  }
  const adminId = adminRows[0]!.id
  const target = 30
  const existing: { count: string }[] = await sql`
    SELECT COUNT(*)::text AS count
    FROM admin_adjustments
    WHERE reason LIKE ${'%' + FAKE_ADJUSTMENT_REASON_TAG + '%'}
  `
  const have = Number(existing[0]?.count ?? 0)
  if (have >= target) return have

  const reasons = [
    'Goodwill credit',
    'Compensation for failed game round',
    'Promotional reward',
    'Compliance reversal',
    'Fraud reversal',
    'Manual VIP top-up',
    'CS escalation refund',
  ]
  const categories = [
    'goodwill',
    'compensation',
    'promotion',
    'compliance',
    'fraud',
    'vip',
    'support',
  ]

  let inserted = 0
  for (let i = have; i < target; i++) {
    const player = pickRandom(players)
    const idx = i % reasons.length
    const reason = `${reasons[idx]} ${FAKE_ADJUSTMENT_REASON_TAG}`
    const category = categories[idx]!
    const direction = Math.random() < 0.75 ? 'credit' : 'debit'
    const currency = Math.random() < 0.7 ? 'GC' : 'SC'
    const subBucket = currency === 'SC' ? 'bonus' : 'earned'
    const amount =
      currency === 'SC'
        ? BigInt(pickRandom([5, 10, 25, 50, 100])) * SCALE
        : BigInt(pickRandom([10_000, 25_000, 50_000])) * SCALE
    const created = daysAgo(randomInt(0, 13), true)

    await sql`
      INSERT INTO admin_adjustments (
        player_id, admin_id, amount, currency, sub_bucket, direction,
        reason, reason_category, requires_approval,
        created_at
      ) VALUES (
        ${player.id}, ${adminId}, ${formatMoney(amount)}, ${currency}, ${subBucket}, ${direction},
        ${reason}, ${category}, false,
        ${created}
      )
    `
    inserted++
  }
  return inserted
}

/* -------------------------------------------------------------------------- */
/* CRM segments — 5 hand-built using the new attribute compiler                */
/* -------------------------------------------------------------------------- */

const FAKE_SEGMENT_DESC_TAG = '[seed segment]'
const FAKE_CAMPAIGN_DESC_TAG = '[seed campaign]'
const FAKE_FLOW_ENROLL_TAG = 'seed-flow-enroll'

async function seedCrmSegments(sql: any): Promise<number> {
  const segments: Array<{
    name: string
    description: string
    filterTree: Record<string, unknown>
    cachedCount: number
  }> = [
    {
      name: 'Whales — top 5%',
      description: `High value players with significant lifetime spend. ${FAKE_SEGMENT_DESC_TAG}`,
      filterTree: {
        operator: 'AND',
        conditions: [
          {
            type: 'attribute',
            attributeKey: 'lifetime_spend_usd',
            operator: '>=',
            value: 10000,
          },
        ],
      },
      cachedCount: 12,
    },
    {
      name: 'New players — last 7 days',
      description: `Recently registered players. Welcome and activation candidates. ${FAKE_SEGMENT_DESC_TAG}`,
      filterTree: {
        operator: 'AND',
        conditions: [
          {
            type: 'attribute',
            attributeKey: 'registered_at',
            operator: 'in_last_n_days',
            value: 7,
          },
        ],
      },
      cachedCount: 32,
    },
    {
      name: 'Lapsed — 30 days inactive',
      description: `Players who haven't logged in for 30+ days. Re-engagement targets. ${FAKE_SEGMENT_DESC_TAG}`,
      filterTree: {
        operator: 'AND',
        conditions: [
          {
            type: 'attribute',
            attributeKey: 'last_login_at',
            operator: 'more_than_n_days_ago',
            value: 30,
          },
        ],
      },
      cachedCount: 48,
    },
    {
      name: 'KYC pending — purchased',
      description: `Players who made a purchase but haven't completed KYC. Compliance follow-up. ${FAKE_SEGMENT_DESC_TAG}`,
      filterTree: {
        operator: 'AND',
        conditions: [
          {
            type: 'attribute',
            attributeKey: 'kyc_level',
            operator: '<',
            value: 2,
          },
          {
            type: 'attribute',
            attributeKey: 'lifetime_purchase_count',
            operator: '>=',
            value: 1,
          },
        ],
      },
      cachedCount: 18,
    },
    {
      name: 'Slot lovers',
      description: `Players whose primary activity is slots — heavy promo audience. ${FAKE_SEGMENT_DESC_TAG}`,
      filterTree: {
        operator: 'AND',
        conditions: [
          {
            type: 'attribute',
            attributeKey: 'lifetime_bet_count',
            operator: '>=',
            value: 10,
          },
        ],
      },
      cachedCount: 67,
    },
  ]

  let inserted = 0
  for (const s of segments) {
    const result: { id: string }[] = await sql`
      INSERT INTO crm_segments (name, description, filter_tree, cached_count, count_updated_at, status)
      VALUES (${s.name}, ${s.description}, ${JSON.stringify(s.filterTree)}::jsonb,
        ${s.cachedCount}, NOW(), 'active')
      ON CONFLICT (name) DO NOTHING
      RETURNING id
    `
    if (result.length > 0) inserted++
  }
  return inserted
}

/* -------------------------------------------------------------------------- */
/* Historical campaigns — 10 with realistic engagement                         */
/* -------------------------------------------------------------------------- */

async function seedHistoricalCampaigns(sql: any, players: SeededPlayer[]): Promise<number> {
  if (players.length === 0) return 0

  const segments: { id: string; name: string }[] = await sql`
    SELECT id, name FROM crm_segments WHERE description LIKE ${'%' + FAKE_SEGMENT_DESC_TAG + '%'}
  `
  const emailTemplates: { id: string }[] = await sql`
    SELECT id FROM email_templates WHERE is_current = true LIMIT 5
  `
  if (segments.length === 0 || emailTemplates.length === 0) return 0

  const campaigns: Array<{
    name: string
    daysAgo: number
    sentRatio: number
    openRatio: number
    clickRatio: number
    convRatio: number
    bounceRatio: number
    unsubRatio: number
    audience: number
    status: string
    abEnabled: boolean
  }> = [
    {
      name: 'Welcome Series — Email 1',
      daysAgo: 18,
      sentRatio: 1.0,
      openRatio: 0.34,
      clickRatio: 0.08,
      convRatio: 0.04,
      bounceRatio: 0.02,
      unsubRatio: 0.005,
      audience: 480,
      status: 'sent',
      abEnabled: false,
    },
    {
      name: 'September Re-engagement',
      daysAgo: 12,
      sentRatio: 0.95,
      openRatio: 0.18,
      clickRatio: 0.04,
      convRatio: 0.015,
      bounceRatio: 0.04,
      unsubRatio: 0.01,
      audience: 220,
      status: 'sent',
      abEnabled: false,
    },
    {
      name: 'VIP Cashback Reminder',
      daysAgo: 9,
      sentRatio: 1.0,
      openRatio: 0.55,
      clickRatio: 0.22,
      convRatio: 0.18,
      bounceRatio: 0.005,
      unsubRatio: 0.002,
      audience: 64,
      status: 'sent',
      abEnabled: false,
    },
    {
      name: 'KYC Final Reminder',
      daysAgo: 7,
      sentRatio: 0.99,
      openRatio: 0.42,
      clickRatio: 0.18,
      convRatio: 0.11,
      bounceRatio: 0.01,
      unsubRatio: 0.003,
      audience: 145,
      status: 'sent',
      abEnabled: false,
    },
    {
      name: 'Mega Jackpot Friday',
      daysAgo: 5,
      sentRatio: 1.0,
      openRatio: 0.28,
      clickRatio: 0.07,
      convRatio: 0.025,
      bounceRatio: 0.02,
      unsubRatio: 0.008,
      audience: 950,
      status: 'sent',
      abEnabled: true,
    },
    {
      name: 'New Game — Cosmic Bonanza',
      daysAgo: 4,
      sentRatio: 1.0,
      openRatio: 0.22,
      clickRatio: 0.05,
      convRatio: 0.018,
      bounceRatio: 0.025,
      unsubRatio: 0.006,
      audience: 720,
      status: 'sent',
      abEnabled: false,
    },
    {
      name: 'Daily Bonus — Saturday',
      daysAgo: 3,
      sentRatio: 1.0,
      openRatio: 0.31,
      clickRatio: 0.09,
      convRatio: 0.04,
      bounceRatio: 0.018,
      unsubRatio: 0.004,
      audience: 1100,
      status: 'sent',
      abEnabled: false,
    },
    {
      name: 'A/B — Subject line test',
      daysAgo: 2,
      sentRatio: 1.0,
      openRatio: 0.36,
      clickRatio: 0.11,
      convRatio: 0.05,
      bounceRatio: 0.012,
      unsubRatio: 0.003,
      audience: 600,
      status: 'sent',
      abEnabled: true,
    },
    {
      name: 'Weekly newsletter',
      daysAgo: 1,
      sentRatio: 1.0,
      openRatio: 0.24,
      clickRatio: 0.06,
      convRatio: 0.02,
      bounceRatio: 0.022,
      unsubRatio: 0.007,
      audience: 1500,
      status: 'sent',
      abEnabled: false,
    },
    {
      name: 'Tomorrow — flash promo',
      daysAgo: -1,
      sentRatio: 0,
      openRatio: 0,
      clickRatio: 0,
      convRatio: 0,
      bounceRatio: 0,
      unsubRatio: 0,
      audience: 800,
      status: 'scheduled',
      abEnabled: false,
    },
  ]

  let inserted = 0
  for (const c of campaigns) {
    const exists: { id: string }[] = await sql`
      SELECT id FROM crm_campaigns WHERE name = ${c.name} LIMIT 1
    `
    if (exists.length > 0) continue

    const segment = pickRandom(segments)
    const template = pickRandom(emailTemplates)
    const sent = Math.round(c.audience * c.sentRatio)
    const opened = Math.round(sent * c.openRatio)
    const clicked = Math.round(sent * c.clickRatio)
    const convs = Math.round(sent * c.convRatio)
    const bounced = Math.round(sent * c.bounceRatio)
    const unsubbed = Math.round(sent * c.unsubRatio)
    const delivered = sent - bounced
    const sentStarted = c.daysAgo >= 0 ? daysAgo(c.daysAgo, true) : null
    const sentCompleted =
      c.daysAgo >= 0 ? new Date((sentStarted as Date).getTime() + 30 * 60_000) : null
    const scheduled = c.daysAgo < 0 ? daysFromNow(-c.daysAgo) : null

    const result: { id: string }[] = await sql`
      INSERT INTO crm_campaigns (
        name, description, segment_id, channel, template_id,
        ab_variant_a_template_id, ab_variant_b_template_id, ab_split_pct, ab_winner_metric,
        ab_winning_variant,
        status, scheduled_for, sent_started_at, sent_completed_at,
        recipients_count, eligible_count, sent_count, delivered_count,
        opened_count, clicked_count, bounced_count, unsubscribed_count,
        conversion_count, conversion_event,
        created_at, updated_at
      ) VALUES (
        ${c.name},
        ${'Sent to ' + segment.name + ' segment. ' + FAKE_CAMPAIGN_DESC_TAG},
        ${segment.id},
        'email',
        ${template.id},
        ${c.abEnabled ? template.id : null},
        ${c.abEnabled ? template.id : null},
        ${c.abEnabled ? 50 : null},
        ${c.abEnabled ? 'open_rate' : null},
        ${c.abEnabled ? 'a' : null},
        ${c.status},
        ${scheduled},
        ${sentStarted},
        ${sentCompleted},
        ${c.audience}, ${c.audience}, ${sent}, ${delivered},
        ${opened}, ${clicked}, ${bounced}, ${unsubbed},
        ${convs}, ${convs > 0 ? 'player.purchase.succeeded' : null},
        ${sentStarted ?? scheduled ?? new Date()},
        ${sentCompleted ?? scheduled ?? new Date()}
      )
      RETURNING id
    `
    if (result.length > 0) inserted++
  }
  return inserted
}

/* -------------------------------------------------------------------------- */
/* Flow enrollments — distribute fake players across the 6 seeded flows       */
/* -------------------------------------------------------------------------- */

async function seedFlowEnrollments(sql: any, players: SeededPlayer[]): Promise<number> {
  if (players.length === 0) return 0

  const flows: Array<{ id: string; name: string }> = await sql`
    SELECT id, name FROM crm_flows WHERE status = 'active'
    ORDER BY name LIMIT 6
  `
  if (flows.length === 0) return 0

  const existing: { count: string }[] = await sql`
    SELECT COUNT(*)::text AS count
    FROM crm_flow_enrollments
    WHERE error_message LIKE ${'%' + FAKE_FLOW_ENROLL_TAG + '%'}
  `
  if (Number(existing[0]?.count ?? 0) >= 80) return Number(existing[0]!.count)

  let inserted = 0
  // Distribute ~80 enrollments across the active flows.
  for (const flow of flows) {
    const count = randomInt(8, 18)
    let lifetime = 0
    for (let i = 0; i < count; i++) {
      const player = pickRandom(players)
      const enrolledAt = daysAgo(randomInt(0, 30), true)
      const status = pickWeighted([
        ['active', 0.45],
        ['completed', 0.4],
        ['cancelled', 0.1],
        ['errored', 0.05],
      ])
      const completedAt =
        status === 'completed' ? new Date(enrolledAt.getTime() + 24 * 3600_000) : null
      const currentStep = status === 'completed' ? randomInt(3, 5) : randomInt(1, 4)
      const nextActionAt =
        status === 'active' ? new Date(Date.now() + randomInt(1, 48) * 3600_000) : enrolledAt
      const errorMsg = `${FAKE_FLOW_ENROLL_TAG} ${i}`

      await sql`
        INSERT INTO crm_flow_enrollments (
          flow_id, player_id, current_step, next_action_at, status,
          enrolled_at, completed_at, last_step_at, error_message
        ) VALUES (
          ${flow.id}, ${player.id}, ${currentStep}, ${nextActionAt}, ${status},
          ${enrolledAt}, ${completedAt}, ${enrolledAt}, ${status === 'errored' ? errorMsg : errorMsg}
        )
        ON CONFLICT DO NOTHING
      `
      inserted++
      lifetime++
    }
    await sql`
      UPDATE crm_flows
      SET enrollments_count_lifetime = enrollments_count_lifetime + ${lifetime}
      WHERE id = ${flow.id}
    `
  }
  return inserted
}

/* -------------------------------------------------------------------------- */
/* Teardown of fixture-only rows                                               */
/* -------------------------------------------------------------------------- */

export async function teardownFixtures(sql: any): Promise<void> {
  console.log('Removing seeded catalog + activity fixtures…')

  await sql`DELETE FROM admin_adjustments WHERE reason LIKE ${'%' + FAKE_ADJUSTMENT_REASON_TAG + '%'}`
  await sql`DELETE FROM notifications WHERE source_kind = ${FAKE_NOTIFICATION_TAG}`
  await sql`DELETE FROM crm_flow_enrollments WHERE error_message LIKE ${'%' + FAKE_FLOW_ENROLL_TAG + '%'}`
  await sql`DELETE FROM crm_campaigns WHERE description LIKE ${'%' + FAKE_CAMPAIGN_DESC_TAG + '%'}`
  await sql`DELETE FROM crm_segments WHERE description LIKE ${'%' + FAKE_SEGMENT_DESC_TAG + '%'}`
  await sql`DELETE FROM crm_message_log WHERE sendgrid_message_id LIKE ${FAKE_MESSAGE_TAG + '%'}`
  await sql`DELETE FROM banners WHERE slug LIKE ${FAKE_BANNER_PREFIX + '%'}`
  await sql`DELETE FROM site_content WHERE key LIKE ${FAKE_SITE_CONTENT_PREFIX + '%'}`
  await sql`DELETE FROM ledger_entries WHERE source_id LIKE ${FAKE_LEDGER_SOURCE_PREFIX + '%'}`
  await sql`DELETE FROM blocked_promo_codes WHERE code IN ('STAFF', 'TESTPROMO', 'INFLUENCER', 'FRAUDFIVE', 'CHARGEBACK')`
  await sql`DELETE FROM promo_codes WHERE code LIKE ${FAKE_PROMO_PREFIX + '%'}`
  await sql`DELETE FROM bonuses WHERE slug LIKE ${FAKE_BONUS_PREFIX + '%'} OR slug IN ('seed-jackpot-mega', 'seed-jackpot-grand', 'seed-jackpot-daily')`
  await sql`DELETE FROM bonuses WHERE slug LIKE 'seed-%'`
  await sql`DELETE FROM blocked_domains WHERE domain IN ${sql(BLOCKED_DOMAINS_LIST.map((d) => d.domain))}`
  await sql`DELETE FROM games WHERE slug LIKE ${FAKE_GAME_PREFIX + '%'}`
  await sql`DELETE FROM game_providers WHERE slug LIKE ${FAKE_PROVIDER_PREFIX + '%'}`
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

function daysFromNow(days: number): Date {
  return daysAgo(-days)
}

function formatMoney(value: bigint): string {
  const negative = value < 0n
  const abs = negative ? -value : value
  const major = abs / SCALE
  const minor = abs % SCALE
  return `${negative ? '-' : ''}${major}.${minor.toString().padStart(4, '0')}`
}

/* -------------------------------------------------------------------------- */
/* M4 — VIP / Host fixtures                                                    */
/* -------------------------------------------------------------------------- */

const FAKE_HOSTS: { email: string; displayName: string }[] = [
  { email: 'jane.host@coinfrenzy-fake.test', displayName: 'Jane Mitchell' },
  { email: 'mike.host@coinfrenzy-fake.test', displayName: 'Mike Torres' },
  { email: 'sarah.host@coinfrenzy-fake.test', displayName: 'Sarah Chen' },
]

// Seed temp password — hashed at runtime so the value is auditable in the
// seed file without checking in a fixed bcrypt blob.
const FAKE_HOST_PASSWORD = 'host_temp_pass_2026'

const FAKE_HOST_INTERACTION_TAG = 'seed-host-interaction'

const HOST_BONUS_TEMPLATES: {
  slug: string
  displayName: string
  description: string
  awardSc: bigint
  playthroughMultiplier: string
  bonusType: string
}[] = [
  {
    slug: 'seed-host-vip-daily-boost',
    displayName: 'VIP Daily Boost',
    description: 'Small SC top-up for engaged VIPs.',
    awardSc: 5n * SCALE,
    playthroughMultiplier: '0',
    bonusType: 'promotion',
  },
  {
    slug: 'seed-host-vip-weekend',
    displayName: 'VIP Weekend Bonus',
    description: 'Weekend SC for active VIPs.',
    awardSc: 25n * SCALE,
    playthroughMultiplier: '1',
    bonusType: 'promotion',
  },
  {
    slug: 'seed-host-birthday',
    displayName: 'Birthday Bonus',
    description: 'Celebrate a VIP birthday with a no-playthrough SC gift.',
    awardSc: 50n * SCALE,
    playthroughMultiplier: '0',
    bonusType: 'promotion',
  },
  {
    slug: 'seed-host-comeback',
    displayName: 'Comeback Bonus',
    description: 'Win back a dormant VIP.',
    awardSc: 15n * SCALE,
    playthroughMultiplier: '0',
    bonusType: 'promotion',
  },
  {
    slug: 'seed-host-high-roller-treat',
    displayName: 'High Roller Treat',
    description: 'For our top VIPs.',
    awardSc: 100n * SCALE,
    playthroughMultiplier: '0',
    bonusType: 'promotion',
  },
]

interface HostRow {
  id: string
  email: string
  displayName: string
}

async function seedVipHosts(
  sql: any,
  players: SeededPlayer[],
): Promise<{ hosts: number; assignedVips: number; unassigned: number; interactions: number }> {
  if (players.length === 0) {
    return { hosts: 0, assignedVips: 0, unassigned: 0, interactions: 0 }
  }

  // 1. host bonus templates — ensure they exist and are marked host_available
  await seedHostBonusTemplates(sql)

  // 2. hosts — insert admins + assign 'host' role
  const hostRows = await seedHostAdmins(sql)

  // 3. mark high-spend players as VIPs and round-robin assign to hosts
  const { assignedVips, unassigned } = await seedVipAssignments(sql, players, hostRows)

  // 4. generate historical interactions
  const interactions = await seedHostInteractions(sql, hostRows)

  return { hosts: hostRows.length, assignedVips, unassigned, interactions }
}

async function seedHostBonusTemplates(sql: any): Promise<void> {
  for (const t of HOST_BONUS_TEMPLATES) {
    await sql`
      INSERT INTO bonuses (
        slug, display_name, bonus_type, award_gc, award_sc,
        playthrough_multiplier, status, description, host_available
      )
      VALUES (
        ${t.slug}, ${t.displayName}, ${t.bonusType},
        0, ${formatMoney(t.awardSc)},
        ${t.playthroughMultiplier}, 'active', ${t.description}, true
      )
      ON CONFLICT (slug) DO UPDATE SET
        host_available = EXCLUDED.host_available,
        award_sc = EXCLUDED.award_sc,
        description = EXCLUDED.description
    `
  }
}

async function seedHostAdmins(sql: any): Promise<HostRow[]> {
  const [hostRole]: { id: string }[] = await sql`
    SELECT id FROM admin_roles WHERE slug = 'host' LIMIT 1
  `
  if (!hostRole) {
    console.warn("  ! 'host' role missing from admin_roles — run db:migrate first.")
    return []
  }

  const passwordHash = await bcrypt.hash(FAKE_HOST_PASSWORD, 12)

  const out: HostRow[] = []
  for (const h of FAKE_HOSTS) {
    const existing: { id: string; email: string; displayName: string }[] = await sql`
      SELECT id, email, display_name AS "displayName"
      FROM admins WHERE lower(email) = lower(${h.email}) LIMIT 1
    `
    let hostId: string
    if (existing.length > 0) {
      hostId = existing[0]!.id
    } else {
      const created: { id: string }[] = await sql`
        INSERT INTO admins (email, display_name, password_hash, status, created_at)
        VALUES (
          ${h.email}, ${h.displayName}, ${passwordHash}, 'active',
          NOW() - INTERVAL '45 days'
        )
        RETURNING id
      `
      hostId = created[0]!.id
    }

    await sql`
      INSERT INTO admin_role_assignments (admin_id, role_id)
      VALUES (${hostId}, ${hostRole.id})
      ON CONFLICT (admin_id, role_id) DO NOTHING
    `
    out.push({ id: hostId, email: h.email, displayName: h.displayName })
  }
  return out
}

async function seedVipAssignments(
  sql: any,
  players: SeededPlayer[],
  hosts: HostRow[],
): Promise<{ assignedVips: number; unassigned: number }> {
  if (hosts.length === 0) return { assignedVips: 0, unassigned: 0 }

  // Pull lifetime spend directly from the DB so the seed works whether or
  // not the player array was freshly created (on re-runs SeededPlayer.
  // lifetimeSpendUsd is 0n because we don't refetch).
  const vipThreshold = 1_000n * SCALE
  const highRollerThreshold = 10_000n * SCALE

  const rows: { id: string; spend: string }[] = await sql`
    SELECT p.id, COALESCE(s.total_deposited_usd, 0)::text AS spend
    FROM players p
    LEFT JOIN player_lifetime_stats s ON s.player_id = p.id
    WHERE p.deleted_at IS NULL
      AND p.is_internal_account = false
      AND COALESCE(s.total_deposited_usd, 0) >= ${formatMoney(vipThreshold)}::numeric(20,4)
    ORDER BY s.total_deposited_usd DESC NULLS LAST
  `

  let assigned = 0
  let unassignedCount = 0
  for (let i = 0; i < rows.length; i++) {
    const p = rows[i]!
    const spendMinor = decimalStringToMinor(p.spend)
    const status: 'vip' | 'high_roller' = spendMinor >= highRollerThreshold ? 'high_roller' : 'vip'

    const leaveUnassigned = i % 5 === 0
    const host = leaveUnassigned ? null : hosts[i % hosts.length]!

    const qualifiedDaysAgo = (i % 90) + 1
    const hostAssignedDaysAgo = host ? Math.min(qualifiedDaysAgo, (i % 30) + 1) : null

    if (host && hostAssignedDaysAgo != null) {
      await sql`
        UPDATE players
        SET vip_status = ${status},
            vip_qualified_at = NOW() - (${qualifiedDaysAgo}::int * INTERVAL '1 day'),
            assigned_host_id = ${host.id},
            host_assigned_at = NOW() - (${hostAssignedDaysAgo}::int * INTERVAL '1 day')
        WHERE id = ${p.id}
      `
    } else {
      await sql`
        UPDATE players
        SET vip_status = ${status},
            vip_qualified_at = NOW() - (${qualifiedDaysAgo}::int * INTERVAL '1 day'),
            assigned_host_id = NULL,
            host_assigned_at = NULL
        WHERE id = ${p.id}
      `
    }
    if (host) assigned++
    else unassignedCount++
  }
  // Suppress unused-param warning when re-run skips player creation.
  void players
  return { assignedVips: assigned, unassigned: unassignedCount }
}

function decimalStringToMinor(value: string): bigint {
  if (!value) return 0n
  const negative = value.startsWith('-')
  const abs = negative ? value.slice(1) : value
  const [maj = '0', frac = ''] = abs.split('.')
  const fracPadded = (frac + '0000').slice(0, 4)
  try {
    const v = BigInt(maj) * SCALE + BigInt(fracPadded || '0')
    return negative ? -v : v
  } catch {
    return 0n
  }
}

async function seedHostInteractions(sql: any, hosts: HostRow[]): Promise<number> {
  if (hosts.length === 0) return 0

  // Have we already seeded interactions? Detect via a fixed metadata tag.
  const existing: { count: string }[] = await sql`
    SELECT COUNT(*)::text AS count FROM host_player_interactions
    WHERE metadata->>'seed_tag' = ${FAKE_HOST_INTERACTION_TAG}
  `
  if (Number(existing[0]?.count ?? 0) > 0) {
    return Number(existing[0]!.count)
  }

  // Pick a sample of players assigned to each host.
  let total = 0
  for (const host of hosts) {
    const assigned: { id: string }[] = await sql`
      SELECT id FROM players
      WHERE assigned_host_id = ${host.id}
      ORDER BY random() LIMIT 20
    `
    if (assigned.length === 0) continue

    const types: { type: string; outcome: string | null; weight: number }[] = [
      { type: 'call', outcome: 'positive', weight: 4 },
      { type: 'call', outcome: 'no_response', weight: 2 },
      { type: 'text', outcome: 'positive', weight: 3 },
      { type: 'text', outcome: 'neutral', weight: 1 },
      { type: 'email', outcome: 'positive', weight: 2 },
      { type: 'bonus_sent', outcome: null, weight: 2 },
      { type: 'note', outcome: null, weight: 1 },
    ]
    const totalWeight = types.reduce((acc, t) => acc + t.weight, 0)

    for (let i = 0; i < assigned.length; i++) {
      const player = assigned[i]!
      // 2-3 interactions per player on average
      const count = 1 + (i % 3)
      for (let j = 0; j < count; j++) {
        const r = ((i * 7 + j * 13) % totalWeight) + 1
        let acc = 0
        let pick = types[0]!
        for (const t of types) {
          acc += t.weight
          if (r <= acc) {
            pick = t
            break
          }
        }
        const daysAgo = ((i + j) % 60) + 1
        const notes =
          pick.type === 'call'
            ? 'Touched base; player happy with recent run.'
            : pick.type === 'text'
              ? 'Sent a quick check-in.'
              : pick.type === 'email'
                ? 'Followed up on last weekend bonus.'
                : pick.type === 'note'
                  ? 'High-touch player — keep in regular contact.'
                  : pick.type === 'bonus_sent'
                    ? 'VIP weekend bonus delivered.'
                    : null
        await sql`
          INSERT INTO host_player_interactions (
            host_id, player_id, interaction_type, notes, outcome, metadata, created_at
          )
          VALUES (
            ${host.id}, ${player.id}, ${pick.type}, ${notes}, ${pick.outcome},
            ${JSON.stringify({
              seed_tag: FAKE_HOST_INTERACTION_TAG,
              ...(pick.type === 'bonus_sent' ? { sc_amount: '250000' } : {}),
            })}::jsonb,
            NOW() - (${daysAgo}::int * INTERVAL '1 day')
          )
        `
        total++
      }
    }
  }
  return total
}
