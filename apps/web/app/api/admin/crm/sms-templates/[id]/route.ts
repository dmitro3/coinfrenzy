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
  const result = await crm.getSmsTemplate(built.data.ctx, id)
  if (!result.ok) return jsonError(404, 'not_found')
  return NextResponse.json({
    template: {
      id: result.value.id,
      slug: result.value.slug,
      displayName: result.value.displayName,
      version: result.value.version,
      isCurrent: result.value.isCurrent,
      bodyTemplate: result.value.bodyTemplate,
      category: result.value.category,
    },
  })
}

const schema = z.object({
  slug: z.string().min(1).max(100),
  displayName: z.string().min(1).max(160),
  bodyTemplate: z.string().min(1).max(320),
  category: z.string().max(60).nullable().optional(),
})

export async function PUT(req: NextRequest, ctx2: { params: Promise<{ id: string }> }) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { id } = await ctx2.params

  let parsed: z.infer<typeof schema>
  try {
    parsed = schema.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const result = await crm.saveSmsTemplate(built.data.ctx, { id, ...parsed })
  await built.data.flushAfterCommit()
  if (!result.ok) {
    if (result.error.code === 'NOT_FOUND') return jsonError(404, 'not_found')
    return jsonError(400, result.error.code)
  }
  return NextResponse.json(result.value)
}
