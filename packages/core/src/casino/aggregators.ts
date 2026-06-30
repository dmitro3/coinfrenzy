import { count, eq, sql } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import { writeAuditEntry } from '../audit'
import type { Context } from '../context'
import { err, ok, type Result } from '../errors/result'

// docs/08 §4.4 — aggregators. The integration page senior-dev will use
// to wire AleaPlay / Marbles / future aggregators. Secrets stay in
// Doppler — this service only stores the Doppler key NAME, never the
// value, per .cursorrules.

export interface AggregatorListItem {
  id: string
  slug: string
  displayName: string
  status: string
  apiBaseUrl: string | null
  callbackUrl: string | null
  webhookSecretRef: string | null
  features: Record<string, unknown>
  version: string | null
  lastSeenAt: string | null
  errorCount1h: number
  contactEmail: string | null
  notes: string | null
  providerCount: number
  gameCount: number
  ggr30dSc: string
  createdAt: string
  updatedAt: string
}

export type AggregatorError = { code: 'not_found' }

export async function listAggregatorsDetailed(ctx: Context): Promise<AggregatorListItem[]> {
  const rows = await ctx.db
    .select()
    .from(schema.aggregators)
    .orderBy(schema.aggregators.displayName)

  if (rows.length === 0) return []

  const providerCounts = await ctx.db
    .select({
      aggregatorId: schema.gameProviders.aggregatorId,
      n: count().as('n'),
    })
    .from(schema.gameProviders)
    .groupBy(schema.gameProviders.aggregatorId)
  const providerCountMap = new Map(providerCounts.map((p) => [p.aggregatorId, Number(p.n)]))

  const gameCounts = await ctx.db
    .select({
      aggregatorId: schema.gameProviders.aggregatorId,
      n: count(schema.games.id).as('n'),
    })
    .from(schema.gameProviders)
    .leftJoin(schema.games, eq(schema.games.providerId, schema.gameProviders.id))
    .groupBy(schema.gameProviders.aggregatorId)
  const gameCountMap = new Map(gameCounts.map((g) => [g.aggregatorId, Number(g.n)]))

  // GGR for the last 30d per aggregator, computed against ledger_entries
  // via metadata->>'providerId' → game_providers.aggregator_id.
  const ggrRows = await ctx.db.execute(sql`
    SELECT
      gp.aggregator_id,
      COALESCE(SUM(CASE WHEN le.source = 'bet' AND le.currency = 'SC' THEN le.amount ELSE 0 END), 0)::text AS bet_sum,
      COALESCE(SUM(CASE WHEN le.source = 'win' AND le.currency = 'SC' THEN le.amount ELSE 0 END), 0)::text AS win_sum
    FROM ledger_entries le
    LEFT JOIN game_providers gp ON gp.id = (le.metadata->>'providerId')::uuid
    WHERE le.created_at >= now() - interval '30 days'
      AND le.metadata ? 'providerId'
      AND gp.aggregator_id IS NOT NULL
    GROUP BY gp.aggregator_id
  `)
  const ggrMap = new Map<string, bigint>()
  for (const row of ggrRows as unknown as {
    aggregator_id: string
    bet_sum: string
    win_sum: string
  }[]) {
    ggrMap.set(row.aggregator_id, stringToBigint(row.bet_sum) - stringToBigint(row.win_sum))
  }

  return rows.map((a) => ({
    id: a.id,
    slug: a.slug,
    displayName: a.displayName,
    status: a.status,
    apiBaseUrl: a.apiBaseUrl,
    callbackUrl: a.callbackUrl,
    webhookSecretRef: a.webhookSecretRef,
    features: (a.features ?? {}) as Record<string, unknown>,
    version: a.version,
    lastSeenAt: a.lastSeenAt ? a.lastSeenAt.toISOString() : null,
    errorCount1h: a.errorCount1h,
    contactEmail: a.contactEmail,
    notes: a.notes,
    providerCount: providerCountMap.get(a.id) ?? 0,
    gameCount: gameCountMap.get(a.id) ?? 0,
    ggr30dSc: (ggrMap.get(a.id) ?? 0n).toString(),
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }))
}

export interface UpdateAggregatorInput {
  // Non-secret fields only. Secrets are managed in Doppler.
  displayName?: string
  apiBaseUrl?: string | null
  callbackUrl?: string | null
  webhookSecretRef?: string | null
  status?: 'active' | 'inactive'
  features?: Record<string, unknown>
  version?: string | null
  contactEmail?: string | null
  notes?: string | null
}

export async function updateAggregator(
  ctx: Context,
  id: string,
  input: UpdateAggregatorInput,
): Promise<Result<void, AggregatorError>> {
  const before = await ctx.db.query.aggregators.findFirst({
    where: eq(schema.aggregators.id, id),
  })
  if (!before) return err({ code: 'not_found' })

  await ctx.db
    .update(schema.aggregators)
    .set({
      displayName: input.displayName ?? before.displayName,
      apiBaseUrl: input.apiBaseUrl === undefined ? before.apiBaseUrl : input.apiBaseUrl,
      callbackUrl: input.callbackUrl === undefined ? before.callbackUrl : input.callbackUrl,
      webhookSecretRef:
        input.webhookSecretRef === undefined ? before.webhookSecretRef : input.webhookSecretRef,
      status: input.status ?? before.status,
      features: input.features ?? (before.features as Record<string, unknown>),
      version: input.version === undefined ? before.version : input.version,
      contactEmail: input.contactEmail === undefined ? before.contactEmail : input.contactEmail,
      notes: input.notes === undefined ? before.notes : input.notes,
      updatedAt: new Date(),
    })
    .where(eq(schema.aggregators.id, id))

  await writeAuditEntry(ctx.db, {
    actorKind: ctx.actor.kind === 'admin' ? 'admin' : 'system',
    actorId: ctx.actor.kind === 'admin' ? ctx.actor.adminId : null,
    actorRole: ctx.actor.kind === 'admin' ? ctx.actor.role : null,
    action: 'admin.casino.aggregator.update',
    resourceKind: 'aggregator',
    resourceId: id,
    before: {
      displayName: before.displayName,
      apiBaseUrl: before.apiBaseUrl,
      callbackUrl: before.callbackUrl,
      webhookSecretRef: before.webhookSecretRef,
      status: before.status,
      features: before.features,
      version: before.version,
      contactEmail: before.contactEmail,
    },
    after: { ...input },
  })

  return ok(undefined)
}

const SCALE = 10_000n
function stringToBigint(value: string): bigint {
  if (!value || value === '0') return 0n
  const negative = value.startsWith('-')
  const abs = negative ? value.slice(1) : value
  const [majorStr = '0', minorStr = ''] = abs.split('.')
  const major = BigInt(majorStr)
  const minorPadded = minorStr.padEnd(4, '0').slice(0, 4)
  const minor = BigInt(minorPadded || '0')
  const total = major * SCALE + minor
  return negative ? -total : total
}
