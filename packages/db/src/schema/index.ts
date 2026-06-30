// Barrel file: re-exports every table and enum so drizzle-kit and the app
// can import them all from one place. Order matches docs/03 §17 sections.

export * from './_shared'

// §2 — Players, wallets, KYC, compliance, geo
export * from './players'
export * from './kyc'
export * from './compliance'
export * from './geo'

// §2b — Player auth (Better Auth) + RG limit-change queue.
export * from './auth'

// §3 — House accounts, ledger, admin adjustments
export * from './house-accounts'
export * from './ledger'
export * from './admin-adjustments'

// §4 — Games
export * from './games'
export * from './casino-categories'

// §5 — Tiers, packages, bonuses, promo codes
export * from './tiers'
export * from './packages'
export * from './bonuses'
export * from './promo-codes'

// §6 — Affiliates
export * from './affiliates'

// §7 — Purchases, payment instruments, redemptions
export * from './purchases'
export * from './payment-instruments'
export * from './redemptions'
export * from './redemption-rules'

// §8 — Events & stats
export * from './events'
export * from './stats'

// §9 — CRM
export * from './crm'

// §10 — Admin, sessions, audit
export * from './admin'
export * from './audit'

// M4 — VIP / Host system (host_player_interactions etc.)
export * from './vip'

// §11 — CMS, templates, notifications
export * from './cms'

// §12 — Blocklists
export * from './blocklists'

// §13 — Integration health, webhooks, AML
export * from './integration-health'
export * from './webhooks'

// §14 — Snapshots, exports
export * from './snapshots'
export * from './exports'

// §15 — Migration, tax
export * from './migration'

// Cross-cutting runtime configuration (tier safety caps, future
// operator-tunable limits).
export * from './system-config'
