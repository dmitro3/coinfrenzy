import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { casino } from '@coinfrenzy/core'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const postBody = z.object({
  gameIds: z.array(z.string().uuid()).min(1).max(500),
})

const deleteBody = z.object({
  gameId: z.string().uuid(),
})

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { id } = await params
  const rows = await casino.listGamesInSection(built.data.ctx, id)
  return NextResponse.json({ rows })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response

  const { id } = await params
  let parsed: z.infer<typeof postBody>
  try {
    parsed = postBody.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const res = await casino.addGamesToSection(built.data.ctx, id, parsed.gameIds)
  await built.data.flushAfterCommit()
  if (!res.ok) {
    if (res.error.code === 'not_found') return jsonError(404, 'not_found')
    return jsonError(500, 'add_failed')
  }
  return NextResponse.json(res.value)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response

  const { id } = await params
  let parsed: z.infer<typeof deleteBody>
  try {
    parsed = deleteBody.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const res = await casino.removeGameFromSection(built.data.ctx, id, parsed.gameId)
  await built.data.flushAfterCommit()
  if (!res.ok) {
    if (res.error.code === 'not_found') return jsonError(404, 'not_found')
    return jsonError(500, 'remove_failed')
  }
  return NextResponse.json({ ok: true })
}
