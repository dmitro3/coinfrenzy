// docs/13 §2.5 — redemptions importer.
//
// Per the doc: Gamma's redeem_requests_data.csv only exports Status=Success
// rows (failed/pending redemptions don't affect balance). We import each
// row as a `redemptions` row with status='paid', and write a balanced
// 4-entry ledger transaction representing the historical movement:
//   1) debit  player_wallet 'earned' SC  amount_sc
//   2) credit external                   amount_sc   (SC left the system)
//   3) debit  house_bank USD             amount_usd
//   4) credit external                   amount_usd  (USD left to bank)
//
// The 'earned' sub-bucket is used as the default — historical redemptions
// could have drained from any redeemable bucket, but Gamma doesn't expose
// the per-bucket breakdown. 'earned' is the broad post-playthrough bucket
// and using it consistently keeps the post-migration balance arithmetic
// predictable.

import { eq } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import { write as ledgerWrite } from '../ledger/write'
import { numericStringToBigint } from '../ledger/money'
import type { TransactionSpec } from '../ledger/types'

import { dashToNull, parseDatetime, parseMethod, parseMoney } from './transforms'
import type { ParsedCsv, RunContext } from './types'

interface GammaRedemptionRow {
  gammaRedemptionId: string
  gammaUserId: string
  amountSc: bigint
  amountUsd: bigint
  finixTransferId: string | null
  bankAccountMaskedRef: string | null
  method: string
  status: 'paid' | 'rejected' | 'failed' | 'cancelled'
  requestedAt: Date | null
  paidAt: Date | null
}

export async function importRedemptions(rc: RunContext, file: ParsedCsv): Promise<void> {
  const { ctx } = rc
  let rowsImported = 0
  let rowsSkipped = 0
  let rowsFailed = 0

  for (let i = 0; i < file.rows.length; i++) {
    const raw = file.rows[i]
    const rowNumber = i + 2
    try {
      const parsed = parseRedemptionRow(raw)
      if (!parsed.gammaRedemptionId) {
        rowsSkipped++
        continue
      }

      // Find player
      const playerRows = await ctx.db
        .select({ id: schema.players.id })
        .from(schema.players)
        .where(eq(schema.players.gammaUserId, parsed.gammaUserId))
        .limit(1)
      const player = playerRows[0]
      if (!player) {
        rc.errors.push({
          sourceFile: file.filename,
          sourceRowNumber: rowNumber,
          sourceRowId: parsed.gammaRedemptionId,
          sourceRowSnapshot: raw,
          errorCode: 'redemption_player_not_found',
          errorMessage: `No player with gamma_user_id ${parsed.gammaUserId}`,
        })
        rowsFailed++
        continue
      }

      // Upsert redemptions row
      const existing = await ctx.db
        .select({ id: schema.redemptions.id })
        .from(schema.redemptions)
        .where(eq(schema.redemptions.gammaRedemptionId, parsed.gammaRedemptionId))
        .limit(1)

      let redemptionId: string
      if (existing[0]) {
        redemptionId = existing[0].id
        await ctx.db
          .update(schema.redemptions)
          .set({
            playerId: player.id,
            amountSc: parsed.amountSc,
            amountUsd: parsed.amountUsd,
            method: parsed.method as 'finix_ach' | 'apt_debit',
            finixTransferId: parsed.finixTransferId,
            status: parsed.status,
            paidAt: parsed.paidAt,
            requestedAt: parsed.requestedAt ?? new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.redemptions.id, redemptionId))
      } else {
        const inserted = await ctx.db
          .insert(schema.redemptions)
          .values({
            playerId: player.id,
            amountSc: parsed.amountSc,
            amountUsd: parsed.amountUsd,
            method: parsed.method as 'finix_ach' | 'apt_debit',
            drainPlan: {
              steps: [{ bucket: 'earned', amount: parsed.amountSc.toString() }],
              source: 'gamma_migration',
            },
            finixTransferId: parsed.finixTransferId,
            status: parsed.status,
            paidAt: parsed.paidAt,
            requestedAt: parsed.requestedAt ?? new Date(),
            gammaRedemptionId: parsed.gammaRedemptionId,
          })
          .returning({ id: schema.redemptions.id })
        redemptionId = inserted[0].id
      }

      // Ledger entries — only for paid redemptions
      if (parsed.status === 'paid' && parsed.amountSc > 0n) {
        const spec: TransactionSpec = {
          source: 'migration',
          sourceId: `redemption:${parsed.gammaRedemptionId}`,
          playerId: player.id,
          entries: [
            {
              leg: 'debit',
              accountKind: 'player_wallet',
              amount: parsed.amountSc,
              currency: 'SC',
              playerId: player.id,
              subBucket: 'earned',
            },
            {
              leg: 'credit',
              accountKind: 'external',
              amount: parsed.amountSc,
              currency: 'SC',
            },
            {
              leg: 'debit',
              accountKind: 'house_bank',
              amount: parsed.amountUsd,
              currency: 'USD',
            },
            {
              leg: 'credit',
              accountKind: 'external',
              amount: parsed.amountUsd,
              currency: 'USD',
            },
          ],
          metadata: {
            kind: 'migration_redemption',
            gamma_redemption_id: parsed.gammaRedemptionId,
            redemption_id: redemptionId,
          },
        }

        const result = await ledgerWrite(ctx, spec)
        if (!result.ok) {
          rc.errors.push({
            sourceFile: file.filename,
            sourceRowNumber: rowNumber,
            sourceRowId: parsed.gammaRedemptionId,
            sourceRowSnapshot: raw,
            errorCode: 'ledger_write_failed',
            errorMessage: result.error.code,
          })
          rowsFailed++
          continue
        }
      }

      await ctx.db
        .insert(schema.migrationIdMap)
        .values({
          sourceTable: 'redemptions',
          gammaId: parsed.gammaRedemptionId,
          casinoId: redemptionId,
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
        errorCode: 'redemptions_import_failed',
        errorMessage: message,
      })
      rowsFailed++
    }
  }

  rc.summaries.push({
    sourceFile: file.filename,
    tableName: 'redemptions',
    rowsInSource: file.rows.length,
    rowsImported,
    rowsSkipped,
    rowsFailed,
    status:
      rowsFailed > 0 && rowsImported === 0 ? 'failed' : rowsFailed > 0 ? 'partial' : 'success',
  })
}

function parseRedemptionRow(raw: Record<string, string>): GammaRedemptionRow {
  const scStr = parseMoney(raw['SC Amount'] ?? raw['Amount SC'] ?? raw['Amount'] ?? '0')
  const usdStr = parseMoney(raw['USD Amount'] ?? raw['Amount USD'] ?? scStr)
  const statusRaw = (raw['Status'] ?? '').trim().toLowerCase()
  let status: GammaRedemptionRow['status']
  if (statusRaw === 'success' || statusRaw === 'paid' || statusRaw === 'completed') {
    status = 'paid'
  } else if (statusRaw === 'canceled' || statusRaw === 'cancelled') {
    status = 'cancelled'
  } else if (statusRaw === 'rejected' || statusRaw === 'denied') {
    status = 'rejected'
  } else {
    status = 'failed'
  }

  return {
    gammaRedemptionId: (raw['Transaction Id'] ?? raw['Id'] ?? '').trim(),
    gammaUserId: (raw['User Id'] ?? '').trim(),
    amountSc: numericStringToBigint(scStr),
    amountUsd: numericStringToBigint(usdStr),
    finixTransferId: dashToNull(raw['Finix Transfer Id'] ?? ''),
    bankAccountMaskedRef: dashToNull(raw['Bank Account'] ?? raw['Account'] ?? ''),
    method: parseMethod(raw['Payment Provider'] ?? ''),
    status,
    requestedAt: (() => {
      const d = parseDatetime(raw['Requested At'] ?? raw['Created At'] ?? '')
      return d ? new Date(d) : null
    })(),
    paidAt: (() => {
      const d = parseDatetime(raw['Paid At'] ?? raw['Completed At'] ?? '')
      return d ? new Date(d) : null
    })(),
  }
}
