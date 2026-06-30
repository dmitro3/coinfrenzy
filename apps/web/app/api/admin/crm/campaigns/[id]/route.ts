import { NextResponse, type NextRequest } from 'next/server'

import { crm } from '@coinfrenzy/core'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, ctx2: { params: Promise<{ id: string }> }) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { id } = await ctx2.params
  const result = await crm.getCampaign(built.data.ctx, id)
  if (!result.ok) return jsonError(404, 'not_found')
  await crm.recomputeCampaignCounters(built.data.ctx, id)
  const refreshed = await crm.getCampaign(built.data.ctx, id)
  if (!refreshed.ok) return jsonError(404, 'not_found')
  return NextResponse.json({ campaign: serialize(refreshed.value) })
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
    abVariantATemplateId: c.abVariantATemplateId,
    abVariantBTemplateId: c.abVariantBTemplateId,
    abSplitPct: c.abSplitPct,
    abWinnerMetric: c.abWinnerMetric,
    abWinningVariant: c.abWinningVariant,
    conversionEvent: c.conversionEvent,
    conversionWindowHours: c.conversionWindowHours,
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
