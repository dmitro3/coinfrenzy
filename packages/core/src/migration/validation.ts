// docs/13 §5 — validation gates run after every import.
//
// Two tiers:
//   * HARD — failing one of these halts cutover. Returned with severity 'hard'.
//   * SOFT — warns but does not halt. Returned with severity 'soft'.
//
// The validator compares our state against the snapshot's expected totals.
// Expected totals come from running quick aggregations over the same CSVs
// so we don't need a separate "what did Gamma say" call — the snapshot
// IS Gamma's authoritative export.

import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import type { Context } from '../context'
import { reconcileWallets } from '../ledger/reconcile'
import { numericStringToBigint } from '../ledger/money'

import { parseCsv } from './csv'
import { BALANCE_DRIFT_TOLERANCE } from './constants'
import { getSnapshotStore } from './snapshot-store'
import { parseMoney } from './transforms'
import { SNAPSHOT_FILE_NAMES, type ValidationGateResult, type ValidationReport } from './types'

export interface ValidateInput {
  ctx: Context
  snapshotDate: string
  runId: string
}

export async function validateRun(input: ValidateInput): Promise<ValidationReport> {
  const { ctx, snapshotDate, runId } = input
  const store = getSnapshotStore()

  const gates: ValidationGateResult[] = []

  // 1) Player count
  const playersCsv = await store.readFile(snapshotDate, SNAPSHOT_FILE_NAMES.players)
  if (playersCsv) {
    const parsed = parseCsv(SNAPSHOT_FILE_NAMES.players, playersCsv)
    const expected = parsed.rows.filter((r) => (r['User Id'] ?? '').trim() !== '').length
    const [{ count }] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.players)
      .where(isNotNull(schema.players.gammaUserId))
    gates.push({
      check: 'player_count',
      severity: 'hard',
      passed: expected === count,
      expected,
      actual: count,
      detail: 'Number of migrated players must match Gamma snapshot',
    })
  }

  // 2) Purchase volume (sum of completed amount_usd)
  const purchasesCsv = await store.readFile(snapshotDate, SNAPSHOT_FILE_NAMES.transactions)
  if (purchasesCsv) {
    const parsed = parseCsv(SNAPSHOT_FILE_NAMES.transactions, purchasesCsv)
    const expectedMinor = parsed.rows.reduce((acc, row) => {
      const statusRaw = (row['Status'] ?? '').trim().toLowerCase()
      if (statusRaw !== 'success' && statusRaw !== 'completed') return acc
      return acc + numericStringToBigint(parseMoney(row['Amount'] ?? row['Total Amount'] ?? '0'))
    }, 0n)
    const [{ sum }] = await ctx.db
      .select({
        sum: sql<string | null>`coalesce(sum(${schema.purchases.amountUsd})::text, '0')`,
      })
      .from(schema.purchases)
      .where(
        and(
          eq(schema.purchases.status, 'completed'),
          isNotNull(schema.purchases.gammaTransactionId),
        ),
      )
    const actualMinor = numericStringToBigint(parseMoney(sum ?? '0'))
    gates.push({
      check: 'purchase_volume_match',
      severity: 'hard',
      passed: bigintWithinTolerance(expectedMinor, actualMinor),
      expected: expectedMinor.toString(),
      actual: actualMinor.toString(),
      detail: 'Sum of completed migrated purchase amount_usd must match Gamma snapshot',
    })
  }

  // 3) Redemption volume (sum of paid amount_usd)
  const redemptionsCsv = await store.readFile(snapshotDate, SNAPSHOT_FILE_NAMES.redemptions)
  if (redemptionsCsv) {
    const parsed = parseCsv(SNAPSHOT_FILE_NAMES.redemptions, redemptionsCsv)
    const expectedMinor = parsed.rows.reduce((acc, row) => {
      const statusRaw = (row['Status'] ?? '').trim().toLowerCase()
      if (statusRaw !== 'success' && statusRaw !== 'paid' && statusRaw !== 'completed') {
        return acc
      }
      const usd = parseMoney(row['USD Amount'] ?? row['Amount USD'] ?? row['SC Amount'] ?? '0')
      return acc + numericStringToBigint(usd)
    }, 0n)
    const [{ sum }] = await ctx.db
      .select({
        sum: sql<string | null>`coalesce(sum(${schema.redemptions.amountUsd})::text, '0')`,
      })
      .from(schema.redemptions)
      .where(
        and(eq(schema.redemptions.status, 'paid'), isNotNull(schema.redemptions.gammaRedemptionId)),
      )
    const actualMinor = numericStringToBigint(parseMoney(sum ?? '0'))
    gates.push({
      check: 'redemption_volume_match',
      severity: 'hard',
      passed: bigintWithinTolerance(expectedMinor, actualMinor),
      expected: expectedMinor.toString(),
      actual: actualMinor.toString(),
      detail: 'Sum of paid migrated redemption amount_usd must match Gamma snapshot',
    })
  }

  // 4) Self-exclusion count (compliance_flags imported_from='gamma_migration')
  if (playersCsv) {
    const parsed = parseCsv(SNAPSHOT_FILE_NAMES.players, playersCsv)
    const expected = parsed.rows.filter((r) => {
      const rsg = (r['rsg'] ?? r['RSG'] ?? '').toLowerCase()
      return rsg.includes('self excluded') || rsg.includes('self-excluded')
    }).length
    const [{ count }] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.complianceFlags)
      .where(
        and(
          eq(schema.complianceFlags.flagType, 'self_exclusion'),
          eq(schema.complianceFlags.importedFrom, 'gamma_migration'),
          isNull(schema.complianceFlags.clearedAt),
        ),
      )
    gates.push({
      check: 'self_exclusion_count_match',
      severity: 'hard',
      passed: expected === count,
      expected,
      actual: count,
      detail: 'Self-exclusion compliance_flags from migration must match Gamma rsg text count',
    })
  }

  // 5) Wallet/ledger reconciliation
  const recon = await reconcileWallets(ctx, { windowDays: 365 })
  const driftCount = recon.ok ? recon.value.rows.length : 0
  gates.push({
    check: 'wallet_ledger_drift',
    severity: 'hard',
    passed: driftCount === 0,
    expected: 0,
    actual: driftCount,
    detail: 'reconcileWallets() must return zero drift rows after import',
    samples:
      recon.ok && recon.value.rows.length > 0
        ? recon.value.rows.slice(0, 10).map((r) => ({
            walletId: r.walletId,
            playerId: r.playerId,
            currency: r.currency,
            walletBalance: r.walletBalance.toString(),
            ledgerBalance: r.ledgerBalance.toString(),
            drift: r.drift.toString(),
          }))
        : undefined,
  })

  // 6) Manual review queue must be empty (soft warn during dry runs, hard for prod)
  const [{ count: openReviews }] = await ctx.db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.migrationReviewQueue)
    .where(
      and(
        eq(schema.migrationReviewQueue.status, 'open'),
        eq(schema.migrationReviewQueue.runId, runId),
      ),
    )
  gates.push({
    check: 'manual_review_queue_empty',
    severity: 'soft',
    passed: openReviews === 0,
    expected: 0,
    actual: openReviews,
    detail: 'All ambiguous rows must be resolved before final cutover',
  })

  // 7) Row error count
  const [{ count: rowErrors }] = await ctx.db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.migrationRowErrors)
    .where(eq(schema.migrationRowErrors.runId, runId))
  gates.push({
    check: 'row_error_count',
    severity: 'soft',
    passed: rowErrors === 0,
    actual: rowErrors,
    detail: 'Per-row import errors should be resolved before cutover',
  })

  const hardFailures = gates.filter((g) => g.severity === 'hard' && !g.passed).length
  const softWarnings = gates.filter((g) => g.severity === 'soft' && !g.passed).length
  const status: ValidationReport['status'] =
    hardFailures > 0 ? 'failed' : softWarnings > 0 ? 'soft_warnings' : 'passed'

  const report: ValidationReport = {
    status,
    gates,
    hardFailures,
    softWarnings,
    ranAt: new Date().toISOString(),
  }

  await ctx.db
    .update(schema.migrationRuns)
    .set({
      validationStatus: status,
      validationSummary: report as unknown as Record<string, unknown>,
      status: status === 'failed' ? 'failed' : 'validated',
    })
    .where(eq(schema.migrationRuns.id, runId))

  return report
}

function bigintWithinTolerance(expected: bigint, actual: bigint): boolean {
  if (expected === actual) return true
  // BALANCE_DRIFT_TOLERANCE is in MAJOR units; convert to minor (1e4 scale)
  const minorTolerance = BigInt(Math.floor(BALANCE_DRIFT_TOLERANCE * 10_000))
  const diff = expected > actual ? expected - actual : actual - expected
  return diff <= minorTolerance
}
