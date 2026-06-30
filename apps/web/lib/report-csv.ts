import 'server-only'

import { NextResponse } from 'next/server'

import { audit } from '@coinfrenzy/core'
import { escapeCsvCell, rowToCsvCells } from '@coinfrenzy/core/reports'
import { getDb, schema } from '@coinfrenzy/db'

/**
 * Synchronous CSV streamer used by every report export route.
 *
 * Why sync (vs. the `exports` table + Inngest worker pipeline)?
 *   - Report pages are bounded — Daily KPIs is ≤ ~1 year of rows, Bonus is
 *     one row per bonus_type, etc. The largest is Purchase Report at
 *     5,000 rows. None of these need background processing.
 *   - The async pipeline (createExportRequest → R2 → email) is reserved for
 *     unbounded exports like full audit_log dumps, full purchases history,
 *     or anything compliance-bound that requires a review step.
 *
 * We still write to `audit_log` and to the `exports` table so we have a
 * permanent record of who downloaded what and when.
 */

export interface ExportCsvOptions {
  /** Stable export-type identifier. Recorded to exports.export_type + audit_log. */
  reportKind: string
  /** Stable column ordering written to the CSV header. */
  headers: string[]
  /** Rows to serialise. Keys must match `headers`; missing cells become ''. */
  rows: Array<Record<string, unknown>>
  /** Optional date range / extra filters echoed to exports.query_spec. */
  filter?: Record<string, unknown>
  /** Override filename. Defaults to `${reportKind}-${YYYY-MM-DD}.csv`. */
  filename?: string
  adminId: string
  actorRole: string
  requestId: string
}

export async function exportCsvResponse(opts: ExportCsvOptions): Promise<NextResponse> {
  const db = getDb()
  const csv = buildCsv(opts.headers, opts.rows)
  const sizeBytes = new TextEncoder().encode(csv).byteLength
  const filename =
    opts.filename ?? `${opts.reportKind}-${new Date().toISOString().slice(0, 10)}.csv`

  // Record the export. We do this AFTER serialising the CSV so the row_count
  // and size_bytes are accurate. We use status='complete' because this is a
  // synchronous download — no worker handoff.
  const [exportRow] = await db
    .insert(schema.dataExports)
    .values({
      adminId: opts.adminId,
      exportType: opts.reportKind,
      querySpec: opts.filter ?? null,
      status: 'complete',
      rowCount: opts.rows.length,
      sizeBytes: BigInt(sizeBytes),
      startedAt: new Date(),
      completedAt: new Date(),
      // No R2 key — this is a direct stream to the browser, the CSV is
      // never persisted server-side. We deliberately don't set download_url
      // because there is none to share.
    })
    .returning({ id: schema.dataExports.id })

  await audit.writeAuditEntry(db, {
    actorKind: 'admin',
    actorId: opts.adminId,
    actorRole: opts.actorRole,
    action: 'reports.csv_export',
    resourceKind: 'export',
    resourceId: exportRow?.id ?? null,
    metadata: {
      report_kind: opts.reportKind,
      row_count: opts.rows.length,
      size_bytes: sizeBytes,
      filter: opts.filter ?? null,
    },
    requestId: opts.requestId,
  })

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      // Reports are time-sensitive — never cache CSV downloads.
      'cache-control': 'no-store',
    },
  })
}

/** Build a CSV string from headers + rows. Uses the same escape logic as the async pipeline. */
export function buildCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  const lines: string[] = []
  lines.push(headers.map((h) => escapeCsvCell(h)).join(','))
  for (const row of rows) {
    lines.push(rowToCsvCells(row, headers).join(','))
  }
  return lines.join('\n')
}
