// docs/13 §2.4 + §4.8 — purchases importer.
//
// Imports rows from Gamma's transactions_banking_data.csv into the
// `purchases` table AND writes the corresponding 6-entry ledger
// transaction for successful purchases (docs/04 §3.1). Cancelled and
// failed Gamma purchases are recorded for funnel analysis but write
// NO ledger entries (no money moved).
//
// Idempotency:
//   - `purchases.gamma_transaction_id` is UNIQUE — re-runs UPSERT.
//   - The ledger `source = 'migration'`, `source_id = gamma_transaction_id`
//     combination is UNIQUE — re-runs no-op via duplicate detection.

import { eq } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import { write as ledgerWrite } from '../ledger/write'
import { numericStringToBigint } from '../ledger/money'
import { buildPurchase } from '../ledger/transactions/purchase'

import { dashToNull, parseDatetime, parseMoney } from './transforms'
import type { ParsedCsv, RunContext } from './types'

interface GammaPurchaseRow {
  gammaTxId: string
  gammaUserId: string
  amountUsd: bigint
  status: 'completed' | 'failed' | 'cancelled'
  finixTransferId: string | null
  cardLast4: string | null
  cardBrand: string | null
  threeDsResult: string | null
  baseGc: bigint
  baseSc: bigint
  bonusSc: bigint
  createdAt: Date | null
  isInternalAccount: boolean
}

export async function importPurchases(rc: RunContext, file: ParsedCsv): Promise<void> {
  const { ctx } = rc
  let rowsImported = 0
  let rowsSkipped = 0
  let rowsFailed = 0

  for (let i = 0; i < file.rows.length; i++) {
    const raw = file.rows[i]
    const rowNumber = i + 2

    try {
      const parsed = parsePurchaseRow(raw)
      if (!parsed.gammaTxId) {
        rowsSkipped++
        continue
      }

      // Find the player by gamma_user_id
      const playerRows = await ctx.db
        .select({ id: schema.players.id, isInternalAccount: schema.players.isInternalAccount })
        .from(schema.players)
        .where(eq(schema.players.gammaUserId, parsed.gammaUserId))
        .limit(1)

      const player = playerRows[0]
      if (!player) {
        rc.errors.push({
          sourceFile: file.filename,
          sourceRowNumber: rowNumber,
          sourceRowId: parsed.gammaTxId,
          sourceRowSnapshot: raw,
          errorCode: 'purchase_player_not_found',
          errorMessage: `No player with gamma_user_id ${parsed.gammaUserId}`,
        })
        rowsFailed++
        continue
      }

      // Upsert purchases row by gamma_transaction_id
      const existing = await ctx.db
        .select({ id: schema.purchases.id, status: schema.purchases.status })
        .from(schema.purchases)
        .where(eq(schema.purchases.gammaTransactionId, parsed.gammaTxId))
        .limit(1)

      let purchaseId: string
      const amountCents = parsed.amountUsd / 100n

      if (existing[0]) {
        purchaseId = existing[0].id
        await ctx.db
          .update(schema.purchases)
          .set({
            playerId: player.id,
            amountUsd: parsed.amountUsd,
            amountCents,
            baseGc: parsed.baseGc,
            baseSc: parsed.baseSc,
            bonusSc: parsed.bonusSc,
            finixTransferId: parsed.finixTransferId,
            finixCardLast4: parsed.cardLast4,
            finixCardBrand: parsed.cardBrand,
            finix3dsResult: parsed.threeDsResult,
            status: parsed.status,
            completedAt: parsed.status === 'completed' ? parsed.createdAt : null,
            updatedAt: new Date(),
          })
          .where(eq(schema.purchases.id, purchaseId))
      } else {
        const inserted = await ctx.db
          .insert(schema.purchases)
          .values({
            playerId: player.id,
            amountUsd: parsed.amountUsd,
            amountCents,
            baseGc: parsed.baseGc,
            baseSc: parsed.baseSc,
            bonusSc: parsed.bonusSc,
            finixTransferId: parsed.finixTransferId,
            finixCardLast4: parsed.cardLast4,
            finixCardBrand: parsed.cardBrand,
            finix3dsResult: parsed.threeDsResult,
            status: parsed.status,
            createdAt: parsed.createdAt ?? undefined,
            completedAt: parsed.status === 'completed' ? parsed.createdAt : null,
            gammaTransactionId: parsed.gammaTxId,
            failureReason: parsed.status === 'failed' ? 'unknown_legacy' : null,
          })
          .returning({ id: schema.purchases.id })
        purchaseId = inserted[0].id
      }

      // Only successful purchases write ledger entries
      if (parsed.status === 'completed' && parsed.amountUsd > 0n) {
        const spec = buildPurchase({
          finixTransferId: `migration:${parsed.gammaTxId}`,
          purchaseId,
          playerId: player.id,
          isInternalAccount: player.isInternalAccount,
          amountUsd: parsed.amountUsd,
          gcAwarded: parsed.baseGc,
          scSplit: {
            purchased: parsed.baseSc,
            bonus: parsed.bonusSc,
            promo: 0n,
          },
        })
        // Override the source to 'migration' so the ledger immutability
        // trigger + reporting can distinguish migrated entries.
        const migrationSpec = {
          ...spec,
          source: 'migration' as const,
          sourceId: parsed.gammaTxId,
        }
        const result = await ledgerWrite(ctx, migrationSpec)
        if (!result.ok) {
          rc.errors.push({
            sourceFile: file.filename,
            sourceRowNumber: rowNumber,
            sourceRowId: parsed.gammaTxId,
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
          sourceTable: 'purchases',
          gammaId: parsed.gammaTxId,
          casinoId: purchaseId,
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
        errorCode: 'purchases_import_failed',
        errorMessage: message,
      })
      rowsFailed++
    }
  }

  rc.summaries.push({
    sourceFile: file.filename,
    tableName: 'purchases',
    rowsInSource: file.rows.length,
    rowsImported,
    rowsSkipped,
    rowsFailed,
    status:
      rowsFailed > 0 && rowsImported === 0 ? 'failed' : rowsFailed > 0 ? 'partial' : 'success',
  })
}

function parsePurchaseRow(raw: Record<string, string>): GammaPurchaseRow {
  const gammaTxId = (raw['Transaction Id'] ?? raw['Id'] ?? '').trim()
  const gammaUserId = (raw['User Id'] ?? '').trim()
  const amountStr = parseMoney(raw['Amount'] ?? raw['Total Amount'] ?? '0')
  const amountUsd = numericStringToBigint(amountStr)
  const statusRaw = (raw['Status'] ?? '').trim().toLowerCase()
  let status: GammaPurchaseRow['status']
  if (statusRaw === 'success' || statusRaw === 'successful' || statusRaw === 'completed') {
    status = 'completed'
  } else if (statusRaw === 'canceled' || statusRaw === 'cancelled') {
    status = 'cancelled'
  } else if (statusRaw === 'failed' || statusRaw === 'failure' || statusRaw === '') {
    status = 'failed'
  } else {
    status = 'failed'
  }

  const baseGcStr = parseMoney(raw['Base GC'] ?? raw['GC Awarded'] ?? '0')
  const baseScStr = parseMoney(raw['Base SC'] ?? raw['SC Awarded'] ?? '0')
  const bonusScStr = parseMoney(raw['Bonus SC'] ?? raw['SC Bonus'] ?? '0')

  return {
    gammaTxId,
    gammaUserId,
    amountUsd,
    status,
    finixTransferId: dashToNull(raw['Finix Transfer Id'] ?? ''),
    cardLast4: dashToNull(raw['Card Last 4'] ?? ''),
    cardBrand: dashToNull(raw['Card Brand'] ?? ''),
    threeDsResult: dashToNull(raw['3DS Result'] ?? ''),
    baseGc: numericStringToBigint(baseGcStr),
    baseSc: numericStringToBigint(baseScStr),
    bonusSc: numericStringToBigint(bonusScStr),
    createdAt: (() => {
      const d = parseDatetime(raw['Created At'] ?? raw['Date'] ?? '')
      return d ? new Date(d) : null
    })(),
    isInternalAccount: false,
  }
}
