'use client'

import { useRouter } from 'next/navigation'

import { FlowVisualBuilder, type FlowMeta, type FlowStep } from '@coinfrenzy/ui/admin/crm'

interface Props {
  flowId?: string
  initialMeta: FlowMeta
  initialSteps: FlowStep[]
  triggerEventOptions: string[]
  emailTemplates: Array<{ id: string; slug: string; displayName: string }>
  smsTemplates: Array<{ id: string; slug: string; displayName: string }>
}

export function FlowBuilderWrapper({
  flowId,
  initialMeta,
  initialSteps,
  triggerEventOptions,
  emailTemplates,
  smsTemplates,
}: Props) {
  const router = useRouter()

  async function onSave(input: { meta: FlowMeta; steps: FlowStep[] }): Promise<{
    ok: boolean
    error?: string
  }> {
    try {
      const url = flowId ? `/api/admin/crm/flows/${flowId}` : `/api/admin/crm/flows`
      const method = flowId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: input.meta.name,
          description: input.meta.description,
          triggerEvent: input.meta.triggerEvent,
          maxEnrollmentsPerPlayer: input.meta.maxEnrollmentsPerPlayer,
          cooldownHoursBetweenEnrollments: input.meta.cooldownHoursBetweenEnrollments,
          status: input.meta.status,
          conversionEvent: input.meta.conversionEvent,
          steps: input.steps.map((s) => ({
            stepNumber: s.stepNumber,
            actionType: s.actionType === 'trigger' ? 'wait' : s.actionType,
            config: s.config,
            waitDurationSeconds: s.waitDurationSeconds,
          })),
        }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        return { ok: false, error: err.error ?? `Save failed (${res.status})` }
      }
      const json = (await res.json()) as { id: string }
      if (!flowId) {
        router.push(`/admin/crm/flows/${json.id}`)
      } else {
        router.refresh()
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  return (
    <FlowVisualBuilder
      flowId={flowId}
      initialMeta={initialMeta}
      initialSteps={initialSteps}
      triggerEventOptions={triggerEventOptions}
      emailTemplates={emailTemplates}
      smsTemplates={smsTemplates}
      onSave={onSave}
    />
  )
}
