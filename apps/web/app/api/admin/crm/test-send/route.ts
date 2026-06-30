import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { crm } from '@coinfrenzy/core'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  channel: z.enum(['email', 'sms']),
  templateId: z.string().uuid(),
  samplePlayerId: z.string().uuid(),
  adminEmailOverride: z.string().email().optional(),
  adminPhoneOverride: z.string().min(7).optional(),
})

export async function POST(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { ctx, flushAfterCommit } = built.data

  let parsed: z.infer<typeof schema>
  try {
    parsed = schema.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const result = await crm.sendAdminTest(ctx, parsed)
  await flushAfterCommit()

  if (!result.ok) {
    return jsonError(
      400,
      result.error.code,
      'message' in result.error ? result.error.message : undefined,
    )
  }

  return NextResponse.json(result.value)
}
