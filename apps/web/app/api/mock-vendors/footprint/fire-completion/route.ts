import { NextResponse } from 'next/server'

import { adapters } from '@coinfrenzy/core'
import { isMockEnabled } from '@coinfrenzy/config'

interface Body {
  fpId?: string
  outcome?: 'pass' | 'fail' | 'review'
}

// Helper used by the mock Footprint onboarding page. Drives the same
// `triggerMockFootprintWebhook` path as the adapter's auto-completion.

export async function POST(request: Request) {
  if (!isMockEnabled('footprint')) {
    return NextResponse.json({ error: 'mock_footprint_disabled' }, { status: 404 })
  }
  const body = (await request.json().catch(() => ({}))) as Body
  if (!body.fpId) {
    return NextResponse.json({ error: 'missing_fp_id' }, { status: 400 })
  }
  const status = body.outcome === 'fail' ? 'fail' : body.outcome === 'review' ? 'none' : 'pass'
  const result = await adapters.footprint.triggerMockFootprintWebhook({
    fpId: body.fpId,
    status,
  })
  return NextResponse.json(result)
}
