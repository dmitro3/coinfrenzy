import { sql } from 'drizzle-orm'
import { customType, jsonb, pgEnum, timestamp } from 'drizzle-orm/pg-core'

// Shared helpers used by every schema file. Per docs/03 §1, every mutable
// table has timestamptz created_at / updated_at; money columns are
// numeric(20,4) typed as bigint at the app layer.

export const createdAt = () =>
  timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()

export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()

export const deletedAt = () => timestamp('deleted_at', { withTimezone: true, mode: 'date' })

export const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })

// Money minor-unit scale. 1 major unit = 10_000 minor units (matches the
// numeric(20,4) DB scale). The app layer always uses bigint in minor units;
// the DB stores numeric(20,4); this customType bridges the two.
const MONEY_SCALE = 10_000n

function moneyBigintToString(value: bigint): string {
  const negative = value < 0n
  const abs = negative ? -value : value
  const major = abs / MONEY_SCALE
  const minor = abs % MONEY_SCALE
  return `${negative ? '-' : ''}${major}.${minor.toString().padStart(4, '0')}`
}

function moneyStringToBigint(value: string): bigint {
  const negative = value.startsWith('-')
  const abs = negative ? value.slice(1) : value
  const [majorStr, minorStr = ''] = abs.split('.')
  const major = BigInt(majorStr)
  const minorPadded = minorStr.padEnd(4, '0').slice(0, 4)
  const minor = BigInt(minorPadded)
  const total = major * MONEY_SCALE + minor
  return negative ? -total : total
}

/**
 * Money column. Stored as numeric(20,4); typed as bigint (minor units) at
 * the application boundary per docs/02 §4 and docs/03 §1. Drizzle calls
 * `toDriver` on writes and `fromDriver` on reads so the conversion is
 * transparent to consumers.
 */
export const money = customType<{ data: bigint; driverData: string }>({
  dataType() {
    return 'numeric(20, 4)'
  },
  toDriver(value: bigint): string {
    return moneyBigintToString(value)
  },
  fromDriver(value: string): bigint {
    return moneyStringToBigint(value)
  },
})

/** Empty jsonb default. */
export const emptyJsonbDefault = sql`'{}'::jsonb`

/** Empty array jsonb default. */
export const emptyJsonArrayDefault = sql`'[]'::jsonb`

export const json = jsonb

// Shared enums used across multiple tables.

export const playerStatus = pgEnum('player_status', [
  'active',
  'suspended',
  'self_excluded',
  'closed',
  'internal',
  'restricted',
])

export const bonusType = pgEnum('bonus_type', [
  'welcome',
  'tier_up',
  'weekly_tier',
  'monthly_tier',
  'package',
  'daily',
  'jackpot',
  'referral',
  'affiliate',
  'promotion',
  'amoe',
  'admin_added_sc',
  'crm_promocode',
  'purchase_promocode',
])

export const ledgerLeg = pgEnum('ledger_leg', ['debit', 'credit'])

export const ledgerSource = pgEnum('ledger_source', [
  'purchase',
  'bet',
  'win',
  'bonus_award',
  'playthrough_release',
  'redemption_request',
  'redemption_paid',
  'redemption_rejected',
  'purchase_refund',
  'admin_adjustment',
  'affiliate_payout',
  'bonus_expired',
  'migration',
])

export const ledgerAccountKind = pgEnum('ledger_account_kind', [
  'player_wallet',
  'pending_purchase',
  'pending_redemption',
  'house_bank',
  'house_winnings_gc',
  'house_winnings_sc',
  'bonus_pool_gc',
  'bonus_pool_sc',
  'amoe_pool_sc',
  'affiliate_payable',
  'internal_account_sink',
  'external',
])
