// docs/11 §3 — segment service layer.
//
// Public API:
//   - countSegment(ctx, tree)         → estimated count (parameterized SQL)
//   - previewSegment(ctx, tree, n)    → first N matching player ids
//   - listPlayerIds(ctx, tree, opts)  → streaming pagination (large fetch)
//   - saveSegment(ctx, input)         → store filter_tree + compiled_sql
//   - getSegment(ctx, id)             → row + parsed tree
//   - listSegments(ctx)               → list view
//
// All write operations append an audit_log entry per docs/09 §3.

import { eq, inArray, sql } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import { writeAuditEntry } from '../audit/index'
import type { Context } from '../context'
import { err, ok, type Result } from '../errors/result'

import { compile, type CompiledSegment } from './compiler'
import { validateFilterTree, type FilterTree } from './filter-tree'

export type SegmentError =
  | { code: 'NOT_FOUND' }
  | { code: 'INVALID_TREE'; details: unknown }
  | { code: 'NAME_CONFLICT' }

export interface SaveSegmentInput {
  id?: string | null
  name: string
  description?: string | null
  filterTree: FilterTree | unknown
  status?: 'active' | 'archived'
}

export interface SavedSegment {
  id: string
  name: string
  description: string | null
  filterTree: FilterTree
  compiledSql: string | null
  cachedCount: number | null
  status: string
  countUpdatedAt: Date | null
}

export async function countSegment(
  ctx: Context,
  tree: FilterTree | unknown,
): Promise<Result<{ count: number }, SegmentError>> {
  let compiled: CompiledSegment
  try {
    compiled = compile(tree, { mode: 'count' })
  } catch (e) {
    return err({ code: 'INVALID_TREE' as const, details: e instanceof Error ? e.message : e })
  }
  const rows = await runRawSelect<{ total: string }>(ctx, compiled.sql, compiled.params)
  const n = rows[0] ? Number(rows[0].total) : 0
  return ok({ count: Number.isFinite(n) ? n : 0 })
}

export interface PreviewPlayer {
  id: string
  email: string
  displayName: string | null
  tierLevel: number | null
  totalDepositedUsd: string | null
  lastLoginAt: Date | null
}

export async function previewSegment(
  ctx: Context,
  tree: FilterTree | unknown,
  limit = 10,
): Promise<Result<{ players: PreviewPlayer[] }, SegmentError>> {
  let compiled: CompiledSegment
  try {
    compiled = compile(tree, { mode: 'fetch', limit })
  } catch (e) {
    return err({ code: 'INVALID_TREE' as const, details: e instanceof Error ? e.message : e })
  }

  const idRows = await runRawSelect<{ id: string }>(ctx, compiled.sql, compiled.params)
  if (idRows.length === 0) return ok({ players: [] })

  const ids = idRows.map((r) => r.id)
  // NOTE: we use the Drizzle query builder + `inArray` here rather than a
  // raw `sql` template with `= ANY(${ids}::uuid[])`. The raw form caused
  // `cannot cast type record to uuid[]` errors because Drizzle binds JS
  // arrays inside `sql` template literals as a row/record, not a postgres
  // array literal. `inArray` expands to `IN ($1, $2, ...)` which is safe.
  const players = await ctx.db
    .select({
      id: schema.players.id,
      email: schema.players.email,
      displayName: schema.players.displayName,
      tierLevel: schema.tierProgress.currentTierLevel,
      totalDepositedUsd: schema.playerLifetimeStats.totalDepositedUsd,
      lastLoginAt: schema.player30dStats.lastLoginAt,
    })
    .from(schema.players)
    .leftJoin(schema.tierProgress, eq(schema.tierProgress.playerId, schema.players.id))
    .leftJoin(
      schema.playerLifetimeStats,
      eq(schema.playerLifetimeStats.playerId, schema.players.id),
    )
    .leftJoin(schema.player30dStats, eq(schema.player30dStats.playerId, schema.players.id))
    .where(inArray(schema.players.id, ids))
    .orderBy(schema.players.id)

  return ok({
    players: players.map((p) => ({
      id: p.id,
      email: p.email,
      displayName: p.displayName,
      tierLevel: p.tierLevel ?? null,
      // `totalDepositedUsd` is `numeric(20,4)` — Drizzle returns it as bigint
      // (minor units). Callers expect a decimal string for display, matching
      // the prior raw-SQL behaviour.
      totalDepositedUsd:
        p.totalDepositedUsd == null ? null : bigintMinorToDecimal(p.totalDepositedUsd),
      lastLoginAt: p.lastLoginAt ?? null,
    })),
  })
}

function bigintMinorToDecimal(value: bigint): string {
  const negative = value < 0n
  const abs = negative ? -value : value
  const major = abs / 10000n
  const minor = abs % 10000n
  const minorStr = minor.toString().padStart(4, '0')
  return `${negative ? '-' : ''}${major.toString()}.${minorStr}`
}

export async function listPlayerIds(
  ctx: Context,
  tree: FilterTree | unknown,
  opts: { limit?: number; offset?: number } = {},
): Promise<Result<{ ids: string[] }, SegmentError>> {
  let compiled: CompiledSegment
  try {
    compiled = compile(tree, {
      mode: 'fetch',
      limit: opts.limit,
      offset: opts.offset,
    })
  } catch (e) {
    return err({ code: 'INVALID_TREE' as const, details: e instanceof Error ? e.message : e })
  }
  const rows = await runRawSelect<{ id: string }>(ctx, compiled.sql, compiled.params)
  return ok({ ids: rows.map((r) => r.id) })
}

export async function saveSegment(
  ctx: Context,
  input: SaveSegmentInput,
): Promise<Result<SavedSegment, SegmentError>> {
  let validated: FilterTree
  try {
    validated = validateFilterTree(input.filterTree)
  } catch (e) {
    return err({ code: 'INVALID_TREE' as const, details: e instanceof Error ? e.message : e })
  }

  let compiled: CompiledSegment
  try {
    compiled = compile(validated, { mode: 'fetch' })
  } catch (e) {
    return err({ code: 'INVALID_TREE' as const, details: e instanceof Error ? e.message : e })
  }

  const compiledFlat = renderCompiledForStorage(compiled.sql, compiled.params)

  if (input.id) {
    const updated = await ctx.db
      .update(schema.crmSegments)
      .set({
        name: input.name,
        description: input.description ?? null,
        filterTree: validated,
        compiledSql: compiledFlat,
        compiledAt: new Date(),
        compilationVersion: compiled.compilationVersion,
        status: input.status ?? 'active',
        updatedAt: new Date(),
      })
      .where(eq(schema.crmSegments.id, input.id))
      .returning()

    if (!updated[0]) return err({ code: 'NOT_FOUND' as const })

    await writeAuditEntry(ctx.db, {
      actorKind: 'admin',
      action: 'crm.segment.update',
      resourceKind: 'crm_segment',
      resourceId: input.id,
      after: { name: input.name, status: input.status ?? 'active' },
    })

    return ok(rowToSegment(updated[0]))
  }

  const inserted = await ctx.db
    .insert(schema.crmSegments)
    .values({
      name: input.name,
      description: input.description ?? null,
      filterTree: validated,
      compiledSql: compiledFlat,
      compiledAt: new Date(),
      compilationVersion: compiled.compilationVersion,
      status: input.status ?? 'active',
      createdBy: ctx.actor.kind === 'admin' ? ctx.actor.adminId : null,
    })
    .returning()
    .catch((e) => {
      if (e instanceof Error && /unique/i.test(e.message)) return null
      throw e
    })

  if (!inserted || inserted.length === 0) return err({ code: 'NAME_CONFLICT' as const })

  await writeAuditEntry(ctx.db, {
    actorKind: 'admin',
    action: 'crm.segment.create',
    resourceKind: 'crm_segment',
    resourceId: inserted[0]!.id,
    after: { name: input.name },
  })

  return ok(rowToSegment(inserted[0]!))
}

export async function getSegment(
  ctx: Context,
  id: string,
): Promise<Result<SavedSegment, SegmentError>> {
  const rows = await ctx.db
    .select()
    .from(schema.crmSegments)
    .where(eq(schema.crmSegments.id, id))
    .limit(1)
  if (!rows[0]) return err({ code: 'NOT_FOUND' as const })
  return ok(rowToSegment(rows[0]))
}

export async function listSegments(
  ctx: Context,
  opts: { limit?: number; offset?: number; status?: string } = {},
): Promise<{ segments: SavedSegment[]; total: number }> {
  const limit = opts.limit ?? 50
  const offset = opts.offset ?? 0

  const rows = await ctx.db.execute(sql`
    SELECT
      s.*,
      COALESCE(s.cached_count, 0) AS resolved_count
    FROM crm_segments s
    ${opts.status ? sql`WHERE s.status = ${opts.status}` : sql``}
    ORDER BY s.updated_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `)

  const totalRows = await ctx.db.execute(sql`SELECT COUNT(*)::int AS n FROM crm_segments`)
  const total = (totalRows[0] as { n: number } | undefined)?.n ?? 0

  return {
    segments: (rows as unknown[]).map((r) => rowToSegment(r as Record<string, unknown>)),
    total,
  }
}

export async function refreshCachedCount(
  ctx: Context,
  segmentId: string,
): Promise<Result<{ count: number }, SegmentError>> {
  const segment = await getSegment(ctx, segmentId)
  if (!segment.ok) return segment
  const counted = await countSegment(ctx, segment.value.filterTree)
  if (!counted.ok) return counted

  await ctx.db
    .update(schema.crmSegments)
    .set({ cachedCount: counted.value.count, countUpdatedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.crmSegments.id, segmentId))

  return ok({ count: counted.value.count })
}

// ----- internal helpers ----------------------------------------------------

async function runRawSelect<T>(
  ctx: Context,
  rawSql: string,
  params: Array<string | number | boolean | null>,
): Promise<T[]> {
  // postgres-js client supports parameterized queries via .unsafe(query, params).
  // Drizzle's `db.execute(sql.raw(...))` does not bind params; we go through
  // the underlying sql.js connection.
  // We obtain it from the schema's hidden $client property or fall back.
  type DbWithClient = {
    _: { session: { client: { unsafe: (q: string, p: unknown[]) => Promise<unknown[]> } } }
  }
  const dbAny = ctx.db as unknown as DbWithClient
  const client = dbAny._?.session?.client
  if (client && typeof client.unsafe === 'function') {
    const rows = await client.unsafe(rawSql, params)
    return rows as T[]
  }
  // Fallback: substitute literally (used in tests w/ stub db).
  const result = await ctx.db.execute(sql.raw(substituteParams(rawSql, params)))
  return result as unknown as T[]
}

function substituteParams(raw: string, params: Array<string | number | boolean | null>): string {
  return raw.replace(/\$(\d+)/g, (_, n) => {
    const v = params[Number(n) - 1]
    if (v === null) return 'NULL'
    if (typeof v === 'number') return String(v)
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
    return `'${String(v).replace(/'/g, "''")}'`
  })
}

function renderCompiledForStorage(
  raw: string,
  params: Array<string | number | boolean | null>,
): string {
  // Stored alongside the filter_tree as a debugging / EXPLAIN target. We
  // inline the params for human readability; the runtime path keeps using
  // bound params for safety.
  return substituteParams(raw, params)
}

function rowToSegment(row: Record<string, unknown>): SavedSegment {
  const filterTreeRaw = row.filterTree ?? row.filter_tree
  return {
    id: String(row.id),
    name: String(row.name),
    description: (row.description as string | null) ?? null,
    filterTree: filterTreeRaw as FilterTree,
    compiledSql: (row.compiledSql ?? row.compiled_sql) as string | null,
    cachedCount: (row.cachedCount ?? row.cached_count ?? null) as number | null,
    status: (row.status as string) ?? 'active',
    countUpdatedAt: (row.countUpdatedAt ?? row.count_updated_at) as Date | null,
  }
}

export { validateFilterTree, type FilterTree } from './filter-tree'
export { compile, type CompiledSegment, type CompileOptions } from './compiler'
