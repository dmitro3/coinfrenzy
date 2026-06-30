import { NextResponse, type NextRequest } from 'next/server'

import { audit, reports } from '@coinfrenzy/core'

import { buildAdminContext } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/12 §6.8 — run a master-only custom query. The body is a `QuerySpec`
// from @coinfrenzy/core/reports; the compiler enforces the table/column
// allow-list before any SQL is composed and the runner sets a 30s timeout
// + read-only transaction. Every run writes an audit_log row.

export async function POST(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response

  const { ctx, session } = built.data
  if (session.payload.role !== 'master') {
    return NextResponse.json({ error: 'forbidden_master_only' }, { status: 403 })
  }

  let spec: reports.QuerySpec
  try {
    spec = (await req.json()) as reports.QuerySpec
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const compiled = reports.compileCustomQuery(spec)
  if (!compiled.ok) {
    return NextResponse.json(
      { error: compiled.error.code, detail: compiled.error },
      { status: 400 },
    )
  }

  const result = await reports.runCustomQuery(ctx.db, compiled.value)

  await audit.writeAuditEntry(ctx.db, {
    actorKind: 'admin',
    actorId: session.admin.id,
    actorRole: session.payload.role,
    action: 'reports.custom_query.run',
    metadata: {
      spec,
      ok: result.ok,
      durationMs: result.ok ? result.value.durationMs : null,
      rowCount: result.ok ? result.value.rowCount : null,
      error: result.ok ? null : result.error.code,
    },
    requestId: ctx.reqId,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error.code }, { status: 400 })
  }

  // BigInt is not JSON-serializable. Convert to string at the boundary so
  // the client can format losslessly.
  const safe = result.value.rows.map((r) => {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(r)) {
      out[k] = typeof v === 'bigint' ? v.toString() : v
    }
    return out
  })

  return NextResponse.json({
    columns: compiled.value.columns,
    rows: safe,
    rowCount: result.value.rowCount,
    durationMs: result.value.durationMs,
    truncated: result.value.truncated,
  })
}
