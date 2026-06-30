import { eq, sql } from 'drizzle-orm'

import { adapters, reports } from '@coinfrenzy/core'
import * as schema from '@coinfrenzy/db/schema'

import { inngest } from '../inngest/client'
import { buildWorkerContext } from '../lib/context'

// docs/12 §7 — Export Center generation worker.
//
// Triggered by `reports/generate-export` (dispatched from the API route when
// a row is inserted into `exports`). Builds the CSV, uploads to R2, and
// emails the admin a 24h-signed download link.
//
// Dev fallback: when R2 is unconfigured we use the mock R2 (which keeps the
// CSV in memory) AND store the CSV inline as a data: URL so the admin UI's
// download button still works without the cloud round-trip.

const ROW_CAP = 1_000_000 // hard ceiling regardless of underlying query
const URL_TTL_SECONDS = 24 * 60 * 60

interface ExportEventData {
  exportId: string
}

export const generateExport = inngest.createFunction(
  {
    id: 'generate-export',
    name: 'Generate export → R2 + email',
    concurrency: { limit: 4 },
    retries: 3,
  },
  { event: 'reports/generate-export' },
  async ({ event, step }) => {
    const { exportId } = event.data as ExportEventData
    return step.run('generate', async () => {
      const { ctx } = buildWorkerContext({
        loggerBindings: { job: 'generate-export', exportId },
      })

      const [row] = await ctx.db
        .select()
        .from(schema.dataExports)
        .where(eq(schema.dataExports.id, exportId))
      if (!row) return { ok: false, reason: 'not_found' }

      // Mark as running so the UI status flips immediately.
      await ctx.db
        .update(schema.dataExports)
        .set({ status: 'running', startedAt: new Date() })
        .where(eq(schema.dataExports.id, exportId))

      try {
        const querySpec = row.querySpec as {
          type: reports.ExportType
          filter?: reports.ExportFilter
          customSpec?: unknown
        }
        const csv = await runExport(ctx.db, querySpec)
        const createdAt = row.createdAt
        const yyyy = createdAt.getUTCFullYear()
        const mm = String(createdAt.getUTCMonth() + 1).padStart(2, '0')
        const dd = String(createdAt.getUTCDate()).padStart(2, '0')
        const r2Key = `exports/${yyyy}/${mm}/${dd}/${row.id}.csv`
        const downloadUrl = await uploadCsvAndSign(r2Key, csv.body, ctx.logger)
        const sizeBytes = BigInt(Buffer.byteLength(csv.body, 'utf8'))
        const expiresAt = new Date(Date.now() + URL_TTL_SECONDS * 1000)

        await ctx.db
          .update(schema.dataExports)
          .set({
            status: 'complete',
            rowCount: csv.rowCount,
            sizeBytes,
            r2Key,
            downloadUrl,
            expiresAt,
            completedAt: new Date(),
          })
          .where(eq(schema.dataExports.id, exportId))

        await emailDownloadLink(ctx.db, row.adminId, downloadUrl, csv.rowCount, expiresAt)

        ctx.logger.info('export complete', {
          exportId,
          rowCount: csv.rowCount,
          sizeBytes: sizeBytes.toString(),
        })
        return { ok: true, rowCount: csv.rowCount }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        await ctx.db
          .update(schema.dataExports)
          .set({
            status: 'failed',
            completedAt: new Date(),
          })
          .where(eq(schema.dataExports.id, exportId))
        ctx.logger.error('export failed', { exportId, error: message })
        throw e // let Inngest retry per the function config
      }
    })
  },
)

interface CsvOutput {
  body: string
  rowCount: number
}

import type { Logger } from '@coinfrenzy/core'
import type { DbExecutor } from '@coinfrenzy/db/client'

async function runExport(
  db: DbExecutor,
  querySpec: { type: reports.ExportType; filter?: reports.ExportFilter; customSpec?: unknown },
): Promise<CsvOutput> {
  if (querySpec.type === 'custom') {
    return runCustomExport(db, querySpec.customSpec)
  }
  const desc = reports.buildPrebuiltExport(querySpec.type, querySpec.filter)
  if (!desc) throw new Error(`unsupported_export_type:${querySpec.type}`)

  const rows = (await db.execute<Record<string, unknown>>(desc.query)) as unknown as Array<
    Record<string, unknown>
  >
  return composeCsv(desc.headers, rows)
}

async function runCustomExport(db: DbExecutor, spec: unknown): Promise<CsvOutput> {
  const compiled = reports.compileCustomQuery(spec as reports.QuerySpec)
  if (!compiled.ok) {
    throw new Error(`custom_compile_failed:${compiled.error.code}`)
  }
  const result = await reports.runCustomQuery(db, compiled.value)
  if (!result.ok) {
    throw new Error(`custom_run_failed:${result.error.code}`)
  }
  return composeCsv(compiled.value.columns, result.value.rows)
}

function composeCsv(headers: string[], rows: Array<Record<string, unknown>>): CsvOutput {
  const lines: string[] = [headers.map(reports.escapeCsvCell).join(',')]
  let count = 0
  for (const r of rows) {
    if (count >= ROW_CAP) break
    lines.push(reports.rowToCsvCells(r, headers).join(','))
    count++
  }
  return { body: lines.join('\n'), rowCount: count }
}

/**
 * Upload the CSV to R2 and return a download URL. The R2 adapter selects
 * between the real S3 client and the in-memory mock at boot — when running
 * with the mock (local dev / tests) we additionally embed the CSV as a
 * data: URL so the admin UI's download button works without the cloud
 * round-trip. In production this always returns a 24h-signed R2 URL.
 */
async function uploadCsvAndSign(key: string, body: string, logger: Logger): Promise<string> {
  const r2 = adapters.r2.getR2Client()
  const buf = Buffer.from(body, 'utf8')
  await r2.putObject({
    key,
    body: buf,
    contentType: 'text/csv; charset=utf-8',
    cacheControl: 'private, max-age=86400',
  })
  if (r2.mode === 'mock') {
    logger.warn(
      'R2 in mock mode — returning inline data: URL. Configure R2_* secrets for real uploads.',
    )
    return `data:text/csv;base64,${buf.toString('base64')}`
  }
  return r2.signedGetUrl({ key, expiresIn: URL_TTL_SECONDS })
}

async function emailDownloadLink(
  db: DbExecutor,
  adminId: string,
  downloadUrl: string,
  rowCount: number,
  expiresAt: Date,
): Promise<void> {
  const [admin] = await db
    .select({ email: schema.admins.email, displayName: schema.admins.displayName })
    .from(schema.admins)
    .where(eq(schema.admins.id, adminId))
  if (!admin) return

  const client = adapters.sendgrid.getSendGridClient()
  await client.sendEmail({
    to: admin.email,
    subject: 'CoinFrenzy export ready for download',
    text: `Hi ${admin.displayName},

Your export is ready. ${rowCount.toLocaleString()} rows.

Download (valid until ${expiresAt.toUTCString()}):
${downloadUrl}

— CoinFrenzy admin
`,
    category: 'export-ready',
  })
}

// docs/12 §7.2 — single-row "mark expired" sweep. Cron'd daily.
export const expireDownloadLinks = inngest.createFunction(
  { id: 'expire-export-download-links', name: 'Expire stale export downloads' },
  { cron: '0 5 * * *' },
  async ({ step }) => {
    const { ctx } = buildWorkerContext({ loggerBindings: { job: 'expire-export-download-links' } })
    return step.run('expire', async () => {
      await ctx.db.execute(sql`
        UPDATE exports SET status = 'expired'
        WHERE status = 'complete'
          AND expires_at IS NOT NULL
          AND expires_at <= now()
      `)
      return { ok: true }
    })
  },
)
