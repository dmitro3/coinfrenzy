// docs/03 §5.4 + docs/08 — package CRUD for admin operators.
//
// Service-layer surface for managing coin packages: create, update,
// archive, soft-delete, bulk-reorder, and featured-slot management.
// Every mutation writes an audit_log entry with before/after snapshots
// because pricing/grant changes have direct financial impact.

import { and, asc, eq, isNull, sql } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import { writeAuditEntry } from '../audit/index'
import type { Context } from '../context'
import { err, ok, type Result } from '../errors/result'

export type PackageStatus = 'active' | 'inactive' | 'archived'
export type PackageBadgeColor = 'gold' | 'red' | 'purple' | 'green' | 'blue' | 'silver'

export interface PackageRow {
  id: string
  slug: string
  displayName: string
  priceUsd: bigint
  baseGc: bigint
  baseSc: bigint
  bonusGc: bigint
  bonusSc: bigint
  playthroughMultiplier: string
  bonusScPlaythroughMultiplier: string
  bonusGcPlaythroughMultiplier: string
  promotionalLabel: string | null
  badgeColor: string | null
  displayImageUrl: string | null
  description: string | null
  sortOrder: number
  featuredSlot: number | null
  bannerHeadline: string | null
  bannerSubhead: string | null
  bannerImageUrl: string | null
  status: PackageStatus
  validFrom: Date | null
  validUntil: Date | null
  firstPurchaseOnly: boolean
  maxPerPlayer: number | null
  bonusId: string | null
  minTierId: string | null
  createdAt: Date
  updatedAt: Date
}

export type PackageError =
  | { code: 'NOT_FOUND' }
  | { code: 'SLUG_CONFLICT' }
  | { code: 'SLOT_CONFLICT' }
  | { code: 'INVALID' }

export interface CreatePackageInput {
  slug: string
  displayName: string
  priceUsd: bigint
  baseGc: bigint
  baseSc?: bigint
  bonusGc?: bigint
  bonusSc?: bigint
  playthroughMultiplier?: string
  bonusScPlaythroughMultiplier?: string
  bonusGcPlaythroughMultiplier?: string
  promotionalLabel?: string | null
  badgeColor?: string | null
  displayImageUrl?: string | null
  description?: string | null
  sortOrder?: number
  featuredSlot?: number | null
  bannerHeadline?: string | null
  bannerSubhead?: string | null
  bannerImageUrl?: string | null
  status?: PackageStatus
  validFrom?: Date | null
  validUntil?: Date | null
  firstPurchaseOnly?: boolean
  maxPerPlayer?: number | null
  bonusId?: string | null
}

export interface UpdatePackageInput extends Partial<CreatePackageInput> {
  id: string
}

const SLUG_RE = /^[a-z0-9-]+$/

function validateInput(
  input: Partial<CreatePackageInput>,
): { ok: true } | { ok: false; reason: string } {
  if (input.slug !== undefined && !SLUG_RE.test(input.slug)) {
    return { ok: false, reason: 'slug_must_be_lowercase_hyphens_digits' }
  }
  if (input.priceUsd !== undefined && input.priceUsd <= 0n) {
    return { ok: false, reason: 'price_must_be_positive' }
  }
  if (input.baseGc !== undefined && input.baseGc < 0n) {
    return { ok: false, reason: 'base_gc_cannot_be_negative' }
  }
  if (input.baseSc !== undefined && input.baseSc < 0n) {
    return { ok: false, reason: 'base_sc_cannot_be_negative' }
  }
  if (input.bonusGc !== undefined && input.bonusGc < 0n) {
    return { ok: false, reason: 'bonus_gc_cannot_be_negative' }
  }
  if (input.bonusSc !== undefined && input.bonusSc < 0n) {
    return { ok: false, reason: 'bonus_sc_cannot_be_negative' }
  }
  if (
    input.featuredSlot !== undefined &&
    input.featuredSlot !== null &&
    ![1, 2].includes(input.featuredSlot)
  ) {
    return { ok: false, reason: 'featured_slot_must_be_1_or_2' }
  }
  if (input.sortOrder !== undefined && input.sortOrder < 0) {
    return { ok: false, reason: 'sort_order_cannot_be_negative' }
  }
  return { ok: true }
}

export async function listPackages(
  ctx: Context,
  opts: { includeDeleted?: boolean } = {},
): Promise<PackageRow[]> {
  const rows = await ctx.db
    .select()
    .from(schema.packages)
    .where(opts.includeDeleted ? sql`1=1` : isNull(schema.packages.deletedAt))
    .orderBy(asc(schema.packages.sortOrder), asc(schema.packages.priceUsd))

  return rows.map(toPackageRow)
}

export async function getPackage(
  ctx: Context,
  id: string,
): Promise<Result<PackageRow, PackageError>> {
  const rows = await ctx.db
    .select()
    .from(schema.packages)
    .where(and(eq(schema.packages.id, id), isNull(schema.packages.deletedAt)))
    .limit(1)
  if (!rows[0]) return err({ code: 'NOT_FOUND' as const })
  return ok(toPackageRow(rows[0]))
}

export async function createPackage(
  ctx: Context,
  input: CreatePackageInput,
): Promise<Result<{ id: string }, PackageError>> {
  const v = validateInput(input)
  if (!v.ok) {
    ctx.logger.info('package_create_invalid', { reason: v.reason })
    return err({ code: 'INVALID' as const })
  }

  // Slug uniqueness — check before insert to give a friendly error.
  const slugExists = await ctx.db
    .select({ id: schema.packages.id })
    .from(schema.packages)
    .where(eq(schema.packages.slug, input.slug))
    .limit(1)
  if (slugExists[0]) return err({ code: 'SLUG_CONFLICT' as const })

  // Featured slot conflict — only one active package can occupy each slot.
  if (input.featuredSlot && (input.status ?? 'active') === 'active') {
    const slotTaken = await ctx.db
      .select({ id: schema.packages.id })
      .from(schema.packages)
      .where(
        and(
          eq(schema.packages.featuredSlot, input.featuredSlot),
          eq(schema.packages.status, 'active'),
          isNull(schema.packages.deletedAt),
        ),
      )
      .limit(1)
    if (slotTaken[0]) return err({ code: 'SLOT_CONFLICT' as const })
  }

  const inserted = await ctx.db
    .insert(schema.packages)
    .values({
      slug: input.slug,
      displayName: input.displayName,
      priceUsd: input.priceUsd,
      baseGc: input.baseGc,
      baseSc: input.baseSc ?? 0n,
      bonusGc: input.bonusGc ?? 0n,
      bonusSc: input.bonusSc ?? 0n,
      playthroughMultiplier: input.playthroughMultiplier ?? '1.0',
      bonusScPlaythroughMultiplier: input.bonusScPlaythroughMultiplier ?? '3.0',
      bonusGcPlaythroughMultiplier: input.bonusGcPlaythroughMultiplier ?? '1.0',
      promotionalLabel: input.promotionalLabel ?? null,
      badgeColor: input.badgeColor ?? null,
      displayImageUrl: input.displayImageUrl ?? null,
      description: input.description ?? null,
      sortOrder: input.sortOrder ?? 0,
      featuredSlot: input.featuredSlot ?? null,
      bannerHeadline: input.bannerHeadline ?? null,
      bannerSubhead: input.bannerSubhead ?? null,
      bannerImageUrl: input.bannerImageUrl ?? null,
      status: input.status ?? 'active',
      validFrom: input.validFrom ?? null,
      validUntil: input.validUntil ?? null,
      firstPurchaseOnly: input.firstPurchaseOnly ?? false,
      maxPerPlayer: input.maxPerPlayer ?? null,
      bonusId: input.bonusId ?? null,
    })
    .returning({ id: schema.packages.id })

  const id = inserted[0]!.id

  await writeAuditEntry(ctx.db, {
    actorKind: ctx.actor.kind === 'admin' ? 'admin' : 'system',
    actorId: ctx.actor.kind === 'admin' ? ctx.actor.adminId : null,
    actorRole: ctx.actor.kind === 'admin' ? ctx.actor.role : null,
    action: 'package.create',
    resourceKind: 'package',
    resourceId: id,
    after: { ...sanitiseForAudit(input) },
    ip: ctx.actor.kind === 'admin' ? ctx.actor.ip : null,
    requestId: ctx.reqId,
  })

  return ok({ id })
}

export async function updatePackage(
  ctx: Context,
  input: UpdatePackageInput,
): Promise<Result<void, PackageError>> {
  const v = validateInput(input)
  if (!v.ok) {
    ctx.logger.info('package_update_invalid', { id: input.id, reason: v.reason })
    return err({ code: 'INVALID' as const })
  }

  const existing = await ctx.db
    .select()
    .from(schema.packages)
    .where(and(eq(schema.packages.id, input.id), isNull(schema.packages.deletedAt)))
    .limit(1)
  if (!existing[0]) return err({ code: 'NOT_FOUND' as const })

  if (input.slug && input.slug !== existing[0].slug) {
    const slugExists = await ctx.db
      .select({ id: schema.packages.id })
      .from(schema.packages)
      .where(eq(schema.packages.slug, input.slug))
      .limit(1)
    if (slugExists[0]) return err({ code: 'SLUG_CONFLICT' as const })
  }

  // Featured slot conflict (only if the slot is being set to a non-null
  // value AND the package will remain active).
  const desiredStatus = input.status ?? (existing[0].status as PackageStatus)
  if (
    input.featuredSlot !== undefined &&
    input.featuredSlot !== null &&
    desiredStatus === 'active'
  ) {
    const slotTaken = await ctx.db
      .select({ id: schema.packages.id })
      .from(schema.packages)
      .where(
        and(
          eq(schema.packages.featuredSlot, input.featuredSlot),
          eq(schema.packages.status, 'active'),
          isNull(schema.packages.deletedAt),
        ),
      )
      .limit(1)
    if (slotTaken[0] && slotTaken[0].id !== input.id) {
      return err({ code: 'SLOT_CONFLICT' as const })
    }
  }

  const before = toPackageRow(existing[0])
  const patch: Partial<typeof schema.packages.$inferInsert> = {
    updatedAt: new Date(),
  }
  if (input.slug !== undefined) patch.slug = input.slug
  if (input.displayName !== undefined) patch.displayName = input.displayName
  if (input.priceUsd !== undefined) patch.priceUsd = input.priceUsd
  if (input.baseGc !== undefined) patch.baseGc = input.baseGc
  if (input.baseSc !== undefined) patch.baseSc = input.baseSc
  if (input.bonusGc !== undefined) patch.bonusGc = input.bonusGc
  if (input.bonusSc !== undefined) patch.bonusSc = input.bonusSc
  if (input.playthroughMultiplier !== undefined)
    patch.playthroughMultiplier = input.playthroughMultiplier
  if (input.bonusScPlaythroughMultiplier !== undefined)
    patch.bonusScPlaythroughMultiplier = input.bonusScPlaythroughMultiplier
  if (input.bonusGcPlaythroughMultiplier !== undefined)
    patch.bonusGcPlaythroughMultiplier = input.bonusGcPlaythroughMultiplier
  if (input.promotionalLabel !== undefined) patch.promotionalLabel = input.promotionalLabel
  if (input.badgeColor !== undefined) patch.badgeColor = input.badgeColor
  if (input.displayImageUrl !== undefined) patch.displayImageUrl = input.displayImageUrl
  if (input.description !== undefined) patch.description = input.description
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder
  if (input.featuredSlot !== undefined) patch.featuredSlot = input.featuredSlot
  if (input.bannerHeadline !== undefined) patch.bannerHeadline = input.bannerHeadline
  if (input.bannerSubhead !== undefined) patch.bannerSubhead = input.bannerSubhead
  if (input.bannerImageUrl !== undefined) patch.bannerImageUrl = input.bannerImageUrl
  if (input.status !== undefined) patch.status = input.status
  if (input.validFrom !== undefined) patch.validFrom = input.validFrom
  if (input.validUntil !== undefined) patch.validUntil = input.validUntil
  if (input.firstPurchaseOnly !== undefined) patch.firstPurchaseOnly = input.firstPurchaseOnly
  if (input.maxPerPlayer !== undefined) patch.maxPerPlayer = input.maxPerPlayer
  if (input.bonusId !== undefined) patch.bonusId = input.bonusId

  await ctx.db.update(schema.packages).set(patch).where(eq(schema.packages.id, input.id))

  await writeAuditEntry(ctx.db, {
    actorKind: ctx.actor.kind === 'admin' ? 'admin' : 'system',
    actorId: ctx.actor.kind === 'admin' ? ctx.actor.adminId : null,
    actorRole: ctx.actor.kind === 'admin' ? ctx.actor.role : null,
    action: 'package.update',
    resourceKind: 'package',
    resourceId: input.id,
    before: sanitiseForAudit(before),
    after: sanitiseForAudit({ ...input }),
    ip: ctx.actor.kind === 'admin' ? ctx.actor.ip : null,
    requestId: ctx.reqId,
  })

  return ok(undefined)
}

/** Soft-delete (sets deleted_at). The row is preserved for FK integrity
 *  with the purchases table; the player API filters by deleted_at IS NULL. */
export async function archivePackage(
  ctx: Context,
  id: string,
): Promise<Result<void, PackageError>> {
  const existing = await ctx.db
    .select()
    .from(schema.packages)
    .where(and(eq(schema.packages.id, id), isNull(schema.packages.deletedAt)))
    .limit(1)
  if (!existing[0]) return err({ code: 'NOT_FOUND' as const })

  await ctx.db
    .update(schema.packages)
    .set({
      deletedAt: new Date(),
      status: 'archived',
      featuredSlot: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.packages.id, id))

  await writeAuditEntry(ctx.db, {
    actorKind: ctx.actor.kind === 'admin' ? 'admin' : 'system',
    actorId: ctx.actor.kind === 'admin' ? ctx.actor.adminId : null,
    actorRole: ctx.actor.kind === 'admin' ? ctx.actor.role : null,
    action: 'package.archive',
    resourceKind: 'package',
    resourceId: id,
    before: sanitiseForAudit(toPackageRow(existing[0])),
    ip: ctx.actor.kind === 'admin' ? ctx.actor.ip : null,
    requestId: ctx.reqId,
  })

  return ok(undefined)
}

/**
 * Bulk reorder via id -> new sort_order map. Pass any subset of package
 * ids and their new positions; everything else is untouched.
 */
export async function reorderPackages(
  ctx: Context,
  positions: Array<{ id: string; sortOrder: number }>,
): Promise<Result<void, PackageError>> {
  if (positions.length === 0) return ok(undefined)
  for (const p of positions) {
    if (p.sortOrder < 0) return err({ code: 'INVALID' as const })
  }

  await ctx.db.transaction(async (tx) => {
    for (const p of positions) {
      await tx
        .update(schema.packages)
        .set({ sortOrder: p.sortOrder, updatedAt: new Date() })
        .where(eq(schema.packages.id, p.id))
    }
  })

  await writeAuditEntry(ctx.db, {
    actorKind: ctx.actor.kind === 'admin' ? 'admin' : 'system',
    actorId: ctx.actor.kind === 'admin' ? ctx.actor.adminId : null,
    actorRole: ctx.actor.kind === 'admin' ? ctx.actor.role : null,
    action: 'package.reorder',
    resourceKind: 'package',
    after: { positions },
    ip: ctx.actor.kind === 'admin' ? ctx.actor.ip : null,
    requestId: ctx.reqId,
  })

  return ok(undefined)
}

/**
 * Toggle which slot (1 or 2) a package occupies. Pass `slot: null` to clear.
 * Throws SLOT_CONFLICT if another active package already holds that slot.
 */
export async function setFeaturedSlot(
  ctx: Context,
  id: string,
  slot: 1 | 2 | null,
): Promise<Result<void, PackageError>> {
  return updatePackage(ctx, { id, featuredSlot: slot })
}

// -------------------------------------------------------------------------
// Internal mappers
// -------------------------------------------------------------------------

function toPackageRow(r: typeof schema.packages.$inferSelect): PackageRow {
  return {
    id: r.id,
    slug: r.slug,
    displayName: r.displayName,
    priceUsd: r.priceUsd,
    baseGc: r.baseGc,
    baseSc: r.baseSc,
    bonusGc: r.bonusGc,
    bonusSc: r.bonusSc,
    playthroughMultiplier: r.playthroughMultiplier,
    bonusScPlaythroughMultiplier: r.bonusScPlaythroughMultiplier,
    bonusGcPlaythroughMultiplier: r.bonusGcPlaythroughMultiplier,
    promotionalLabel: r.promotionalLabel,
    badgeColor: r.badgeColor,
    displayImageUrl: r.displayImageUrl,
    description: r.description,
    sortOrder: r.sortOrder,
    featuredSlot: r.featuredSlot,
    bannerHeadline: r.bannerHeadline,
    bannerSubhead: r.bannerSubhead,
    bannerImageUrl: r.bannerImageUrl,
    status: r.status as PackageStatus,
    validFrom: r.validFrom,
    validUntil: r.validUntil,
    firstPurchaseOnly: r.firstPurchaseOnly,
    maxPerPlayer: r.maxPerPlayer,
    bonusId: r.bonusId,
    minTierId: r.minTierId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

/** Audit-log payload sanitiser: bigints to strings, Dates to ISO, drop id. */
function sanitiseForAudit(obj: object): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (k === 'id') continue
    if (typeof v === 'bigint') out[k] = v.toString()
    else if (v instanceof Date) out[k] = v.toISOString()
    else out[k] = v
  }
  return out
}
