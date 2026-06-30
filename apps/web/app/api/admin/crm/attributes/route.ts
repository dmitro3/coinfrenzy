import { NextResponse } from 'next/server'

import { crm } from '@coinfrenzy/core'

import { buildAdminContext } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response

  const attributes = crm.ATTRIBUTE_REGISTRY.map((a) => ({
    key: a.key,
    label: a.label,
    category: a.category,
    valueType: a.valueType,
    operators: a.operators,
    description: a.description ?? null,
    expensive: a.expensive ?? false,
    enumOptions: a.enumOptions ?? null,
  }))

  return NextResponse.json({
    attributes,
    categoryLabels: crm.CATEGORY_LABELS,
    categoryOrder: crm.CATEGORY_ORDER,
    operatorLabels: crm.OPERATOR_LABELS,
  })
}
