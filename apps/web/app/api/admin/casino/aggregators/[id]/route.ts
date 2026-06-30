import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { casino } from '@coinfrenzy/core'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/08 §4.4 — aggregator update. Non-secret fields only — actual
// secret values live in Doppler per .cursorrules.

const patchBody = z.object({
  displayName: z.string().min(1).max(120).optional(),
  apiBaseUrl: z.string().url().nullable().optional(),
  callbackUrl: z.string().url().nullable().optional(),
  webhookSecretRef: z.string().min(1).max(120).nullable().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  features: z.record(z.unknown()).optional(),
  version: z.string().max(40).nullable().optional(),
  contactEmail: z.string().email().nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response

  const { id } = await params
  let parsed: z.infer<typeof patchBody>
  try {
    parsed = patchBody.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const res = await casino.updateAggregator(built.data.ctx, id, parsed)
  await built.data.flushAfterCommit()
  if (!res.ok) {
    if (res.error.code === 'not_found') return jsonError(404, 'not_found')
    return jsonError(500, 'update_failed')
  }
  return NextResponse.json({ ok: true })
}
