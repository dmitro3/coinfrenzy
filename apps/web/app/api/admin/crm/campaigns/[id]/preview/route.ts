import { NextResponse, type NextRequest } from 'next/server'

import { crm } from '@coinfrenzy/core'
import { schema } from '@coinfrenzy/db'
import { sql } from 'drizzle-orm'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/08 §10.2 — wizard step 5: preview the rendered template against
// 5 random recipients in the segment.

export async function GET(_req: NextRequest, ctx2: { params: Promise<{ id: string }> }) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { ctx } = built.data
  const { id } = await ctx2.params

  const campaignResult = await crm.getCampaign(ctx, id)
  if (!campaignResult.ok) return jsonError(404, 'campaign_not_found')
  const campaign = campaignResult.value
  if (!campaign.segmentId) return jsonError(400, 'no_segment')
  if (!campaign.templateId) return jsonError(400, 'no_template')

  const segmentResult = await crm.getSegment(ctx, campaign.segmentId)
  if (!segmentResult.ok) return jsonError(404, 'segment_not_found')

  const sample = await crm.previewSegment(ctx, segmentResult.value.filterTree, 5)
  if (!sample.ok) return jsonError(400, 'preview_failed')

  const previews = []
  if (campaign.channel === 'email') {
    const tplResult = await crm.getEmailTemplate(ctx, campaign.templateId)
    if (!tplResult.ok) return jsonError(404, 'template_not_found')
    for (const player of sample.value.players) {
      const renderCtx = await crm.buildPlayerVariableContext(ctx, player.id)
      if (!renderCtx.ok) continue
      previews.push({
        playerId: player.id,
        email: player.email,
        subject: crm.renderTemplate(tplResult.value.subjectTemplate, { player: renderCtx.value }),
        bodyHtml: crm.renderTemplate(tplResult.value.bodyHtmlTemplate, { player: renderCtx.value }),
      })
    }
  } else if (campaign.channel === 'sms') {
    const tplResult = await crm.getSmsTemplate(ctx, campaign.templateId)
    if (!tplResult.ok) return jsonError(404, 'template_not_found')
    for (const player of sample.value.players) {
      const renderCtx = await crm.buildPlayerVariableContext(ctx, player.id)
      if (!renderCtx.ok) continue
      previews.push({
        playerId: player.id,
        body: crm.renderPlaintextTemplate(tplResult.value.bodyTemplate, {
          player: renderCtx.value,
        }),
      })
    }
  }

  // Eligible count vs total = roughly what will actually send.
  const totalRows = await ctx.db.execute(sql`
    SELECT COUNT(*)::int AS n FROM crm_segments WHERE id = ${campaign.segmentId}
  `)
  void totalRows
  void schema

  return NextResponse.json({ previews })
}
