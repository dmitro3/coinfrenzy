import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { crm } from '@coinfrenzy/core'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ filterTree: z.unknown() })

// docs/11 §3.5 — live count endpoint used by the segment builder.

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

  const result = await crm.countSegment(ctx, parsed.filterTree)
  if (!result.ok) {
    return jsonError(
      400,
      result.error.code,
      'details' in result.error ? result.error.details : undefined,
    )
  }
  return NextResponse.json({ count: result.value.count })
}
