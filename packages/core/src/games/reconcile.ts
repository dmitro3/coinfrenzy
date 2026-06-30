// docs/04 §7.2 — nightly Alea round reconciliation.
//
// Pulls the authoritative round list from Alea for a [from, to] window,
// pulls our local game_rounds for the same window, and diffs them.
// Discrepancies are written to alea_reconciliation_findings with one of:
//   - missing_from_ours    Alea has it; we don't (most common — webhook lost)
//   - missing_from_alea    We have it; Alea doesn't (very rare — bug)
//   - amount_mismatch      Both sides; different bet/win amounts
//   - currency_mismatch    Same round, different currency (impossible if healthy)
//   - status_mismatch      Same round, different status
//
// Severity defaults to 'warn' for missing_from_ours (we replay the
// missing rounds via the webhook handlers in a follow-up step) and
// 'critical' for anything else (page on-call). The cron job that wraps
// this function is responsible for the PagerDuty integration.
//
// Idempotency: each finding row carries (run_started_at, external_round_id);
// re-running the reconcile against the same window won't dedupe per-row,
// but the run_started_at lets the operator distinguish runs. Old findings
// are not deleted — admins resolve them in the UI.

import { and, between, eq } from 'drizzle-orm'

import { type DbExecutor, schema } from '@coinfrenzy/db'

import type { Context } from '../context'
import { writeAuditEntry } from '../audit/index'
import { getAleaClient } from '../adapters/alea/index'
import type { AleaRoundSummary } from '../adapters/alea/types'

import { formatMoney, numericStringToBigint } from '../ledger/money'

export interface ReconcileAleaInput {
  ctx: Context
  /** Inclusive lower bound. */
  from: Date
  /** Exclusive upper bound. */
  to: Date
  /** Currency filter (defaults to both). */
  currency?: 'GC' | 'SC'
  /** Optional sample cap; production runs leave undefined. */
  limit?: number
  /** When true, computes findings but doesn't insert rows. */
  dryRun?: boolean
}

export interface ReconcileAleaResult {
  runStartedAt: string
  windowStartAt: string
  windowEndAt: string
  aleaRoundCount: number
  oursRoundCount: number
  matched: number
  missingFromOurs: number
  missingFromAlea: number
  amountMismatch: number
  currencyMismatch: number
  statusMismatch: number
  critical: number
}

export async function reconcileAleaRounds(input: ReconcileAleaInput): Promise<ReconcileAleaResult> {
  const runStartedAt = new Date()
  const { ctx } = input
  const alea = getAleaClient()

  const aleaRounds = await alea.listRounds({
    from: input.from,
    to: input.to,
    currency: input.currency,
    limit: input.limit,
  })

  const ours = await loadOurRounds(ctx.db, input.from, input.to, input.currency)

  const aleaIndex = new Map<string, AleaRoundSummary>()
  for (const r of aleaRounds) aleaIndex.set(r.externalRoundId, r)

  const oursIndex = new Map<string, OurRoundRow>()
  for (const r of ours) oursIndex.set(r.externalRoundId, r)

  const findings: PendingFinding[] = []
  let matched = 0
  let missingFromOurs = 0
  let missingFromAlea = 0
  let amountMismatch = 0
  let currencyMismatch = 0
  let statusMismatch = 0

  for (const [roundId, aleaRound] of aleaIndex) {
    const ourRound = oursIndex.get(roundId)
    if (!ourRound) {
      missingFromOurs++
      findings.push({
        externalRoundId: roundId,
        kind: 'missing_from_ours',
        severity: 'warn',
        aleaBet: formatMoney(aleaRound.betAmountMinor),
        aleaWin: formatMoney(aleaRound.winAmountMinor),
        oursBet: null,
        oursWin: null,
        currency: aleaRound.currency,
        playerId: aleaRound.playerId,
        gameId: null,
        detail: {
          casinoSessionId: aleaRound.casinoSessionId,
          externalGameId: aleaRound.externalGameId,
          status: aleaRound.status,
          betAt: aleaRound.betAt.toISOString(),
          wonAt: aleaRound.wonAt?.toISOString() ?? null,
        },
      })
      continue
    }

    let isMismatch = false
    let kind: PendingFinding['kind'] = 'amount_mismatch'
    let severity: PendingFinding['severity'] = 'critical'

    if (aleaRound.currency !== ourRound.currency) {
      isMismatch = true
      kind = 'currency_mismatch'
      currencyMismatch++
    } else if (
      aleaRound.betAmountMinor !== ourRound.betAmountMinor ||
      aleaRound.winAmountMinor !== ourRound.winAmountMinor
    ) {
      isMismatch = true
      kind = 'amount_mismatch'
      amountMismatch++
    } else if (aleaRound.status !== ourRound.status) {
      isMismatch = true
      kind = 'status_mismatch'
      severity = 'warn'
      statusMismatch++
    }

    if (isMismatch) {
      findings.push({
        externalRoundId: roundId,
        kind,
        severity,
        aleaBet: formatMoney(aleaRound.betAmountMinor),
        aleaWin: formatMoney(aleaRound.winAmountMinor),
        oursBet: formatMoney(ourRound.betAmountMinor),
        oursWin: formatMoney(ourRound.winAmountMinor),
        currency: aleaRound.currency,
        playerId: ourRound.playerId,
        gameId: ourRound.gameId,
        detail: {
          casinoSessionId: aleaRound.casinoSessionId,
          externalGameId: aleaRound.externalGameId,
          aleaStatus: aleaRound.status,
          ourStatus: ourRound.status,
        },
      })
    } else {
      matched++
    }
  }

  for (const [roundId, ourRound] of oursIndex) {
    if (aleaIndex.has(roundId)) continue
    missingFromAlea++
    findings.push({
      externalRoundId: roundId,
      kind: 'missing_from_alea',
      severity: 'critical',
      aleaBet: null,
      aleaWin: null,
      oursBet: formatMoney(ourRound.betAmountMinor),
      oursWin: formatMoney(ourRound.winAmountMinor),
      currency: ourRound.currency,
      playerId: ourRound.playerId,
      gameId: ourRound.gameId,
      detail: {
        status: ourRound.status,
        betAt: ourRound.betAt.toISOString(),
        wonAt: ourRound.wonAt?.toISOString() ?? null,
      },
    })
  }

  if (!input.dryRun && findings.length > 0) {
    await ctx.db.insert(schema.aleaReconciliationFindings).values(
      findings.map((f) => ({
        runStartedAt,
        windowStartAt: input.from,
        windowEndAt: input.to,
        externalRoundId: f.externalRoundId,
        kind: f.kind,
        severity: f.severity,
        aleaBet: f.aleaBet ? numericStringToBigint(f.aleaBet) : null,
        aleaWin: f.aleaWin ? numericStringToBigint(f.aleaWin) : null,
        oursBet: f.oursBet ? numericStringToBigint(f.oursBet) : null,
        oursWin: f.oursWin ? numericStringToBigint(f.oursWin) : null,
        currency: f.currency,
        playerId: f.playerId,
        gameId: f.gameId,
        status: 'open',
        detail: f.detail,
      })),
    )
  }

  const critical = findings.filter((f) => f.severity === 'critical').length

  const result: ReconcileAleaResult = {
    runStartedAt: runStartedAt.toISOString(),
    windowStartAt: input.from.toISOString(),
    windowEndAt: input.to.toISOString(),
    aleaRoundCount: aleaIndex.size,
    oursRoundCount: oursIndex.size,
    matched,
    missingFromOurs,
    missingFromAlea,
    amountMismatch,
    currencyMismatch,
    statusMismatch,
    critical,
  }

  await writeAuditEntry(ctx.db, {
    actorKind: ctx.actor.kind === 'admin' ? 'admin' : 'system',
    action: 'alea.reconciliation.completed',
    resourceKind: 'alea_reconciliation_run',
    resourceId: null,
    metadata: { ...result, dryRun: input.dryRun ?? false },
  })

  return result
}

interface PendingFinding {
  externalRoundId: string
  kind:
    | 'missing_from_ours'
    | 'missing_from_alea'
    | 'amount_mismatch'
    | 'currency_mismatch'
    | 'status_mismatch'
  severity: 'info' | 'warn' | 'critical'
  aleaBet: string | null
  aleaWin: string | null
  oursBet: string | null
  oursWin: string | null
  currency: 'GC' | 'SC' | null
  playerId: string | null
  gameId: string | null
  detail: Record<string, unknown>
}

interface OurRoundRow {
  externalRoundId: string
  playerId: string
  gameId: string
  betAmountMinor: bigint
  winAmountMinor: bigint
  currency: 'GC' | 'SC'
  status: 'bet_placed' | 'resolved' | 'refunded'
  betAt: Date
  wonAt: Date | null
}

async function loadOurRounds(
  db: DbExecutor,
  from: Date,
  to: Date,
  currency?: 'GC' | 'SC',
): Promise<OurRoundRow[]> {
  const where = currency
    ? and(between(schema.gameRounds.betAt, from, to), eq(schema.gameRounds.currency, currency))
    : between(schema.gameRounds.betAt, from, to)
  const rows = await db
    .select({
      externalRoundId: schema.gameRounds.externalRoundId,
      playerId: schema.gameRounds.playerId,
      gameId: schema.gameRounds.gameId,
      betAmount: schema.gameRounds.betAmount,
      winAmount: schema.gameRounds.winAmount,
      currency: schema.gameRounds.currency,
      status: schema.gameRounds.status,
      betAt: schema.gameRounds.betAt,
      wonAt: schema.gameRounds.wonAt,
    })
    .from(schema.gameRounds)
    .where(where)
  return rows.map((r) => ({
    externalRoundId: r.externalRoundId,
    playerId: r.playerId,
    gameId: r.gameId,
    betAmountMinor: r.betAmount,
    winAmountMinor: r.winAmount,
    currency: r.currency as 'GC' | 'SC',
    status: r.status as 'bet_placed' | 'resolved' | 'refunded',
    betAt: r.betAt,
    wonAt: r.wonAt,
  }))
}
