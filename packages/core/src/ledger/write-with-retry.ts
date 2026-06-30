// docs/04 §8.2 — jittered backoff on serialization_failure. Postgres
// SERIALIZABLE may raise 40001 when two concurrent transactions touch
// the same wallet. Real contention only fires when the same wallet is
// hit by two writes at the same instant — which is rare in practice but
// non-zero, so the retry loop is required for correctness under load.

import type { Result } from '../errors/result'
import { err } from '../errors/result'
import type { Context } from '../context'

import type { LedgerError } from './errors'
import type { LedgerWriteResult, TransactionSpec } from './types'
import { write } from './write'

const MAX_ATTEMPTS = 3
const BASE_BACKOFF_MS = 50

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface WriteWithRetryOptions {
  maxAttempts?: number
  baseBackoffMs?: number
  /** Inject a fake RNG for deterministic tests. Defaults to Math.random. */
  random?: () => number
}

export async function writeWithRetry(
  ctx: Context,
  spec: TransactionSpec,
  options: WriteWithRetryOptions = {},
): Promise<Result<LedgerWriteResult, LedgerError>> {
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS
  const baseBackoff = options.baseBackoffMs ?? BASE_BACKOFF_MS
  const random = options.random ?? Math.random

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await write(ctx, spec)
    if (result.ok) return result
    if (result.error.code !== 'serialization_failure') return result
    if (attempt === maxAttempts) break
    const backoff = random() * baseBackoff * attempt
    ctx.logger.info('ledger.write serialization_failure; retrying with backoff', {
      attempt,
      backoff_ms: backoff,
      source: spec.source,
      source_id: spec.sourceId,
    })
    await sleep(backoff)
  }
  return err({ code: 'serialization_failure_retries_exhausted' })
}
