// docs/13 §2.8 — affiliates importer.
//
// Gamma's Affiliate Report exports: ID, username, email, full name,
// rev share %, status, total campaigns, total signups, created date.
// Each row becomes one `affiliates` row. The player <-> affiliate
// linkage (affiliate_attribution) comes from the purchase report's
// "Affiliate Id" column, handled in import-purchases.ts.

import { eq } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import { dashToNull, lower, parseDatetime, parseMoney } from './transforms'
import type { ParsedCsv, RunContext } from './types'

export async function importAffiliates(rc: RunContext, file: ParsedCsv): Promise<void> {
  const { ctx } = rc
  let rowsImported = 0
  let rowsFailed = 0
  let rowsSkipped = 0

  for (let i = 0; i < file.rows.length; i++) {
    const raw = file.rows[i]
    const rowNumber = i + 2
    try {
      const gammaAffiliateId = (raw['Affiliate Id'] ?? raw['ID'] ?? raw['Id'] ?? '').trim()
      if (!gammaAffiliateId) {
        rowsSkipped++
        continue
      }

      const email = lower(raw['Email'] ?? raw['User email'] ?? '')
      const username = dashToNull(raw['Username'] ?? '')
      if (!email || !username) {
        rc.errors.push({
          sourceFile: file.filename,
          sourceRowNumber: rowNumber,
          sourceRowId: gammaAffiliateId,
          sourceRowSnapshot: raw,
          errorCode: 'missing_required',
          errorMessage: 'Affiliate row missing email or username',
        })
        rowsFailed++
        continue
      }

      const displayName = dashToNull(raw['Full Name'] ?? raw['Name'] ?? '')
      const revSharePctRaw = parseMoney(raw['Rev Share %'] ?? raw['Revenue Share'] ?? '0')
      // The DB column is numeric(5,4); store percent as a fraction 0-1
      const revSharePct = clampFraction(parseFloat(revSharePctRaw) / 100)
      const status = parseAffiliateStatus(raw['Status'] ?? '')
      const createdAt = parseDatetime(raw['Created Date'] ?? raw['Registration Date'] ?? '')

      const existing = await ctx.db
        .select({ id: schema.affiliates.id })
        .from(schema.affiliates)
        .where(eq(schema.affiliates.gammaAffiliateId, gammaAffiliateId))
        .limit(1)

      let affiliateId: string
      if (existing[0]) {
        affiliateId = existing[0].id
        await ctx.db
          .update(schema.affiliates)
          .set({
            email,
            username,
            displayName,
            revenueSharePct: revSharePct.toFixed(4),
            status,
            updatedAt: new Date(),
          })
          .where(eq(schema.affiliates.id, affiliateId))
      } else {
        const inserted = await ctx.db
          .insert(schema.affiliates)
          .values({
            username,
            email,
            displayName,
            revenueSharePct: revSharePct.toFixed(4),
            status,
            gammaAffiliateId,
            createdAt: createdAt ? new Date(createdAt) : undefined,
          })
          .returning({ id: schema.affiliates.id })
        affiliateId = inserted[0].id
      }

      await ctx.db
        .insert(schema.migrationIdMap)
        .values({
          sourceTable: 'affiliates',
          gammaId: gammaAffiliateId,
          casinoId: affiliateId,
        })
        .onConflictDoNothing({
          target: [schema.migrationIdMap.sourceTable, schema.migrationIdMap.gammaId],
        })

      rowsImported++
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      rc.errors.push({
        sourceFile: file.filename,
        sourceRowNumber: rowNumber,
        sourceRowSnapshot: raw,
        errorCode: 'affiliates_import_failed',
        errorMessage: message,
      })
      rowsFailed++
    }
  }

  rc.summaries.push({
    sourceFile: file.filename,
    tableName: 'affiliates',
    rowsInSource: file.rows.length,
    rowsImported,
    rowsSkipped,
    rowsFailed,
    status:
      rowsFailed > 0 && rowsImported === 0 ? 'failed' : rowsFailed > 0 ? 'partial' : 'success',
  })
}

function parseAffiliateStatus(raw: string): 'active' | 'inactive' | 'banned' {
  const v = (raw ?? '').toString().trim().toLowerCase()
  if (v === 'active') return 'active'
  if (v === 'inactive' || v === 'in-active') return 'inactive'
  if (v === 'banned' || v === 'suspended') return 'banned'
  return 'active'
}

function clampFraction(v: number): number {
  if (!Number.isFinite(v) || v < 0) return 0
  if (v > 1) return 1
  return v
}
