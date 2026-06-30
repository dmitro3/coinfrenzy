import { NextResponse, type NextRequest } from 'next/server'

import { crm } from '@coinfrenzy/core'

import { buildAdminContext } from '@/lib/admin-route'

type EventKind = Parameters<typeof crm.recentEvents>[1] extends infer F
  ? F extends { kind?: infer K | undefined }
    ? Exclude<K, undefined>
    : never
  : never

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_KINDS = new Set<string>([
  'sent',
  'delivered',
  'opened',
  'clicked',
  'bounced',
  'unsubscribed',
  'campaign_created',
  'campaign_sent',
  'segment_created',
  'flow_published',
])

export async function GET(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { ctx } = built.data

  const url = new URL(req.url)
  const rawKind = url.searchParams.get('kind') ?? undefined
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') ?? 50)))
  const since = url.searchParams.get('since') ?? undefined

  const events = await crm.recentEvents(ctx, {
    kind: rawKind && VALID_KINDS.has(rawKind) ? (rawKind as EventKind) : undefined,
    limit,
    since,
  })

  return NextResponse.json({ events })
}
