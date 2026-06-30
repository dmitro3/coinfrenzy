// docs/09 §3.7 — versioned terms acceptance.
//
// Three operations:
//   - getCurrentTerms(slug): returns the most-recently effective row.
//   - acceptTerms(playerId, slug): stamps the player's accepted version.
//   - publishNewTermsVersion(admin, input): creates a new row, bumping
//     the version number; subsequent player loads will see the banner
//     until they re-accept.
//
// The schema constraint pins slug ∈ {tos, privacy, rg_policy}. The
// players table carries two pairs of accepted_version / accepted_at
// columns (tos + privacy); rg_policy is informational-only for v1 — we
// do not gate actions on it.

import { and, desc, eq } from 'drizzle-orm'

import { type DbExecutor, schema } from '@coinfrenzy/db'

import type { Context } from '../context'
import { writeAuditEntry } from '../audit/index'
import { err, ok, type Result } from '../errors/result'

export type TermsSlug = 'tos' | 'privacy' | 'rg_policy'

export interface CurrentTerms {
  id: string
  slug: TermsSlug
  version: number
  title: string
  bodyHtml: string
  summary: string | null
  effectiveAt: string
}

export async function getCurrentTerms(
  db: DbExecutor,
  slug: TermsSlug,
): Promise<CurrentTerms | null> {
  const rows = await db
    .select()
    .from(schema.termsVersions)
    .where(eq(schema.termsVersions.slug, slug))
    .orderBy(desc(schema.termsVersions.version))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return {
    id: row.id,
    slug: row.slug as TermsSlug,
    version: row.version,
    title: row.title,
    bodyHtml: row.bodyHtml,
    summary: row.summary,
    effectiveAt: row.effectiveAt.toISOString(),
  }
}

export interface OutstandingAcceptance {
  slug: TermsSlug
  currentVersion: number
  acceptedVersion: number | null
  title: string
  summary: string | null
}

/**
 * Returns the slugs the player still needs to (re-)accept. tos and
 * privacy only; rg_policy is informational.
 */
export async function getOutstandingAcceptances(
  db: DbExecutor,
  playerId: string,
): Promise<OutstandingAcceptance[]> {
  const [playerRow] = await db
    .select({
      tosAcceptedVersion: schema.players.tosAcceptedVersion,
      privacyAcceptedVersion: schema.players.privacyAcceptedVersion,
    })
    .from(schema.players)
    .where(eq(schema.players.id, playerId))
    .limit(1)
  if (!playerRow) return []

  const outstanding: OutstandingAcceptance[] = []
  for (const slug of ['tos', 'privacy'] as const) {
    const current = await getCurrentTerms(db, slug)
    if (!current) continue
    const accepted =
      slug === 'tos' ? playerRow.tosAcceptedVersion : playerRow.privacyAcceptedVersion
    if (accepted === null || accepted < current.version) {
      outstanding.push({
        slug,
        currentVersion: current.version,
        acceptedVersion: accepted ?? null,
        title: current.title,
        summary: current.summary,
      })
    }
  }
  return outstanding
}

export interface AcceptTermsInput {
  playerId: string
  slug: TermsSlug
  /** Version the player is acknowledging — must equal the current version. */
  version: number
}

export type AcceptTermsError =
  | { code: 'PLAYER_NOT_FOUND' }
  | { code: 'NO_CURRENT_TERMS' }
  | { code: 'VERSION_MISMATCH'; expected: number; provided: number }

export async function acceptTerms(
  ctx: Context,
  input: AcceptTermsInput,
): Promise<Result<{ acceptedAt: string; version: number }, AcceptTermsError>> {
  const current = await getCurrentTerms(ctx.db, input.slug)
  if (!current) return err({ code: 'NO_CURRENT_TERMS' as const })
  if (current.version !== input.version) {
    return err({
      code: 'VERSION_MISMATCH' as const,
      expected: current.version,
      provided: input.version,
    })
  }

  const [player] = await ctx.db
    .select({ id: schema.players.id })
    .from(schema.players)
    .where(eq(schema.players.id, input.playerId))
    .limit(1)
  if (!player) return err({ code: 'PLAYER_NOT_FOUND' as const })

  const now = new Date()
  const patch =
    input.slug === 'tos'
      ? { tosAcceptedVersion: input.version, tosAcceptedAt: now, updatedAt: now }
      : input.slug === 'privacy'
        ? { privacyAcceptedVersion: input.version, privacyAcceptedAt: now, updatedAt: now }
        : { updatedAt: now }

  await ctx.db.update(schema.players).set(patch).where(eq(schema.players.id, input.playerId))

  await writeAuditEntry(ctx.db, {
    actorKind: 'player',
    actorId: input.playerId,
    action: `terms.${input.slug}.accept`,
    resourceKind: 'terms_version',
    resourceId: current.id,
    after: { slug: input.slug, version: input.version },
  })

  return ok({ acceptedAt: now.toISOString(), version: input.version })
}

export interface PublishTermsInput {
  slug: TermsSlug
  title: string
  bodyHtml: string
  summary?: string | null
  effectiveAt?: Date
}

export async function publishNewTermsVersion(
  ctx: Context,
  input: PublishTermsInput,
): Promise<{ id: string; version: number }> {
  const last = await ctx.db
    .select({ version: schema.termsVersions.version })
    .from(schema.termsVersions)
    .where(eq(schema.termsVersions.slug, input.slug))
    .orderBy(desc(schema.termsVersions.version))
    .limit(1)
  const nextVersion = (last[0]?.version ?? 0) + 1

  const [inserted] = await ctx.db
    .insert(schema.termsVersions)
    .values({
      slug: input.slug,
      version: nextVersion,
      title: input.title,
      bodyHtml: input.bodyHtml,
      summary: input.summary ?? null,
      effectiveAt: input.effectiveAt ?? new Date(),
      createdBy: ctx.actor.kind === 'admin' ? ctx.actor.adminId : null,
    })
    .returning({ id: schema.termsVersions.id })

  await writeAuditEntry(ctx.db, {
    actorKind: ctx.actor.kind === 'admin' ? 'admin' : 'system',
    action: `terms.${input.slug}.publish`,
    resourceKind: 'terms_version',
    resourceId: inserted!.id,
    after: { slug: input.slug, version: nextVersion, title: input.title },
  })

  return { id: inserted!.id, version: nextVersion }
}

/** History view used by the admin terms page. */
export async function listTermsVersions(db: DbExecutor, slug?: TermsSlug): Promise<CurrentTerms[]> {
  const rows = await db
    .select()
    .from(schema.termsVersions)
    .where(slug ? eq(schema.termsVersions.slug, slug) : and())
    .orderBy(desc(schema.termsVersions.effectiveAt))
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug as TermsSlug,
    version: r.version,
    title: r.title,
    bodyHtml: r.bodyHtml,
    summary: r.summary,
    effectiveAt: r.effectiveAt.toISOString(),
  }))
}
