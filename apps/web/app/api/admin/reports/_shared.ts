import 'server-only'

import { NextResponse } from 'next/server'

import { canReadAuditLog } from '@coinfrenzy/core/auth'

import { buildAdminContext, type AdminRouteContext } from '@/lib/admin-route'

/**
 * Gate every /api/admin/reports/* export route. Returns a typed
 * AdminRouteContext on success, or a 401/403 NextResponse to short-circuit.
 *
 * Reports section is gated to manager+ (same as the RSC pages). Master-only
 * routes (Custom Query) re-check the role themselves.
 */
export async function buildReportsContext(): Promise<
  { kind: 'ok'; data: AdminRouteContext } | { kind: 'error'; response: NextResponse }
> {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') {
    return { kind: 'error', response: built.response }
  }
  const role = built.data.session.payload.role
  if (!canReadAuditLog(role)) {
    return {
      kind: 'error',
      response: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
    }
  }
  return { kind: 'ok', data: built.data }
}

/** Pull a date-range from a NextRequest's search params, with the same fallback as the pages. */
export function readRangeFromRequest(url: URL): { from: string; to: string } {
  const from = url.searchParams.get('from') ?? ''
  const to = url.searchParams.get('to') ?? ''
  const valid = /^\d{4}-\d{2}-\d{2}$/
  const fallbackTo = new Date().toISOString().slice(0, 10)
  const fallbackFrom = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  return {
    from: valid.test(from) ? from : fallbackFrom,
    to: valid.test(to) ? to : fallbackTo,
  }
}
