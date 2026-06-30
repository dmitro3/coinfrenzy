// docs/13 — shared constants for the Gamma migration pipeline.
//
// Anything that needs to be referenced from BOTH the SQL migration that
// seeds the row and the runtime importer lives here so the two stay in
// lock-step. If you change the singleton UUID below, also change the
// matching INSERT in packages/db/src/migrations/0021_migration_pipeline.sql.

/**
 * The fixed UUID of the singleton bonuses row that synthetic migration
 * awards point at. Seeded by 0021_migration_pipeline.sql. Status is
 * 'inactive' so no normal codepath can re-award it.
 */
export const MIGRATION_BALANCE_BONUS_ID = '13130000-0000-4000-8000-000000000001'

/**
 * Source-file convention — every file produced by Gamma's admin export
 * lands under `gamma-snapshots/YYYY-MM-DD/<filename>` in R2.
 */
export const SNAPSHOT_PREFIX = 'gamma-snapshots'

export const KNOWN_SOURCE_FILES = [
  'players_data.csv',
  'purchase_report.csv',
  'redeem_requests_data.csv',
  'transactions_banking_data.csv',
  'merv_report.csv',
  'affiliate_report.csv',
] as const

export type GammaSourceFile = (typeof KNOWN_SOURCE_FILES)[number]

/**
 * Hard ceilings for any per-run state — the importer refuses to
 * proceed if any of these would be exceeded. Acts as a defense
 * against accidentally running an unbounded import on prod.
 */
export const IMPORT_CEILINGS = {
  /** Refuse to start if Gamma's player CSV is unexpectedly empty. */
  minPlayersExpected: 100,
  /** Refuse to proceed if the player CSV exceeds this size (rows). */
  maxPlayersExpected: 500_000,
  /** Refuse to write more synthetic migration awards than this. */
  maxSyntheticAwards: 500_000,
} as const

/**
 * Drift tolerance for the SC balance match check, in MAJOR units.
 * docs/13 §5.1 specifies < 0.0001; we mirror that exactly.
 */
export const BALANCE_DRIFT_TOLERANCE = 0.0001
