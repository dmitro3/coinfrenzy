// docs/11 §6 — variable preview engine.
//
// Used by:
//   - Email/SMS template editors ("preview against a real player")
//   - CampaignWizard step 3 (live preview panel toggleable across 3 sample players)
//   - Flow node send-step config preview
//
// Renders a Handlebars template against a fully-resolved
// PlayerVariableContext computed from the player's row + the attribute
// registry. Returns:
//   - rendered string
//   - list of variables found in the template
//   - list of variables missing for this player (with warning)
//   - rough heuristics: estimated email size / SMS segments / spam score
//
// We do NOT call SendGrid/Twilio's "real" spam scoring API here — the
// score is a fast local heuristic suitable for an editor preview.

import { sql } from 'drizzle-orm'
import Handlebars from 'handlebars'

import type { Context } from '../context'

// ---------------------------------------------------------------------------
// Extended preview context — superset of templates.ts PlayerVariableContext
// ---------------------------------------------------------------------------

export interface ExtendedPlayerContext {
  id: string

  // Identity
  email: string
  username: string | null
  displayName: string | null
  firstName: string | null
  lastName: string | null
  fullName: string
  phone: string | null

  // Geo
  state: string | null
  signupState: string | null
  country: string
  signupCountry: string | null

  // Compliance
  kycLevel: number
  marketingConsent: boolean
  smsConsent: boolean

  // Lifecycle
  registeredAt: string
  signupDateFriendly: string
  lastLoginAt: string | null
  lastLoginRelative: string
  firstPurchaseAt: string | null
  lastPurchaseAt: string | null

  // Financial — lifetime
  lifetimeSpendUsd: string
  lifetimeRedeemedUsd: string
  lifetimeNetPositionUsd: string
  lifetimePurchaseCount: number
  lifetimeRedemptionCount: number
  lifetimeBetCount: number
  lifetimeScWagered: string
  lifetimeScWon: string

  // Tier
  tierName: string
  tierLevel: number
  tierProgressPct: number

  // Balances
  balanceSc: string
  balanceGc: string
  balanceScPurchased: string
  balanceScBonus: string

  // Bonus
  activeBonusCount: number

  // CRM history
  unsubscribedEmail: boolean
}

export interface PreviewResult {
  rendered: string
  variablesFound: string[]
  variablesMissing: string[]
  warnings: string[]
  metrics: PreviewMetrics
}

export interface PreviewMetrics {
  /** Roughly the size of the rendered output, in bytes. */
  bytes: number
  /** SMS-only: 160-char segment count. */
  smsSegments?: number
  /** Email-only: 0-100. Higher = more spammy heuristically. */
  spamScore?: number
}

// ---------------------------------------------------------------------------
// Player fetch — parametric SQL using the same joins the compiler uses.
// ---------------------------------------------------------------------------

export async function fetchExtendedPlayerContext(
  ctx: Context,
  playerId: string,
): Promise<ExtendedPlayerContext | null> {
  const rows = await ctx.db.execute(sql`
    SELECT
      p.id,
      p.email,
      p.username,
      p.display_name AS "displayName",
      p.first_name AS "firstName",
      p.last_name AS "lastName",
      p.phone,
      p.state,
      p.signup_state AS "signupState",
      p.country,
      p.signup_country AS "signupCountry",
      p.kyc_level AS "kycLevel",
      p.email_consent AS "marketingConsent",
      p.sms_consent AS "smsConsent",
      p.created_at AS "registeredAt",
      p.last_login_at AS "lastLoginAt",
      pls.first_purchase_at AS "firstPurchaseAt",
      pls.last_purchase_at AS "lastPurchaseAt",
      coalesce(pls.total_deposited_usd, 0) AS "lifetimeSpendUsd",
      coalesce(pls.total_redeemed_usd, 0) AS "lifetimeRedeemedUsd",
      coalesce(pls.net_position_usd, 0) AS "lifetimeNetPositionUsd",
      coalesce(pls.purchase_count, 0) AS "lifetimePurchaseCount",
      coalesce(pls.redemption_count, 0) AS "lifetimeRedemptionCount",
      coalesce(pls.round_count, 0) AS "lifetimeBetCount",
      coalesce(pls.total_wagered_sc, 0) AS "lifetimeScWagered",
      coalesce(pls.total_won_sc, 0) AS "lifetimeScWon",
      coalesce(t.display_name, 'Bronze') AS "tierName",
      coalesce(tp.current_tier_level, 1) AS "tierLevel",
      tp.current_xp AS "currentXp",
      tp.xp_for_next_tier AS "xpForNext",
      coalesce(ws.current_balance, 0) AS "balanceSc",
      coalesce(wg.current_balance, 0) AS "balanceGc",
      coalesce(ws.balance_purchased, 0) AS "balanceScPurchased",
      coalesce(ws.balance_bonus, 0) AS "balanceScBonus",
      (SELECT COUNT(*) FROM bonuses_awarded ba WHERE ba.player_id = p.id AND ba.status = 'active') AS "activeBonusCount"
    FROM players p
    LEFT JOIN player_lifetime_stats pls ON pls.player_id = p.id
    LEFT JOIN tier_progress tp ON tp.player_id = p.id
    LEFT JOIN tiers t ON t.id = tp.current_tier_id
    LEFT JOIN wallets ws ON ws.player_id = p.id AND ws.currency = 'SC'
    LEFT JOIN wallets wg ON wg.player_id = p.id AND wg.currency = 'GC'
    WHERE p.id = ${playerId}
    LIMIT 1
  `)

  const row = (rows as unknown as Array<Record<string, unknown>>)[0]
  if (!row) return null

  const registeredAt = row.registeredAt as Date
  const lastLoginAt = row.lastLoginAt as Date | null
  const fullName =
    [row.firstName as string | null, row.lastName as string | null].filter(Boolean).join(' ') ||
    (row.displayName as string | null) ||
    (row.email as string)

  const tierProgressPct = computeTierProgressPct(row.currentXp, row.xpForNext)

  return {
    id: String(row.id),
    email: String(row.email ?? ''),
    username: (row.username as string | null) ?? null,
    displayName: (row.displayName as string | null) ?? null,
    firstName: (row.firstName as string | null) ?? null,
    lastName: (row.lastName as string | null) ?? null,
    fullName,
    phone: (row.phone as string | null) ?? null,
    state: (row.state as string | null) ?? null,
    signupState: (row.signupState as string | null) ?? null,
    country: String(row.country ?? 'US'),
    signupCountry: (row.signupCountry as string | null) ?? null,
    kycLevel: Number(row.kycLevel ?? 0),
    marketingConsent: Boolean(row.marketingConsent),
    smsConsent: Boolean(row.smsConsent),
    registeredAt: registeredAt instanceof Date ? registeredAt.toISOString() : String(registeredAt),
    signupDateFriendly: registeredAt instanceof Date ? formatFriendly(registeredAt) : '',
    lastLoginAt: lastLoginAt instanceof Date ? lastLoginAt.toISOString() : null,
    lastLoginRelative: lastLoginAt instanceof Date ? friendlyRelative(lastLoginAt) : 'never',
    firstPurchaseAt: row.firstPurchaseAt instanceof Date ? row.firstPurchaseAt.toISOString() : null,
    lastPurchaseAt: row.lastPurchaseAt instanceof Date ? row.lastPurchaseAt.toISOString() : null,
    lifetimeSpendUsd: formatMoney(row.lifetimeSpendUsd),
    lifetimeRedeemedUsd: formatMoney(row.lifetimeRedeemedUsd),
    lifetimeNetPositionUsd: formatMoney(row.lifetimeNetPositionUsd),
    lifetimePurchaseCount: Number(row.lifetimePurchaseCount ?? 0),
    lifetimeRedemptionCount: Number(row.lifetimeRedemptionCount ?? 0),
    lifetimeBetCount: Number(row.lifetimeBetCount ?? 0),
    lifetimeScWagered: formatMoney(row.lifetimeScWagered),
    lifetimeScWon: formatMoney(row.lifetimeScWon),
    tierName: String(row.tierName ?? 'Bronze'),
    tierLevel: Number(row.tierLevel ?? 1),
    tierProgressPct,
    balanceSc: formatMoney(row.balanceSc),
    balanceGc: formatMoney(row.balanceGc),
    balanceScPurchased: formatMoney(row.balanceScPurchased),
    balanceScBonus: formatMoney(row.balanceScBonus),
    activeBonusCount: Number(row.activeBonusCount ?? 0),
    unsubscribedEmail: !row.marketingConsent,
  }
}

// ---------------------------------------------------------------------------
// Variable extraction & rendering
// ---------------------------------------------------------------------------

// Note: a fresh RegExp each call avoids stale `lastIndex` from prior
// invocations leaking across calls.
function variableRegex(): RegExp {
  return /\{\{\s*([\w.]+)(?:\s*[|}][^}]*?)?\s*\}\}/g
}

export function extractVariables(template: string): string[] {
  const seen = new Set<string>()
  for (const m of template.matchAll(variableRegex())) {
    if (m[1]) seen.add(m[1])
  }
  return [...seen]
}

const handlebars = Handlebars.create()
handlebars.registerHelper('upper', (v: unknown) => String(v ?? '').toUpperCase())
handlebars.registerHelper('lower', (v: unknown) => String(v ?? '').toLowerCase())
handlebars.registerHelper('default', (v: unknown, fallback: unknown) =>
  v === null || v === undefined || v === '' ? fallback : v,
)

export interface PreviewOptions {
  channel: 'email' | 'sms' | 'in_app'
  /** When true, preserve raw HTML/Markdown — used for email html bodies. */
  noEscape?: boolean
}

export function renderPreview(
  template: string,
  player: ExtendedPlayerContext,
  options: PreviewOptions,
): PreviewResult {
  const root = {
    player,
    campaign: { ctaUrl: 'https://coinfrenzy.example/cta', promoCode: 'PREVIEW10' },
    unsubscribeUrl: 'https://coinfrenzy.example/unsubscribe?p=preview',
  }

  const variablesFound = extractVariables(template)
  const variablesMissing: string[] = []
  for (const v of variablesFound) {
    if (resolvePath(root, v) === undefined) variablesMissing.push(v)
  }

  let rendered: string
  try {
    const compiled = handlebars.compile(template, {
      noEscape: options.noEscape ?? options.channel !== 'email',
      strict: false,
    })
    rendered = compiled(root)
  } catch (e) {
    rendered = `${template}\n[render_error: ${e instanceof Error ? e.message : String(e)}]`
  }

  const warnings: string[] = []
  if (variablesMissing.length > 0) {
    warnings.push(
      `${variablesMissing.length} variable${variablesMissing.length === 1 ? '' : 's'} resolved to empty for this player`,
    )
  }
  if (options.channel === 'sms' && rendered.length > 160) {
    warnings.push(`SMS exceeds 160 chars (${rendered.length}) — will send as multiple segments`)
  }
  if (options.channel === 'email' && rendered.includes('http://')) {
    warnings.push('Email contains http:// link — use https:// to avoid spam scoring')
  }

  return {
    rendered,
    variablesFound,
    variablesMissing,
    warnings,
    metrics: computeMetrics(rendered, options.channel),
  }
}

function computeMetrics(rendered: string, channel: 'email' | 'sms' | 'in_app'): PreviewMetrics {
  const bytes = new TextEncoder().encode(rendered).length
  const m: PreviewMetrics = { bytes }
  if (channel === 'sms') {
    m.smsSegments = Math.max(1, Math.ceil(rendered.length / 160))
  }
  if (channel === 'email') {
    m.spamScore = computeSpamScore(rendered)
  }
  return m
}

const SPAM_KEYWORDS = [
  'free money',
  'winner',
  'click here',
  '$$$',
  'urgent',
  'guarantee',
  'cash bonus',
  'risk-free',
  'limited time',
  'act now',
  'verified',
  'no obligation',
]

/**
 * Quick-and-dirty heuristic — not a real spam classifier. Targets the
 * obvious tells: caps lock, exclamation density, well-known spam phrases.
 */
function computeSpamScore(html: string): number {
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length === 0) return 0

  let score = 0
  // Caps ratio (>30% caps tilts spammy).
  const letters = text.replace(/[^a-zA-Z]/g, '')
  if (letters.length > 0) {
    const upper = (letters.match(/[A-Z]/g) ?? []).length
    const ratio = upper / letters.length
    if (ratio > 0.3) score += Math.min(20, Math.round((ratio - 0.3) * 100))
  }
  // Exclamation density.
  const bangs = (text.match(/!/g) ?? []).length
  if (bangs > 5) score += Math.min(15, bangs - 5)
  // Spam keywords.
  const lower = text.toLowerCase()
  for (const kw of SPAM_KEYWORDS) if (lower.includes(kw)) score += 8
  // ALL-CAPS words.
  const allCaps = (text.match(/\b[A-Z]{4,}\b/g) ?? []).length
  if (allCaps > 0) score += Math.min(10, allCaps * 2)

  return Math.max(0, Math.min(100, score))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolvePath(root: unknown, path: string): unknown {
  const parts = path.split('.')
  // REASON: walking arbitrary JSON; the `unknown` chain is intentional.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cursor: any = root
  for (const p of parts) {
    if (cursor == null || typeof cursor !== 'object') return undefined
    cursor = cursor[p]
  }
  return cursor
}

function formatMoney(raw: unknown): string {
  if (raw === null || raw === undefined) return '0.00'
  const n = typeof raw === 'string' ? Number(raw) : Number(raw)
  if (!Number.isFinite(n)) return '0.00'
  return n.toFixed(2)
}

function computeTierProgressPct(current: unknown, target: unknown): number {
  const c = typeof current === 'string' ? Number(current) : Number(current)
  const t = typeof target === 'string' ? Number(target) : Number(target)
  if (!Number.isFinite(c) || !Number.isFinite(t) || t <= 0) return 0
  return Math.min(100, Math.round((c / t) * 100))
}

function friendlyRelative(date: Date): string {
  const ms = Date.now() - date.getTime()
  const days = Math.floor(ms / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 14) return 'last week'
  if (days < 30) return `${Math.round(days / 7)} weeks ago`
  if (days < 365) return `${Math.round(days / 30)} months ago`
  return `${Math.round(days / 365)} years ago`
}

function formatFriendly(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

// ---------------------------------------------------------------------------
// Template variable catalog — surfaced in the variable picker UI.
// ---------------------------------------------------------------------------

export interface TemplateVariable {
  key: string
  label: string
  category: 'identity' | 'tier' | 'balance' | 'lifecycle' | 'campaign'
  example: string
}

export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  { key: 'player.email', label: 'Email', category: 'identity', example: 'jane@example.com' },
  { key: 'player.username', label: 'Username', category: 'identity', example: 'jane99' },
  { key: 'player.displayName', label: 'Display name', category: 'identity', example: 'Jane' },
  { key: 'player.firstName', label: 'First name', category: 'identity', example: 'Jane' },
  { key: 'player.lastName', label: 'Last name', category: 'identity', example: 'Doe' },
  { key: 'player.fullName', label: 'Full name', category: 'identity', example: 'Jane Doe' },
  { key: 'player.tierName', label: 'Tier name', category: 'tier', example: 'Gold' },
  { key: 'player.tierLevel', label: 'Tier level', category: 'tier', example: '4' },
  {
    key: 'player.tierProgressPct',
    label: 'Tier progress %',
    category: 'tier',
    example: '67',
  },
  { key: 'player.balanceSc', label: 'SC balance', category: 'balance', example: '125.40' },
  { key: 'player.balanceGc', label: 'GC balance', category: 'balance', example: '2,400.00' },
  {
    key: 'player.lastLoginRelative',
    label: 'Last login (relative)',
    category: 'lifecycle',
    example: '3 days ago',
  },
  {
    key: 'player.signupDateFriendly',
    label: 'Signup date',
    category: 'lifecycle',
    example: 'January 15, 2026',
  },
  {
    key: 'player.lifetimeSpendUsd',
    label: 'Lifetime spend',
    category: 'lifecycle',
    example: '247.50',
  },
  {
    key: 'campaign.ctaUrl',
    label: 'CTA URL',
    category: 'campaign',
    example: 'https://coinfrenzy.example/cta',
  },
  {
    key: 'campaign.promoCode',
    label: 'Promo code',
    category: 'campaign',
    example: 'WELCOME10',
  },
  {
    key: 'unsubscribeUrl',
    label: 'Unsubscribe URL',
    category: 'campaign',
    example: 'https://coinfrenzy.example/unsubscribe',
  },
]
