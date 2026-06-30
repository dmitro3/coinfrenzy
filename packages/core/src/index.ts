// Barrel — the single import surface for @coinfrenzy/core.
// Per docs/02 §4, only the package root is imported by consumers.

export * as ledger from './ledger/index'
export * as bonus from './bonus/index'
export * as redemption from './redemption/index'
export * as kyc from './kyc/index'
export * as crm from './crm/index'
export * as webhooks from './webhooks/index'
export * as events from './events/index'
export * as auth from './auth/index'
export * as audit from './audit/index'
export * as compliance from './compliance/index'
export * as migration from './migration/index'
export * as adapters from './adapters/index'
export * as realtime from './realtime/index'
export * as games from './games/index'
export * as favorites from './favorites/index'
export * as casino from './casino/index'
export * as cashier from './cashier/index'
export * as reports from './reports/index'
export * as vip from './vip/index'
export * as packages from './packages/index'
export * as tiers from './tiers/index'
export * as cms from './cms/index'
export * as emailCenter from './email/index'
export * as notificationCenter from './notifications/index'
export * as system from './system/index'
export * as legal from './legal/index'

// Cross-cutting constants that the player surface imports directly.
export { US_STATES, BLOCKED_STATES, isBlockedState } from './compliance/index'

// Cross-cutting primitives — Result/Context/Actor/Logger live at the package
// root so consumers don't have to deep-import. Per docs/02 §4-§5.
export { ok, err, isOk, isErr, mapResult, unwrap, type Result } from './errors/result'

export {
  type Context,
  type Actor,
  type AdminRole,
  type AfterCommitHook,
  type AfterCommitQueue,
  type InngestSender,
  createAfterCommitQueue,
  actorIdFor,
  actorKindFor,
  actorRoleFor,
} from './context'

export { type Logger, type LogFields, type LogLevel, consoleLogger, noopLogger } from './logger'
