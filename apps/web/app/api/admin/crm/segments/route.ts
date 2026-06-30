import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { crm } from '@coinfrenzy/core'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/11 §3 + docs/08 §10.1 — list + create segments.

export async function GET(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { ctx } = built.data

  const url = new URL(req.url)
  const limit = Number(url.searchParams.get('limit') ?? 50)
  const offset = Number(url.searchParams.get('offset') ?? 0)
  const status = url.searchParams.get('status') ?? undefined

  const result = await crm.listSegments(ctx, { limit, offset, status })
  return NextResponse.json({
    segments: result.segments.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      cachedCount: s.cachedCount,
      countUpdatedAt: s.countUpdatedAt?.toISOString() ?? null,
      status: s.status,
    })),
    total: result.total,
  })
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  filterTree: z.unknown(),
  status: z.enum(['active', 'archived']).optional(),
})

export async function POST(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { ctx, flushAfterCommit } = built.data

  let parsed: z.infer<typeof createSchema>
  try {
    parsed = createSchema.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const result = await crm.saveSegment(ctx, {
    name: parsed.name,
    description: parsed.description ?? null,
    filterTree: parsed.filterTree,
    status: parsed.status,
  })
  await flushAfterCommit()

  if (!result.ok) {
    if (result.error.code === 'NAME_CONFLICT') return jsonError(409, 'name_conflict')
    return jsonError(
      400,
      result.error.code,
      'details' in result.error ? result.error.details : undefined,
    )
  }

  return NextResponse.json({ segment: serializeSegment(result.value) })
}

function serializeSegment(s: crm.SavedSegment) {
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
