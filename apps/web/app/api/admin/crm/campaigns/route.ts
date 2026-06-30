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
  const limit = Number(url.searchParams.get('limit') ?? 50)
  const offset = Number(url.searchParams.get('offset') ?? 0)

  const result = await crm.listCampaigns(ctx, { status, limit, offset })
  return NextResponse.json({
    campaigns: result.rows.map(serialize),
    total: result.total,
  })
}

const createSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(2000).nullable().optional(),
  segmentId: z.string().uuid(),
  channel: z.enum(['email', 'sms', 'in_app']),
  templateId: z.string().uuid(),
  abVariantATemplateId: z.string().uuid().nullable().optional(),
  abVariantBTemplateId: z.string().uuid().nullable().optional(),
  abSplitPct: z.number().int().min(1).max(99).nullable().optional(),
  abWinnerMetric: z.enum(['open_rate', 'click_rate', 'conversion']).nullable().optional(),
  scheduledFor: z.string().datetime().nullable().optional(),
  conversionEvent: z.string().nullable().optional(),
  conversionWindowHours: z.number().int().min(1).max(720).nullable().optional(),
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

  const result = await crm.createCampaign(ctx, {
    ...parsed,
    scheduledFor: parsed.scheduledFor ? new Date(parsed.scheduledFor) : null,
  })
  await flushAfterCommit()
  if (!result.ok) {
    return jsonError(400, result.error.code)
  }
  return NextResponse.json({ id: result.value.id })
}

function serialize(c: { [key: string]: unknown }) {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    segmentId: c.segmentId,
    channel: c.channel,
    templateId: c.templateId,
    status: c.status,
    scheduledFor: c.scheduledFor instanceof Date ? c.scheduledFor.toISOString() : c.scheduledFor,
    sentStartedAt:
      c.sentStartedAt instanceof Date ? c.sentStartedAt.toISOString() : c.sentStartedAt,
    sentCompletedAt:
      c.sentCompletedAt instanceof Date ? c.sentCompletedAt.toISOString() : c.sentCompletedAt,
    recipientsCount: c.recipientsCount,
    sentCount: c.sentCount,
    deliveredCount: c.deliveredCount,
    openedCount: c.openedCount,
    clickedCount: c.clickedCount,
    bouncedCount: c.bouncedCount,
    unsubscribedCount: c.unsubscribedCount,
    conversionCount: c.conversionCount,
  }
}
