import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { crm } from '@coinfrenzy/core'

import { buildAdminContext, jsonError } from '@/lib/admin-route'
import { sendInngestEvent } from '@/lib/inngest-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  scheduledFor: z.string().datetime().optional(),
  /** When true, run the send immediately (synchronously). Otherwise schedule it. */
  immediate: z.boolean().optional(),
})

// docs/11 §4.2 — schedule a campaign for the worker to pick up. With
// `immediate=true` we kick off the runCampaignSend right here for short
// test sends; the worker normally drives this.

export async function POST(req: NextRequest, ctx2: { params: Promise<{ id: string }> }) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { ctx, flushAfterCommit } = built.data
  const { id } = await ctx2.params

  let parsed: z.infer<typeof schema>
  try {
    parsed = schema.parse(await req.json().catch(() => ({})))
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const when = parsed.scheduledFor ? new Date(parsed.scheduledFor) : new Date()
  const scheduled = await crm.scheduleCampaign(ctx, id, when)
  await flushAfterCommit()
  if (!scheduled.ok) {
    return jsonError(400, scheduled.error.code)
  }

  if (parsed.immediate) {
    const sendResult = await crm.runCampaignSend(ctx, id)
    if (!sendResult.ok) {
      return jsonError(400, sendResult.error.code)
    }
    return NextResponse.json({ scheduled: true, sent: sendResult.value })
  }

  await sendInngestEvent({ name: 'crm.campaign.scheduled', data: { campaignId: id } })
  return NextResponse.json({ scheduled: true, scheduledFor: when.toISOString() })
}
