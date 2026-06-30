// docs/13 §2.1 + §3.4 + §4.1-§4.5 — players importer.
//
// Idempotent: keyed on players.gamma_user_id, so re-running on the same
// snapshot UPDATES the row instead of duplicating. The importer:
//   1. Parses each Gamma row into a player upsert payload.
//   2. Inserts or updates the players row.
//   3. Records the mapping in migration_id_map.
//   4. Creates wallets if absent (currentBalance is filled later by
//      synthetic ledger entries; left at 0 here for safety).
//   5. Parses the rsg freetext column. Self-exclusion and time-break
//      become compliance_flags rows; unknown patterns go to the
//      migration_review_queue.

import { and, eq, sql } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import { dashToNull, lower, parseDatetime, parseStatus, parseStatusKnown } from './transforms'
import { parseRsgFreetext, type RsgParseResult } from './transforms-rsg'
import type { ParsedCsv, RunContext } from './types'

interface PlayerRowParsed {
  gammaUserId: string
  email: string | null
  username: string | null
  displayName: string | null
  status: string
  statusKnown: boolean
  registrationDate: string | null
  lastLogin: string | null
  rsg: RsgParseResult
  rawRsg: string
}

export async function importPlayers(rc: RunContext, file: ParsedCsv): Promise<void> {
  const { ctx, runId, snapshotDate } = rc
  let rowsImported = 0
  const rowsSkipped = 0
  let rowsFailed = 0

  for (let i = 0; i < file.rows.length; i++) {
    const raw = file.rows[i]
    const rowNumber = i + 2 // +1 for header, +1 for 1-indexed
    try {
      const parsed = parsePlayerRow(raw)

      if (!parsed.gammaUserId) {
        rc.errors.push({
          sourceFile: file.filename,
          sourceRowNumber: rowNumber,
          sourceRowSnapshot: raw,
          errorCode: 'missing_gamma_user_id',
          errorMessage: 'Gamma row has no User Id',
        })
        rowsFailed++
        continue
      }

      if (!parsed.email) {
        rc.errors.push({
          sourceFile: file.filename,
          sourceRowNumber: rowNumber,
          sourceRowId: parsed.gammaUserId,
          sourceRowSnapshot: raw,
          errorCode: 'missing_email',
          errorMessage: 'Gamma row has no User email',
        })
        rowsFailed++
        continue
      }

      // Upsert by gamma_user_id (idempotent across re-runs)
      const existingByGamma = await ctx.db
        .select({ id: schema.players.id })
        .from(schema.players)
        .where(eq(schema.players.gammaUserId, parsed.gammaUserId))
        .limit(1)

      type PlayerStatus =
        | 'active'
        | 'suspended'
        | 'self_excluded'
        | 'closed'
        | 'internal'
        | 'restricted'
      const status = parsed.status as PlayerStatus

      let playerId: string
      if (existingByGamma[0]) {
        playerId = existingByGamma[0].id
        await ctx.db
          .update(schema.players)
          .set({
            email: parsed.email,
            username: parsed.username,
            displayName: parsed.displayName,
            status,
            lastLoginAt: parsed.lastLogin ? new Date(parsed.lastLogin) : null,
            updatedAt: new Date(),
          })
          .where(eq(schema.players.id, playerId))
      } else {
        // Also dedupe on email — Gamma may export a row that previously
        // landed via signup. The email column is UNIQUE so we must merge.
        const existingByEmail = await ctx.db
          .select({ id: schema.players.id })
          .from(schema.players)
          .where(eq(schema.players.email, parsed.email))
          .limit(1)

        if (existingByEmail[0]) {
          playerId = existingByEmail[0].id
          await ctx.db
            .update(schema.players)
            .set({
              gammaUserId: parsed.gammaUserId,
              username: parsed.username,
              displayName: parsed.displayName,
              status,
              lastLoginAt: parsed.lastLogin ? new Date(parsed.lastLogin) : null,
              updatedAt: new Date(),
            })
            .where(eq(schema.players.id, playerId))
        } else {
          const inserted = await ctx.db
            .insert(schema.players)
            .values({
              email: parsed.email,
              username: parsed.username,
              displayName: parsed.displayName,
              status,
              firstSeenAt: parsed.registrationDate
                ? new Date(parsed.registrationDate)
                : new Date(snapshotDate),
              lastLoginAt: parsed.lastLogin ? new Date(parsed.lastLogin) : null,
              gammaUserId: parsed.gammaUserId,
              signupSource: 'migration_gamma',
            })
            .returning({ id: schema.players.id })
          playerId = inserted[0].id
        }
      }

      // Record the ID mapping (idempotent)
      await ctx.db
        .insert(schema.migrationIdMap)
        .values({
          sourceTable: 'players',
          gammaId: parsed.gammaUserId,
          casinoId: playerId,
        })
        .onConflictDoNothing({
          target: [schema.migrationIdMap.sourceTable, schema.migrationIdMap.gammaId],
        })

      // Ensure both wallets exist
      await ensureWallet(rc, playerId, 'GC')
      await ensureWallet(rc, playerId, 'SC')

      // Translate the rsg freetext to compliance_flags or review queue
      await applyRsg(rc, file.filename, raw, playerId, parsed)

      // Unknown status -> add to review queue so master can re-categorize
      if (!parsed.statusKnown) {
        rc.reviews.push({
          kind: 'unknown_status',
          sourceFile: file.filename,
          sourceRowId: parsed.gammaUserId,
          sourceRowSnapshot: raw,
          sourceText: raw['Status'] ?? null,
          playerId,
          suggestion: { fallback: 'active' },
        })
      }

      rowsImported++
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      rc.errors.push({
        sourceFile: file.filename,
        sourceRowNumber: rowNumber,
        sourceRowId: raw['User Id'] ?? null,
        sourceRowSnapshot: raw,
        errorCode: 'players_import_failed',
        errorMessage: message,
      })
      rowsFailed++
    }
  }

  rc.summaries.push({
    sourceFile: file.filename,
    tableName: 'players',
    rowsInSource: file.rows.length,
    rowsImported,
    rowsSkipped,
    rowsFailed,
    status:
      rowsFailed > 0 && rowsImported === 0 ? 'failed' : rowsFailed > 0 ? 'partial' : 'success',
  })

  // Reference the run id to silence unused warnings (used by error logs above)
  void runId
}

function parsePlayerRow(raw: Record<string, string>): PlayerRowParsed {
  const rsgValue = raw['rsg'] ?? raw['RSG'] ?? ''
  return {
    gammaUserId: (raw['User Id'] ?? '').trim(),
    email: lower(raw['User email'] ?? '') as string | null,
    username: dashToNull(raw['Username'] ?? ''),
    displayName: dashToNull(raw['Name'] ?? ''),
    status: parseStatus(raw['Status'] ?? ''),
    statusKnown: parseStatusKnown(raw['Status'] ?? ''),
    registrationDate: parseDatetime(raw['Registration Date'] ?? ''),
    lastLogin: parseDatetime(raw['Last Login'] ?? ''),
    rsg: parseRsgFreetext(rsgValue),
    rawRsg: rsgValue,
  }
}

async function ensureWallet(
  rc: RunContext,
  playerId: string,
  currency: 'GC' | 'SC',
): Promise<void> {
  const { ctx } = rc
  await ctx.db
    .insert(schema.wallets)
    .values({
      playerId,
      currency,
    })
    .onConflictDoNothing({
      target: [schema.wallets.playerId, schema.wallets.currency],
    })
}

async function applyRsg(
  rc: RunContext,
  sourceFile: string,
  raw: Record<string, string>,
  playerId: string,
  parsed: PlayerRowParsed,
): Promise<void> {
  const { ctx } = rc
  const result = parsed.rsg

  if (result.kind === 'empty') {
    // Nothing to do — but if a prior import created a migration-sourced
    // flag and Gamma cleared it on their side, we DO NOT auto-clear; a
    // human must make that call (cleared = open the door for the player
    // to deposit again). docs/13 §4.3 last paragraph.
    return
  }

  if (result.kind === 'unknown') {
    rc.reviews.push({
      kind: 'unknown_rsg',
      sourceFile,
      sourceRowId: parsed.gammaUserId,
      sourceRowSnapshot: raw,
      sourceText: result.source,
      playerId,
      suggestion: { possible_flag_types: ['self_exclusion', 'rg_time_break'] },
    })
    return
  }

  const flagType = result.kind
  const expires = result.expiresAt ? new Date(result.expiresAt) : null
  const reason = result.reason

  // Idempotent: only insert if no active flag of this type exists.
  const existing = await ctx.db
    .select({ id: schema.complianceFlags.id })
    .from(schema.complianceFlags)
    .where(
      and(
        eq(schema.complianceFlags.playerId, playerId),
        eq(schema.complianceFlags.flagType, flagType),
        sql`${schema.complianceFlags.clearedAt} is null`,
      ),
    )
    .limit(1)

  if (existing[0]) {
    // Refresh expiry from the latest snapshot so date pushes preserve
    await ctx.db
      .update(schema.complianceFlags)
      .set({
        expiresAt: expires,
        importedSourceText: result.source,
      })
      .where(eq(schema.complianceFlags.id, existing[0].id))
    return
  }

  await ctx.db.insert(schema.complianceFlags).values({
    playerId,
    flagType,
    severity: 'block',
    reason,
    expiresAt: expires,
    importedFrom: 'gamma_migration',
    importedSourceText: result.source,
  })

  // Mirror permanent self-exclusion into the players.rg_self_excluded_until
  // column so the standard RG-gate check picks it up. For time breaks we
  // also write the expiry there. Both writes are no-ops if the same value
  // is already present.
  if (flagType === 'self_exclusion' || flagType === 'rg_time_break') {
    await ctx.db
      .update(schema.players)
      .set({
        rgSelfExcludedUntil: expires ?? new Date('9999-12-31T23:59:59Z'),
        statusReason: reason,
      })
      .where(eq(schema.players.id, playerId))
  }
}
