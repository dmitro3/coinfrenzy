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

  const result = await crm.getFlow(built.data.ctx, id)
  if (!result.ok) return jsonError(404, 'not_found')
  const analytics = await crm.flowAnalytics(built.data.ctx, id)

  return NextResponse.json({
    flow: {
      id: result.value.flow.id,
      name: result.value.flow.name,
      description: result.value.flow.description,
      triggerEvent: result.value.flow.triggerEvent,
      triggerFilter: result.value.flow.triggerFilter,
      status: result.value.flow.status,
      maxEnrollmentsPerPlayer: result.value.flow.maxEnrollmentsPerPlayer,
      cooldownHoursBetweenEnrollments: result.value.flow.cooldownHoursBetweenEnrollments,
      conversionEvent: result.value.flow.conversionEvent,
      enrollmentsCountLifetime: result.value.flow.enrollmentsCountLifetime,
      createdAt: result.value.flow.createdAt.toISOString(),
      updatedAt: result.value.flow.updatedAt.toISOString(),
    },
    steps: result.value.steps.map((s) => ({
      id: s.id,
      stepNumber: s.stepNumber,
      actionType: s.actionType,
      config: s.config,
      waitDurationSeconds: s.waitDurationSeconds,
    })),
    analytics,
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

const updateSchema = z.object({
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

export async function PUT(req: NextRequest, ctx2: { params: Promise<{ id: string }> }) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { id } = await ctx2.params

  let parsed: z.infer<typeof updateSchema>
  try {
    parsed = updateSchema.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const result = await crm.saveFlow(built.data.ctx, { id, ...parsed })
  await built.data.flushAfterCommit()
  if (!result.ok) {
    if (result.error.code === 'NOT_FOUND') return jsonError(404, 'not_found')
    return jsonError(400, result.error.code)
  }
  return NextResponse.json({ id: result.value.id })
}
