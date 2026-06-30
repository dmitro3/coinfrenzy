import { NextResponse, type NextRequest } from 'next/server'

import { migration } from '@coinfrenzy/core'
import { hasAtLeast } from '@coinfrenzy/core/auth'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/13 §3.1 — list snapshots in R2 / upload a CSV into one.
//
// GET  → returns { snapshots: ["2026-05-19", ...], mode: "real"|"memory" }
// POST → multipart/form-data upload — the operator drops Gamma's CSVs
//        into the dated folder for the import job to pick up.

export async function GET() {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  if (!hasAtLeast(built.data.session.payload.role, 'master')) {
    return jsonError(403, 'forbidden')
  }

  const store = migration.getSnapshotStore()
  const dates = await store.listSnapshots()
  const enriched = await Promise.all(
    dates.slice(0, 30).map(async (d) => ({ date: d, files: await store.listFiles(d) })),
  )
  return NextResponse.json({ ok: true, mode: store.mode, snapshots: enriched })
}

const MAX_SNAPSHOT_FILE_BYTES = 50 * 1024 * 1024 // 50 MB ceiling per file

export async function POST(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  if (!hasAtLeast(built.data.session.payload.role, 'master')) {
    return jsonError(403, 'forbidden')
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return jsonError(400, 'multipart_form_required')
  }
  const date = form.get('date')
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return jsonError(400, 'date_required', { format: 'YYYY-MM-DD' })
  }

  const file = form.get('file')
  if (!file || typeof file === 'string') {
    return jsonError(400, 'file_required')
  }
  const fileObj = file as File
  if (fileObj.size > MAX_SNAPSHOT_FILE_BYTES) {
    return jsonError(413, 'file_too_large', { maxBytes: MAX_SNAPSHOT_FILE_BYTES })
  }

  const filename = sanitizeFilename(fileObj.name)
  if (!filename.toLowerCase().endsWith('.csv')) {
    return jsonError(400, 'csv_only')
  }
  const bytes = Buffer.from(await fileObj.arrayBuffer())
  const store = migration.getSnapshotStore()
  await store.writeFile(date, filename, bytes)

  return NextResponse.json({ ok: true, key: `gamma-snapshots/${date}/${filename}` })
}

function sanitizeFilename(input: string): string {
  return input
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 200)
}
