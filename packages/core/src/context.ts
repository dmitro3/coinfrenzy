import type { DbExecutor } from '@coinfrenzy/db'

import type { Logger } from './logger'

// Per docs/02 §5: every core function takes a Context as its first arg so
// we have explicit, swappable dependencies and zero global state.
//
// - `db` may be a pooled client OR a transaction handle. When core wraps
//   work in a transaction it sets `ctx.db = tx` and passes that down.
// - `actor` is who is doing this. It feeds both the audit log writer and
//   the RLS policies via `app.actor_id / actor_kind / actor_role`.
// - `afterCommit` queues callbacks that run after the *outer* DB transaction
//   commits — used e.g. for Redis cache invalidation per docs/04 §4 step 7.
//   If no outer transaction wraps the work, these run immediately.

export type AdminRole = string

export type Actor =
  | { kind: 'player'; playerId: string }
  | { kind: 'admin'; adminId: string; role: AdminRole; ip: string }
  | { kind: 'system'; service: 'webhook' | 'worker' | 'cron' | 'script'; source: string }
  | { kind: 'anonymous' }

export type AfterCommitHook = () => Promise<void> | void

// Per docs/11 §2: events.emit() needs to dispatch to Inngest after the outer
// transaction commits. We thread the sender through Context so test harnesses
// can inject a no-op and prod apps inject the real Inngest client. Optional
// because earlier-prompt fixtures construct Context without an event bus.
export interface InngestSender {
  send: (event: { name: string; data: Record<string, unknown> }) => Promise<void>
}

export interface Context {
  db: DbExecutor
  logger: Logger
  actor: Actor
  reqId: string
  afterCommit: (hook: AfterCommitHook) => void
  inngest?: InngestSender
}

/**
 * Mutable holder for afterCommit callbacks. The transport (HTTP handler,
 * worker job) creates one, builds the Context that pushes to it, runs the
 * work, then calls `flush()` once the outer transaction has committed.
 * `ledger.write()` also creates its own when called without an outer ctx.
 */
export interface AfterCommitQueue {
  push: (hook: AfterCommitHook) => void
  flush: () => Promise<void>
  size: () => number
}

export function createAfterCommitQueue(logger?: Logger): AfterCommitQueue {
  const hooks: AfterCommitHook[] = []
  return {
    push: (hook) => {
      hooks.push(hook)
    },
    flush: async () => {
      // Run in registration order. We swallow per-hook errors so one
      // misbehaving hook (e.g. Redis offline) can't break the others.
      const drained = hooks.splice(0)
      for (const hook of drained) {
        try {
          await hook()
        } catch (e) {
          logger?.warn('afterCommit hook failed', {
            error: e instanceof Error ? e.message : String(e),
          })
        }
      }
    },
    size: () => hooks.length,
  }
}

/** Build an Actor descriptor for an `app.actor_*` SQL trio. */
export function actorIdFor(actor: Actor): string {
  switch (actor.kind) {
    case 'player':
      return actor.playerId
    case 'admin':
      return actor.adminId
    case 'system':
      return `system:${actor.source}`
    case 'anonymous':
      return 'anonymous'
  }
}

export function actorKindFor(actor: Actor): 'player' | 'admin' | 'system' {
  if (actor.kind === 'anonymous') return 'system'
  return actor.kind
}

export function actorRoleFor(actor: Actor): string | null {
  return actor.kind === 'admin' ? actor.role : null
}
