import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { crm } from '@coinfrenzy/core'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, ctx2: { params: Promise<{ id: string }> }) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { id } = await ctx2.params
  const result = await crm.getSegment(built.data.ctx, id)
  if (!result.ok) return jsonError(404, 'not_found')
  return NextResponse.json({ segment: serialize(result.value) })
}

const updateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  filterTree: z.unknown(),
  status: z.enum(['active', 'archived']).optional(),
})

export async function PUT(req: NextRequest, ctx2: { params: Promise<{ id: string }> }) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { id } = await ctx2.params

  let parsed: z.infer<typeof updateSchema>
  try {
    parsed = updateSchema.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const result = await crm.saveSegment(built.data.ctx, {
    id,
    name: parsed.name,
    description: parsed.description ?? null,
    filterTree: parsed.filterTree,
    status: parsed.status,
  })
  await built.data.flushAfterCommit()

  if (!result.ok) {
    if (result.error.code === 'NOT_FOUND') return jsonError(404, 'not_found')
    return jsonError(
      400,
      result.error.code,
      'details' in result.error ? result.error.details : undefined,
    )
  }
  return NextResponse.json({ segment: serialize(result.value) })
}

function serialize(s: crm.SavedSegment) {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    filterTree: s.filterTree,
    cachedCount: s.cachedCount,
    countUpdatedAt: s.countUpdatedAt?.toISOString() ?? null,
    status: s.status,
  }
}
