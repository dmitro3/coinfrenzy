import { randomUUID } from 'node:crypto'

import { getDb } from '@coinfrenzy/db'
import { consoleLogger, createAfterCommitQueue, type Actor, type Context } from '@coinfrenzy/core'

// Worker-side Context builder for Inngest functions and crons.
// Each invocation gets a fresh reqId + afterCommit queue so we don't leak
// state between concurrent runs on the same worker process.

export interface WorkerContextOptions {
  reqId?: string
  actor?: Actor
  /** Per-invocation log fields (job id, event name, etc.). */
  loggerBindings?: Record<string, unknown>
}

export interface WorkerContextBundle {
  ctx: Context
  flushAfterCommit: () => Promise<void>
}

export function buildWorkerContext(options: WorkerContextOptions = {}): WorkerContextBundle {
  const reqId = options.reqId ?? randomUUID()
  const actor: Actor = options.actor ?? { kind: 'system', service: 'worker', source: 'inngest' }
  const baseLogger = consoleLogger.child({
    reqId,
    actor_kind: actor.kind,
    ...(options.loggerBindings ?? {}),
  })
  const queue = createAfterCommitQueue(baseLogger)
  const ctx: Context = {
    db: getDb(),
    logger: baseLogger,
    actor,
    reqId,
    afterCommit: queue.push,
  }
  return { ctx, flushAfterCommit: queue.flush }
}
