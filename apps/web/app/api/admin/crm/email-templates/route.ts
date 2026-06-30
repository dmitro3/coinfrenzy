import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { crm } from '@coinfrenzy/core'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const list = await crm.listEmailTemplates(built.data.ctx)
  return NextResponse.json({
    templates: list.map((t) => ({
      id: t.id,
      slug: t.slug,
      displayName: t.displayName,
      version: t.version,
      category: t.category,
      updatedAt: t.updatedAt.toISOString(),
    })),
  })
}

const schema = z.object({
  slug: z.string().min(1).max(100),
  displayName: z.string().min(1).max(160),
  subjectTemplate: z.string().min(1).max(500),
  bodyHtmlTemplate: z.string().min(1).max(200000),
  bodyTextTemplate: z.string().max(200000).nullable().optional(),
  fromEmail: z.string().email().nullable().optional(),
  replyTo: z.string().email().nullable().optional(),
  category: z.string().max(60).nullable().optional(),
})

export async function POST(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response

  let parsed: z.infer<typeof schema>
  try {
    parsed = schema.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const result = await crm.saveEmailTemplate(built.data.ctx, parsed)
  await built.data.flushAfterCommit()
  if (!result.ok) {
    if (result.error.code === 'SLUG_CONFLICT') return jsonError(409, 'slug_conflict')
    return jsonError(400, result.error.code)
  }
  return NextResponse.json(result.value)
}
