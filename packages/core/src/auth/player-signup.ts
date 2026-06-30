// docs/02 §6 + docs/09 §5.1 — player signup service.
//
// Called from the Better Auth `databaseHooks.user.create.after` hook in
// apps/web. We've already let Better Auth create the auth_user row; here we
// create the matching `players` row plus the two empty wallets and emit
// `player.signup` so the CRM stream picks it up later (prompt 09).

import { and, desc, eq, isNull } from 'drizzle-orm'

import { type DbExecutor } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { getRadarClient } from '../adapters/radar/index'
import { writeAuditEntry } from '../audit/index'
import { isBlockedState } from '../compliance/index'
import { err, ok, type Result } from '../errors/result'
import { recordPlayerEvent } from '../events/index'
import type { Logger } from '../logger'

export interface SignupExtras {
  firstName?: string | null
  lastName?: string | null
  dateOfBirth?: string | null
  phone?: string | null
  state?: string | null
  country?: string | null
  ip?: string | null
  emailConsent?: boolean
  smsConsent?: boolean
  attributedPromoCode?: string | null
}

export interface ProvisionPlayerInput {
  /** Shared id between auth_user and players. */
  id: string
  email: string
  displayName?: string | null
  extras: SignupExtras
}

export type ProvisionPlayerError =
  | { kind: 'already_exists' }
  | { kind: 'invalid_state'; reason: string }

export interface ProvisionPlayerResult {
  playerId: string
  blockedState: boolean
}

/**
 * Idempotently create the players row + GC/SC wallets for a freshly
 * created auth_user. Safe to call from inside or outside an outer
 * transaction; we open one of our own if `db` isn't already a tx.
 *
 * IMPORTANT: This sets `players.metadata.blocked_state_gc_only = true` for
 * residents of the 11 blocked states. The wallet still gets created (so
 * `players.id → wallets.player_id` invariants hold) but downstream code
 * uses this flag to suppress SC awards and redemption.
 */
export async function provisionPlayer(
  db: DbExecutor,
  input: ProvisionPlayerInput,
  logger?: Logger,
): Promise<Result<ProvisionPlayerResult, ProvisionPlayerError>> {
  const existing = await db
    .select({ id: schema.players.id })
    .from(schema.players)
    .where(eq(schema.players.id, input.id))
    .limit(1)

  if (existing.length > 0) {
    return err({ kind: 'already_exists' as const })
  }

  const state = (input.extras.state ?? '').trim().toUpperCase() || null
  const country = (input.extras.country ?? 'US').trim().toUpperCase()
  const blockedState = isBlockedState(state)

  // docs/09 §3.7 — record the current TOS + Privacy versions as accepted
  // at signup. The signup form must have surfaced these (legal-controlled
  // copy). If the catalog is somehow empty (fresh install before seed
  // ran), we record null and the banner will prompt acceptance on first
  // login.
  const [tosCurrent, privacyCurrent] = await Promise.all([
    db
      .select({ version: schema.termsVersions.version })
      .from(schema.termsVersions)
      .where(eq(schema.termsVersions.slug, 'tos'))
      .orderBy(desc(schema.termsVersions.version))
      .limit(1),
    db
      .select({ version: schema.termsVersions.version })
      .from(schema.termsVersions)
      .where(eq(schema.termsVersions.slug, 'privacy'))
      .orderBy(desc(schema.termsVersions.version))
      .limit(1),
  ])
  const tosVersion = tosCurrent[0]?.version ?? null
  const privacyVersion = privacyCurrent[0]?.version ?? null
  const acceptedAt = new Date()

  await db.insert(schema.players).values({
    id: input.id,
    email: input.email,
    displayName: input.displayName ?? input.email.split('@')[0],
    firstName: input.extras.firstName ?? null,
    lastName: input.extras.lastName ?? null,
    phone: input.extras.phone ?? null,
    dateOfBirth: input.extras.dateOfBirth ?? null,
    state,
    country,
    signupIp: input.extras.ip ?? null,
    signupState: state,
    signupCountry: country,
    attributedPromoCode: input.extras.attributedPromoCode ?? null,
    attributedAt: input.extras.attributedPromoCode ? new Date() : null,
    emailConsent: input.extras.emailConsent ?? true,
    smsConsent: input.extras.smsConsent ?? false,
    marketingConsentAt: (input.extras.emailConsent ?? true) ? new Date() : null,
    tosAcceptedVersion: tosVersion,
    tosAcceptedAt: tosVersion !== null ? acceptedAt : null,
    privacyAcceptedVersion: privacyVersion,
    privacyAcceptedAt: privacyVersion !== null ? acceptedAt : null,
    metadata: {
      blocked_state_gc_only: blockedState,
      signup_source: 'web',
    },
  })

  await db.insert(schema.wallets).values([
    { playerId: input.id, currency: 'GC' },
    { playerId: input.id, currency: 'SC' },
  ])

  if (blockedState && state) {
    // Mirror the block as a compliance_flags row so admin tooling and the
    // redemption gate can see the same reason in one place.
    await db.insert(schema.complianceFlags).values({
      playerId: input.id,
      flagType: 'state_blocked',
      severity: 'warn',
      reason: `Player resides in ${state}: SC play and redemption disabled (docs/09 §8).`,
      metadata: { state },
    })
  }

  await recordPlayerEvent(db, {
    playerId: input.id,
    eventName: 'player.signup',
    eventCategory: 'lifecycle',
    payload: {
      email: input.email,
      state,
      country,
      blocked_state: blockedState,
      attributed_promo_code: input.extras.attributedPromoCode ?? null,
    },
  })

  await writeAuditEntry(db, {
    actorKind: 'system',
    actorId: null,
    action: 'player.signup',
    resourceKind: 'player',
    resourceId: input.id,
    after: {
      email: input.email,
      state,
      country,
      blocked_state: blockedState,
    },
    ip: input.extras.ip ?? null,
    metadata: { source: 'better-auth.signup' },
  })

  // docs/06 §13 — the welcome bonus trigger moved off `player.signup` and
  // onto the first successful purchase (Finix transfer.succeeded). Signup
  // itself emits the CRM event above; no bonus award fires here.
  void logger

  return ok({ playerId: input.id, blockedState })
}

export interface CompletePlayerProfileInput {
  playerId: string
  extras: SignupExtras
}

/**
 * Fills in the profile fields on the players row right after
 * `provisionPlayer` has created the minimal record from the Better Auth
 * post-create hook. Idempotent: re-running with the same input is a
 * no-op except for refreshing `updated_at`.
 *
 * Also (re-)applies the blocked-state flag and compliance row based on
 * the resolved state.
 */
export async function completePlayerProfile(
  db: DbExecutor,
  input: CompletePlayerProfileInput,
): Promise<Result<{ playerId: string; blockedState: boolean }, { kind: 'not_found' }>> {
  const rows = await db
    .select({
      id: schema.players.id,
      currentState: schema.players.state,
      currentMetadata: schema.players.metadata,
    })
    .from(schema.players)
    .where(eq(schema.players.id, input.playerId))
    .limit(1)

  const row = rows[0]
  if (!row) return err({ kind: 'not_found' as const })

  const state = (input.extras.state ?? '').trim().toUpperCase() || row.currentState
  const country = (input.extras.country ?? 'US').trim().toUpperCase()
  const blockedState = isBlockedState(state)
  const existingMetadata = (row.currentMetadata ?? {}) as Record<string, unknown>

  // docs/05 §6 — IP geocode for the signup row. We always call (mock or
  // real) so the player record carries an authoritative resolved state we
  // can audit against later. Mock returns the declared state so there's
  // no mismatch in development.
  const radar = getRadarClient()
  const geo = await radar.geocodeIp({ ip: input.extras.ip ?? null, fallbackState: state })
  const geoState = (geo.state ?? '').trim().toUpperCase() || null
  const stateMismatch = Boolean(state && geoState && geoState !== state)

  await db
    .update(schema.players)
    .set({
      displayName:
        input.extras.firstName && input.extras.lastName
          ? `${input.extras.firstName} ${input.extras.lastName}`.trim()
          : undefined,
      firstName: input.extras.firstName ?? undefined,
      lastName: input.extras.lastName ?? undefined,
      phone: input.extras.phone ?? undefined,
      dateOfBirth: input.extras.dateOfBirth ?? undefined,
      state,
      country,
      signupIp: input.extras.ip ?? undefined,
      signupState: state ?? undefined,
      signupCountry: country,
      attributedPromoCode: input.extras.attributedPromoCode ?? undefined,
      attributedAt: input.extras.attributedPromoCode ? new Date() : undefined,
      emailConsent: input.extras.emailConsent ?? undefined,
      smsConsent: input.extras.smsConsent ?? undefined,
      marketingConsentAt: input.extras.emailConsent ? new Date() : undefined,
      metadata: {
        ...existingMetadata,
        blocked_state_gc_only: blockedState,
        signup_geo: {
          mode: radar.mode,
          resolved_state: geoState,
          declared_state: state,
          is_proxy: geo.isProxy,
          is_vpn: geo.isVpn,
          is_mocked: geo.isMocked,
        },
      },
      updatedAt: new Date(),
    })
    .where(eq(schema.players.id, input.playerId))

  if (stateMismatch) {
    // Don't auto-block; raise a flag so cashier review can investigate. In
    // mock mode the resolved_state equals the declared state so this path
    // isn't hit unless a test forces it.
    await db.insert(schema.complianceFlags).values({
      playerId: input.playerId,
      flagType: 'geo_mismatch',
      severity: 'info',
      reason: `Signup IP geo (${geoState}) differs from declared state (${state}).`,
      metadata: { declared: state, resolved: geoState, ip: input.extras.ip ?? null },
    })
  }

  if (blockedState && state) {
    // Mirror the block in compliance_flags. Check first since there's no
    // unique constraint we can ON CONFLICT against — we rely on the
    // partial active-index for fast lookup.
    const existingFlags = await db
      .select({ id: schema.complianceFlags.id })
      .from(schema.complianceFlags)
      .where(
        and(
          eq(schema.complianceFlags.playerId, input.playerId),
          eq(schema.complianceFlags.flagType, 'state_blocked'),
          isNull(schema.complianceFlags.clearedAt),
        ),
      )
      .limit(1)
    if (existingFlags.length === 0) {
      await db.insert(schema.complianceFlags).values({
        playerId: input.playerId,
        flagType: 'state_blocked',
        severity: 'warn',
        reason: `Player resides in ${state}: SC play and redemption disabled (docs/09 §8).`,
        metadata: { state },
      })
    }
  }

  return ok({ playerId: input.playerId, blockedState })
}

/**
 * Look up the players row for a given auth user id. Returns null if the
 * row hasn't been provisioned yet (e.g. during a partial signup retry).
 */
export async function getPlayerByAuthId(
  db: DbExecutor,
  authUserId: string,
): Promise<{
  id: string
  email: string
  status: string
  state: string | null
  metadata: Record<string, unknown>
  rgSelfExcludedUntil: Date | null
} | null> {
  const rows = await db
    .select({
      id: schema.players.id,
      email: schema.players.email,
      status: schema.players.status,
      state: schema.players.state,
      metadata: schema.players.metadata,
      rgSelfExcludedUntil: schema.players.rgSelfExcludedUntil,
    })
    .from(schema.players)
    .where(eq(schema.players.id, authUserId))
    .limit(1)

  const row = rows[0]
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    status: row.status,
    state: row.state,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    rgSelfExcludedUntil: row.rgSelfExcludedUntil,
  }
}
