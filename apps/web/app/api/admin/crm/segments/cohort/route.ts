import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { crm } from '@coinfrenzy/core'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  filterTree: z.unknown(),
  metric: z.enum(['retention', 'ltv', 'activity', 'revenue']).default('retention'),
  windowDays: z.number().int().min(7).max(730).default(90),
})

export async function POST(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { ctx } = built.data

  let parsed: z.infer<typeof schema>
  try {
    parsed = schema.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const result = await crm.analyseCohort(ctx, parsed.filterTree, {
    metric: parsed.metric,
    windowDays: parsed.windowDays,
  })
  if (!result.ok) {
    return jsonError(
      400,
      result.error.code,
      'details' in result.error ? result.error.details : undefined,
    )
  }
  return NextResponse.json(result.value)
}
