/* eslint-disable no-console */
/**
 * docs/13 §5.1 + §7.4 — balance comparison CLI.
 *
 * Compares CoinFrenzy SC balances against a Gamma snapshot CSV. Used:
 *   - During pre-cutover dry runs to gate go/no-go decisions.
 *   - On cutover night, immediately after the final import, to verify
 *     player balances match Gamma's last-known state.
 *
 * Usage:
 *   pnpm cutover:balance-compare <snapshotDate> [--drift-only] [--limit=N] [--json]
 *
 * Example:
 *   pnpm cutover:balance-compare 2026-06-15 --drift-only --limit=50
 *
 * Exit codes:
 *   0  All players in sample matched.
 *   1  One or more drifts found.
 *   2  Invalid input / runtime error.
 */

import { closeDb, getDb } from '@coinfrenzy/db'
import {
  consoleLogger as logger,
  createAfterCommitQueue,
  migration,
  type Context,
} from '@coinfrenzy/core'

interface Args {
  snapshotDate: string
  driftOnly: boolean
  limit?: number
  json: boolean
}

function parseArgs(argv: string[]): Args {
  const positional = argv.filter((a) => !a.startsWith('--'))
  const flags = argv.filter((a) => a.startsWith('--'))
  const snapshotDate = positional[0]
  if (!snapshotDate || !/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) {
    console.error('ERROR: first positional arg must be a snapshot date (YYYY-MM-DD).')
    console.error(
      'Usage: pnpm cutover:balance-compare <YYYY-MM-DD> [--drift-only] [--limit=N] [--json]',
    )
    process.exit(2)
  }
  const driftOnly = flags.includes('--drift-only')
  const json = flags.includes('--json')
  const limitFlag = flags.find((f) => f.startsWith('--limit='))
  const limit = limitFlag ? Number(limitFlag.slice('--limit='.length)) : undefined
  if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0)) {
    console.error('ERROR: --limit must be a positive integer.')
    process.exit(2)
  }
  return { snapshotDate, driftOnly, limit, json }
}

function buildSystemCtx(): Context {
  const queue = createAfterCommitQueue(logger)
  return {
    db: getDb(),
    logger,
    actor: { kind: 'system', service: 'script', source: 'balance-compare' },
    reqId: `balance-compare-${Date.now()}`,
    afterCommit: queue.push,
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const ctx = buildSystemCtx()
  try {
    const result = await migration.compareBalances({
      ctx,
      snapshotDate: args.snapshotDate,
      limit: args.limit,
      driftOnly: args.driftOnly,
    })

    if (args.json) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.log(`Snapshot date     : ${result.snapshotDate}`)
      console.log(`Rows in sample    : ${result.totalChecked}`)
      console.log(`Drifts            : ${result.totalDrift}`)
      console.log(`Missing on our DB : ${result.totalMissing}`)
      console.log('')
      if (result.rows.length === 0) {
        console.log('No rows to display.')
      } else {
        const header = ['status', 'gammaUserId', 'email', 'ours_SC', 'gamma_SC', 'drift_minor']
        console.log(header.join('\t'))
        for (const row of result.rows) {
          console.log(
            [
              row.status,
              row.gammaUserId,
              row.email ?? '-',
              row.ourScBalance,
              row.gammaScBalance,
              row.driftMinor,
            ].join('\t'),
          )
        }
      }
    }

    const exitCode = result.totalDrift + result.totalMissing > 0 ? 1 : 0
    await closeDb()
    process.exit(exitCode)
  } catch (e) {
    console.error('FATAL:', e instanceof Error ? e.message : String(e))
    if (e instanceof Error && e.stack) console.error(e.stack)
    await closeDb()
    process.exit(2)
  }
}

main()
