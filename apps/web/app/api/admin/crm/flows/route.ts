import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { crm } from '@coinfrenzy/core'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { ctx } = built.data

  const url = new URL(req.url)
  const status = url.searchParams.get('status') ?? undefined
  const flows = await crm.listFlows(ctx, { status })
  return NextResponse.json({
    flows: flows.map((f) => ({
      id: f.id,
      name: f.name,
      description: f.description,
      triggerEvent: f.triggerEvent,
      status: f.status,
      maxEnrollmentsPerPlayer: f.maxEnrollmentsPerPlayer,
      enrollmentsCountLifetime: f.enrollmentsCountLifetime,
      updatedAt: f.updatedAt.toISOString(),
    })),
  })
}

const stepSchema = z.object({
  stepNumber: z.number().int().positive(),
  actionType: z.enum([
    'send_email',
    'send_sms',
    'wait',
    'condition',
    'award_bonus',
    'add_to_segment',
    'remove_from_segment',
    'end',
  ]),
  config: z.record(z.unknown()),
  waitDurationSeconds: z.number().int().positive().nullable().optional(),
})

const createSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(2000).nullable().optional(),
  triggerEvent: z.string().min(1),
  triggerFilter: z.unknown().nullable().optional(),
  maxEnrollmentsPerPlayer: z.number().int().min(1).max(100).nullable().optional(),
  cooldownHoursBetweenEnrollments: z.number().int().min(0).max(8760).nullable().optional(),
  status: z.enum(['active', 'paused', 'archived']).optional(),
  conversionEvent: z.string().nullable().optional(),
  steps: z.array(stepSchema).min(1),
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

  const result = await crm.saveFlow(ctx, parsed)
  await flushAfterCommit()
  if (!result.ok) {
    if (result.error.code === 'NOT_FOUND') return jsonError(404, 'not_found')
    return jsonError(400, result.error.code)
  }
  return NextResponse.json({ id: result.value.id })
}
