import { NextResponse, type NextRequest } from 'next/server'

import { crm } from '@coinfrenzy/core'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, ctx2: { params: Promise<{ id: string }> }) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { id } = await ctx2.params
  const result = await crm.pauseFlow(built.data.ctx, id)
  await built.data.flushAfterCommit()
  if (!result.ok) return jsonError(404, 'not_found')
  return NextResponse.json({ paused: true })
}
