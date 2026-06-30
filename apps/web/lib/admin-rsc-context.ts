import 'server-only'

import { randomUUID } from 'node:crypto'

import { noopLogger, type Context } from '@coinfrenzy/core'
import { getDb } from '@coinfrenzy/db/client'

/**
 * Build a Context for read-only RSC pages that want to call `core`
 * service-layer functions. We pass `anonymous` actor because RLS for
 * admin reads is gated at the admin shell layer (requireAdminSession())
 * — this Context is only for shaping queries through the core API.
 *
 * Do NOT use this in API routes that mutate state. Mutations must
 * go through `buildAdminContext()` so the actor is correctly set
 * for `audit_log` writes.
 */
export function buildAdminRscContext(): Context {
  return {
    db: getDb(),
    logger: noopLogger,
    actor: { kind: 'anonymous' },
    reqId: randomUUID(),
    afterCommit: () => {},
  }
}
