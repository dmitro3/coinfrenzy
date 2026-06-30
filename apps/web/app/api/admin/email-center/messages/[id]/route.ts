import { NextResponse, type NextRequest } from 'next/server'

import { emailCenter } from '@coinfrenzy/core'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { id } = await ctx.params

  // `crm_message_log` is monthly-partitioned by `created_at`. The list
  // page already knows the row's createdAt — passing it through cuts
  // the lookup to a single partition.
  const createdAtParam = req.nextUrl.searchParams.get('createdAt')
  const createdAt = createdAtParam ? new Date(createdAtParam) : undefined
  const msg = await emailCenter.getMessage(
    built.data.ctx,
    id,
    createdAt && !isNaN(createdAt.getTime()) ? createdAt : undefined,
  )
  if (!msg) return jsonError(404, 'not_found')

  return NextResponse.json({
    message: {
      ...msg,
      createdAt: msg.createdAt.toISOString(),
      queuedAt: msg.sentAt?.toISOString() ?? null,
      sentAt: msg.sentAt?.toISOString() ?? null,
      deliveredAt: msg.deliveredAt?.toISOString() ?? null,
      openedAt: msg.openedAt?.toISOString() ?? null,
      clickedAt: msg.clickedAt?.toISOString() ?? null,
    },
  })
}
