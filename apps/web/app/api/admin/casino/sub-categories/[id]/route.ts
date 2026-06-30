import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { casino } from '@coinfrenzy/core'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const patchBody = z.object({
  displayName: z.string().min(1).max(120).optional(),
  type: z.string().min(1).max(40).optional(),
  thumbnailUrl: z.string().url().nullable().optional(),
  inLobby: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  status: z.enum(['active', 'inactive']).optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response

  const { id } = await params
  let parsed: z.infer<typeof patchBody>
  try {
    parsed = patchBody.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const res = await casino.updateSubCategory(built.data.ctx, id, parsed)
  await built.data.flushAfterCommit()
  if (!res.ok) {
    if (res.error.code === 'not_found') return jsonError(404, 'not_found')
    return jsonError(500, 'update_failed')
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response

  const { id } = await params
  const res = await casino.deleteSubCategory(built.data.ctx, id)
  await built.data.flushAfterCommit()
  if (!res.ok) {
    if (res.error.code === 'not_found') return jsonError(404, 'not_found')
    return jsonError(500, 'delete_failed')
  }
  return NextResponse.json({ ok: true })
}
