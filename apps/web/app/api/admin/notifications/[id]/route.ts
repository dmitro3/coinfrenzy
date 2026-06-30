import { NextResponse, type NextRequest } from 'next/server'

import { notificationCenter } from '@coinfrenzy/core'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { id } = await ctx.params

  const msg = await notificationCenter.getNotification(built.data.ctx, id)
  if (!msg) return jsonError(404, 'not_found')

  return NextResponse.json({
    message: {
      ...msg,
      createdAt: msg.createdAt.toISOString(),
      readAt: msg.readAt?.toISOString() ?? null,
      expiresAt: msg.expiresAt?.toISOString() ?? null,
    },
  })
}
