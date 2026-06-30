import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { cms as cmsMod } from '@coinfrenzy/core'
import { canEditContent } from '@coinfrenzy/core/auth'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATUS_OPTIONS = ['active', 'draft', 'archived'] as const

const patchBody = z.object({
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/)
    .optional(),
  title: z.string().min(1).max(160).optional(),
  body: z.string().max(200_000).optional(),
  category: z.string().max(40).nullable().optional(),
  status: z.enum(STATUS_OPTIONS).optional(),
  audience: z.string().max(120).nullable().optional(),
  seoDescription: z.string().max(300).nullable().optional(),
})

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { id } = await ctx.params

  const result = await cmsMod.getPage(built.data.ctx, id)
  if (!result.ok) return jsonError(404, 'not_found')

  const r = result.value
  return NextResponse.json({
    page: {
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    },
  })
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  if (!canEditContent(built.data.session.payload.role)) return jsonError(403, 'forbidden')
  const { id } = await ctx.params

  let parsed: z.infer<typeof patchBody>
  try {
    parsed = patchBody.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const result = await cmsMod.updatePage(built.data.ctx, {
    id,
    slug: parsed.slug,
    title: parsed.title,
    body: parsed.body,
    category: parsed.category,
    status: parsed.status,
    audience: parsed.audience,
    seoDescription: parsed.seoDescription,
  })
  await built.data.flushAfterCommit()

  if (!result.ok) {
    if (result.error.code === 'NOT_FOUND') return jsonError(404, 'not_found')
    if (result.error.code === 'SLUG_CONFLICT') return jsonError(409, 'slug_conflict')
    if (result.error.code === 'INVALID')
      return jsonError(400, 'invalid', { reason: result.error.reason })
    return jsonError(400, 'failed')
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  if (!canEditContent(built.data.session.payload.role)) return jsonError(403, 'forbidden')
  const { id } = await ctx.params

  // Soft-archive — hard delete is intentionally not exposed so footer
  // links don't 404 by accident.
  const result = await cmsMod.archivePage(built.data.ctx, id)
  await built.data.flushAfterCommit()

  if (!result.ok) {
    if (result.error.code === 'NOT_FOUND') return jsonError(404, 'not_found')
    return jsonError(400, 'failed')
  }
  return NextResponse.json({ ok: true })
}
