import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { casino } from '@coinfrenzy/core'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/08 §4.4 — sub-categories list + create. PATCH/DELETE live in
// ./[id]/route.ts; reorder lives in ./reorder/route.ts.

const createBody = z.object({
  slug: z.string().min(1).max(64),
  displayName: z.string().min(1).max(120),
  type: z.string().min(1).max(40).optional(),
  thumbnailUrl: z.string().url().nullable().optional(),
  inLobby: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  status: z.enum(['active', 'inactive']).optional(),
})

export async function GET() {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const rows = await casino.listSubCategories(built.data.ctx)
  return NextResponse.json({ rows })
}

export async function POST(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response

  let parsed: z.infer<typeof createBody>
  try {
    parsed = createBody.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const res = await casino.createSubCategory(built.data.ctx, parsed)
  await built.data.flushAfterCommit()
  if (!res.ok) {
    if (res.error.code === 'slug_taken') return jsonError(409, 'slug_taken')
    if (res.error.code === 'invalid_slug') return jsonError(400, 'invalid_slug')
    return jsonError(500, 'create_failed')
  }
  return NextResponse.json({ id: res.value.id })
}
