import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { cms as cmsMod } from '@coinfrenzy/core'
import { canEditContent } from '@coinfrenzy/core/auth'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATUS_OPTIONS = ['active', 'draft', 'archived'] as const

const createBody = z.object({
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
  title: z.string().min(1).max(160),
  body: z.string().max(200_000).default(''),
  category: z.string().max(40).nullable().optional(),
  status: z.enum(STATUS_OPTIONS).default('active'),
  audience: z.string().max(120).nullable().optional(),
  seoDescription: z.string().max(300).nullable().optional(),
})

export async function POST(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  if (!canEditContent(built.data.session.payload.role)) {
    return jsonError(403, 'forbidden')
  }

  let parsed: z.infer<typeof createBody>
  try {
    parsed = createBody.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const result = await cmsMod.createPage(built.data.ctx, {
    slug: parsed.slug,
    title: parsed.title,
    body: parsed.body,
    category: parsed.category ?? null,
    status: parsed.status,
    audience: parsed.audience ?? null,
    seoDescription: parsed.seoDescription ?? null,
  })
  await built.data.flushAfterCommit()

  if (!result.ok) {
    if (result.error.code === 'SLUG_CONFLICT') return jsonError(409, 'slug_conflict')
    if (result.error.code === 'INVALID')
      return jsonError(400, 'invalid', { reason: result.error.reason })
    return jsonError(400, 'failed')
  }
  return NextResponse.json({ id: result.value.id })
}
