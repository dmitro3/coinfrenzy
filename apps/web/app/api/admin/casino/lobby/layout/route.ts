import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { casino } from '@coinfrenzy/core'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/08 §4.3 — full lobby layout get/save for the admin WYSIWYG editor.

const putBody = z.object({
  sections: z
    .array(
      z.object({
        id: z.string().uuid(),
        gameIds: z.array(z.string().uuid()).max(2000),
      }),
    )
    .min(1)
    .max(200),
})

export async function GET() {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const layout = await casino.getLobbyLayout(built.data.ctx, { adminView: true })
  return NextResponse.json({ layout })
}

export async function PUT(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response

  let parsed: z.infer<typeof putBody>
  try {
    parsed = putBody.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const res = await casino.saveLobbyLayout(built.data.ctx, parsed)
  await built.data.flushAfterCommit()
  if (!res.ok) {
    if (res.error.code === 'section_not_found') {
      return jsonError(404, 'section_not_found', { sectionId: res.error.sectionId })
    }
    return jsonError(500, 'save_failed')
  }
  return NextResponse.json({ ok: true })
}
