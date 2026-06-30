/* eslint-disable no-console */
/**
 * docs/13 §6.2 — cutover-night webhook replay controller.
 *
 * Replays every webhook captured during the dual-capture window through
 * CoinFrenzy's standard receiver handlers, then disables dual-capture so
 * the live system resumes normal dispatch. Designed to be the last step
 * before flipping DNS.
 *
 * Usage:
 *   pnpm cutover:replay-window --from=<ISO> --to=<ISO> [--providers=finix,alea,footprint]
 *                              [--run-id=<uuid>] [--dry-run] [--keep-capture]
 *                              [--json]
 *
 * Example (cutover-night, after final import):
 *   pnpm cutover:replay-window --from=2026-06-01T00:00:00Z --to=2026-07-01T00:00:00Z
 *
 * Exit codes:
 *   0  All captured events replayed successfully (or dry-run requested).
 *   1  One or more replays failed — investigate before flipping DNS.
 *   2  Invalid input / runtime error.
 */

import { closeDb, getDb } from '@coinfrenzy/db'
import {
  consoleLogger as logger,
  createAfterCommitQueue,
  migration,
  type Context,
} from '@coinfrenzy/core'

type DualCaptureProvider = migration.DualCaptureProvider

interface Args {
  from: Date
  to: Date
  providers?: DualCaptureProvider[]
  runId?: string
  dryRun: boolean
  keepCapture: boolean
  json: boolean
}

function parseArgs(argv: string[]): Args {
  const flags = new Map<string, string>()
  const booleans = new Set<string>()
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue
    const eq = arg.indexOf('=')
    if (eq === -1) booleans.add(arg.slice(2))
    else flags.set(arg.slice(2, eq), arg.slice(eq + 1))
  }

  const from = flags.get('from')
  const to = flags.get('to')
  if (!from || !to) {
    console.error('ERROR: --from=<ISO> and --to=<ISO> are required.')
    process.exit(2)
  }
  const fromD = new Date(from)
  const toD = new Date(to)
  if (Number.isNaN(fromD.getTime()) || Number.isNaN(toD.getTime())) {
    console.error('ERROR: --from / --to must be parseable ISO-8601 timestamps.')
    process.exit(2)
  }
  if (fromD >= toD) {
    console.error('ERROR: --from must be strictly less than --to.')
    process.exit(2)
  }

  let providers: DualCaptureProvider[] | undefined
  const provFlag = flags.get('providers')
  if (provFlag) {
    const valid: DualCaptureProvider[] = ['finix', 'alea', 'footprint']
    const parsed = provFlag.split(',').map((p) => p.trim().toLowerCase())
    const bad = parsed.filter((p) => !valid.includes(p as DualCaptureProvider))
    if (bad.length) {
      console.error(`ERROR: unknown provider(s): ${bad.join(', ')}. Valid: ${valid.join(', ')}`)
      process.exit(2)
    }
    providers = parsed as DualCaptureProvider[]
  }

  return {
    from: fromD,
    to: toD,
    providers,
    runId: flags.get('run-id'),
    dryRun: booleans.has('dry-run'),
    keepCapture: booleans.has('keep-capture'),
    json: booleans.has('json'),
  }
}

function buildSystemCtx(): Context {
  const queue = createAfterCommitQueue(logger)
  return {
    db: getDb(),
    logger,
    actor: { kind: 'system', service: 'script', source: 'replay-window' },
    reqId: `replay-window-${Date.now()}`,
    afterCommit: queue.push,
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const ctx = buildSystemCtx()

  try {
    if (!args.json) {
      console.log('Cutover webhook replay')
      console.log(`  window     : ${args.from.toISOString()} → ${args.to.toISOString()}`)
      console.log(`  providers  : ${(args.providers ?? ['finix', 'alea', 'footprint']).join(', ')}`)
      console.log(`  run id     : ${args.runId ?? '(none)'}`)
      console.log(`  dry run    : ${args.dryRun}`)
      console.log(`  keep cap   : ${args.keepCapture}`)
      console.log('')
    }

    const result = await migration.replayCapturedWebhooks({
      ctx,
      from: args.from,
      to: args.to,
      providers: args.providers,
      runId: args.runId ?? null,
      dryRun: args.dryRun,
    })

    // Disable dual-capture after a successful real replay so the system
    // resumes normal dispatch. We do NOT do this on dry-run or if --keep-capture
    // was passed (the operator may want to do a second replay sweep first).
    if (!args.dryRun && !args.keepCapture && result.failed === 0) {
      await migration.setDualCaptureConfig(ctx.db, { enabled: false })
      if (!args.json) console.log('Dual-capture mode disabled.')
    }

    if (args.json) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.log('')
      console.log(`Total in window  : ${result.total}`)
      console.log(`Replayed OK      : ${result.completed}`)
      console.log(`Failed           : ${result.failed}`)
      console.log(`Already replayed : ${result.duplicate}`)
      console.log(`Dry-run skipped  : ${result.skipped}`)
    }

    const exitCode = result.failed > 0 ? 1 : 0
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
