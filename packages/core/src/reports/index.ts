// docs/12 — reporting / dashboards / exports.
// Barrel for the reporting helpers used by the worker, the admin dashboard,
// and the report API routes.

export {
  computeDashboardCounters,
  emptyCounters,
  type DashboardCounters,
  type CounterRange,
} from './dashboard-counters'

export {
  computeMonetizationBreakdown,
  emptyMonetizationBreakdown,
  SPENDER_TIERS,
  type MonetizationBreakdown,
  type SpenderTier,
} from './monetization-breakdown'

export {
  aggregateSnapshotsForDate,
  isoDate,
  yesterday,
  today,
  type AggregateSnapshotsOptions,
  type AggregateSnapshotsResult,
} from './aggregations'

export {
  compileCustomQuery,
  runCustomQuery,
  type AllowedTable,
  type Operator,
  type Aggregate,
  type AggregateColumn,
  type QueryCondition,
  type QuerySpec,
  type CompiledQuery,
  type RunCustomQueryResult,
  type CustomQueryError,
} from './custom-query'

export {
  createExportRequest,
  buildPrebuiltExport,
  rowToCsvCells,
  escapeCsvCell,
  SNAPSHOT_EXPORT_TYPES,
  type ExportType,
  type ExportFilter,
  type CreateExportInput,
  type CreateExportError,
  type ExportRowDescriptor,
} from './exports'

export {
  createReportSubscription,
  fetchDueSubscriptions,
  markSubscriptionSent,
  disableSubscription,
  deferSubscription,
  estimateNextDue,
  type CreateSubscriptionInput,
  type DueSubscription,
  type ReportKind,
} from './scheduled-reports'
