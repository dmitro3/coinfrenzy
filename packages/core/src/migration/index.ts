// docs/13 — Gamma migration pipeline.
//
// Public surface for the migration module. The pipeline is structured
// as a set of small, idempotent, individually-testable functions; the
// `startRun` orchestrator is the convenience entry point but every
// step can be re-run on its own (useful when the player import succeeds
// but redemptions fail and you want to retry just that step).

export * from './types'
export * from './constants'

export { parseCsv, CsvParseError } from './csv'
export {
  TRANSFORMS,
  applyTransform,
  asIs,
  alwaysNull,
  dashToNull,
  lower,
  parseDatetime,
  parseDisabled,
  parseMethod,
  parseMoney,
  parseStatus,
  parseStatusKnown,
  parseFreetextRsg,
} from './transforms'
export { parseRsgFreetext } from './transforms-rsg'
export type { RsgParseResult } from './transforms-rsg'

export { getSnapshotStore, MemorySnapshotStore, type SnapshotStore } from './snapshot-store'

export { startRun, type StartRunInput, type RunOutcome } from './run'

export { importPlayers } from './import-players'
export { importAffiliates } from './import-affiliates'
export { importPurchases } from './import-purchases'
export { importRedemptions } from './import-redemptions'
export { importDailyKpis } from './import-daily-kpis'

export { validateRun, type ValidateInput } from './validation'
export { replayCapturedWebhooks, type ReplayInput } from './replay-webhooks'
export {
  compareBalances,
  type BalanceCompareInput,
  type BalanceCompareResult,
  type BalanceCompareRow,
} from './balance-compare'
export {
  getDualCaptureConfig,
  setDualCaptureConfig,
  shouldSuppressDispatch,
  type DualCaptureConfig,
  type DualCaptureProvider,
} from './dual-capture'
