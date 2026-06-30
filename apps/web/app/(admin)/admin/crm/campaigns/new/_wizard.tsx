'use client'

import { useRouter } from 'next/navigation'

import {
  CampaignWizard as SharedCampaignWizard,
  type CampaignWizardProps,
  type CampaignWizardSubmit,
} from '@coinfrenzy/ui/admin/crm'

type Props = Omit<CampaignWizardProps, 'onCreate'>

export function CampaignWizardWrapper(props: Props) {
  const router = useRouter()

  async function onCreate(input: CampaignWizardSubmit): Promise<{
    ok: boolean
    error?: string
    id?: string
  }> {
    try {
      const res = await fetch('/api/admin/crm/campaigns', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: input.name,
          description: input.description,
          segmentId: input.segmentId,
          channel: input.channel,
          templateId: input.templateId,
          scheduledFor: input.scheduledFor,
          conversionEvent: input.conversionEvent,
          abVariantATemplateId: input.abEnabled ? input.templateId : null,
          abVariantBTemplateId: input.abEnabled ? input.abTemplateId : null,
          abSplitPct: input.abEnabled ? input.abSplit : null,
          abWinnerMetric: input.abEnabled
            ? input.abWinnerCriteria === 'open_rate'
              ? 'open_rate'
              : input.abWinnerCriteria === 'click_rate'
                ? 'click_rate'
                : 'conversion'
            : null,
        }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        return { ok: false, error: err.error ?? `Save failed (${res.status})` }
      }
      const json = (await res.json()) as { id: string }
      router.push(`/admin/crm/campaigns/${json.id}`)
      return { ok: true, id: json.id }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  return <SharedCampaignWizard {...props} onCreate={onCreate} />
}
