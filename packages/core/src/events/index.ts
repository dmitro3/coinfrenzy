// docs/02 §9 + docs/11 §2 — the two-write event pattern.
//
// `emit(ctx, event)` is the typed surface used by service code. It writes
// synchronously to `player_events` (so segments and exports see it) AND
// queues an Inngest dispatch on `ctx.afterCommit` (so flow triggers and
// downstream consumers wake up only after the outer transaction commits).
//
// `recordPlayerEvent(db, …)` remains as a low-level escape hatch for
// places that don't (yet) thread Context — auth hooks, ad-hoc backfills,
// tests. New code should call `events.emit()`.

import { type DbExecutor } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import type { Context } from '../context'

import { categoryFor, type AllEventPayloads, type PlayerEvent, type PlayerEventName } from './types'

export {
  type AllEventPayloads,
  type AmountPayload,
  type Currency,
  type EventCategory,
  type PlayerEvent,
  type PlayerEventName,
  categoryFor,
} from './types'

export interface RecordPlayerEventInput {
  playerId: string
  eventName: string
  eventCategory: string
  payload?: Record<string, unknown>
  gameId?: string | null
  amount?: bigint | null
  currency?: 'GC' | 'SC' | 'USD' | null
}

export async function recordPlayerEvent(
  db: DbExecutor,
  input: RecordPlayerEventInput,
): Promise<void> {
  await db.insert(schema.playerEvents).values({
    playerId: input.playerId,
    eventName: input.eventName,
    eventCategory: input.eventCategory,
    payload: input.payload ?? {},
    gameId: input.gameId ?? null,
    amount: input.amount ?? null,
    currency: input.currency ?? null,
  })
}

export interface EmitOptions {
  /** Skip the after-commit Inngest dispatch (useful in unit tests). */
  skipInngest?: boolean
}

/**
 * Typed emit. The synchronous insert into `player_events` happens in the
 * caller's transaction; the Inngest dispatch is queued on `ctx.afterCommit`
 * so it only fires once the outer transaction commits (no phantom events
 * from rolled-back work).
 */
export async function emit<E extends PlayerEvent>(
  ctx: Context,
  event: E,
  opts: EmitOptions = {},
): Promise<void> {
  const data = event.data as AllEventPayloads[PlayerEventName] & {
    playerId: string
    gameId?: string | null
    amount?: bigint | null
    currency?: 'GC' | 'SC' | 'USD' | null
  }

  await recordPlayerEvent(ctx.db, {
    playerId: data.playerId,
    eventName: event.name,
    eventCategory: categoryFor(event.name),
    payload: serializePayload(data),
    gameId: 'gameId' in data && typeof data.gameId === 'string' ? data.gameId : null,
    amount: 'amount' in data && typeof data.amount === 'bigint' ? (data.amount as bigint) : null,
    currency:
      'currency' in data && typeof data.currency === 'string'
        ? (data.currency as 'GC' | 'SC' | 'USD')
        : null,
  })

  if (opts.skipInngest) return
  if (!ctx.inngest) {
    // Bound to a Context that wasn't given an Inngest sender (test harness,
    // migration script). Skip silently — the player_events row is the
    // source-of-truth fallback per docs/11 §2.
    return
  }

  const sender = ctx.inngest
  const logger = ctx.logger
  ctx.afterCommit(async () => {
    try {
      await sender.send({
        name: event.name,
        data: serializePayload(data) as Record<string, unknown>,
      })
    } catch (e) {
      logger?.warn('inngest_send_failed', {
        event: event.name,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  })
}

/**
 * BigInts are not JSON-serialisable. We coerce them to strings (the same
 * format the DB writes) so payloads round-trip cleanly through Inngest +
 * the audit log.
 */
function serializePayload(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    out[key] = serializeValue(value)
  }
  return out
}

function serializeValue(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(serializeValue)
  if (value !== null && typeof value === 'object')
    return serializePayload(value as Record<string, unknown>)
  return value
}
