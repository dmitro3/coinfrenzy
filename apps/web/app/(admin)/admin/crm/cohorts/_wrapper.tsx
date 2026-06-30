'use client'

import { CohortAnalysis } from '@coinfrenzy/ui/admin/crm'

interface Segment {
  id: string
  name: string
  cachedCount: number | null
}

export function CohortAnalysisWrapper({ segments }: { segments: Segment[] }) {
  return <CohortAnalysis segments={segments} />
}
