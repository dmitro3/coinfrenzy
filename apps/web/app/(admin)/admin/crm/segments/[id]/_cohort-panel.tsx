'use client'

import { CohortAnalysis } from '@coinfrenzy/ui/admin/crm'

interface Props {
  filterTree: unknown
}

export function SegmentCohortPanel({ filterTree }: Props) {
  return <CohortAnalysis segments={[]} filterTreeOverride={filterTree} />
}
