import 'server-only'

import { randomUUID } from 'node:crypto'

import { consoleLogger, createAfterCommitQueue, type Context } from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'

// docs/05 §2 — every webhook route runs under a system-actor Context. We
// build it once at request entry; the universal receiver consumes it.

export function buildWebhookContext(provider: string): {
  ctx: Context
  flushAfterCommit: () => Promise<void>
} {
  const reqId = randomUUID()
  const baseLogger = consoleLogger.child({
    reqId,
    actor_kind: 'system',
    service: 'webhook',
    provider,
  })
  const queue = createAfterCommitQueue(baseLogger)
  const ctx: Context = {
    db: getDb(),
    logger: baseLogger,
    actor: { kind: 'system', service: 'webhook', source: provider },
    reqId,
    afterCommit: queue.push,
  }
  return { ctx, flushAfterCommit: queue.flush }
}
