import { randomUUID } from 'node:crypto'

import { env } from '@coinfrenzy/config'

import type {
  FootprintClient,
  FootprintCreateOnboardingInput,
  FootprintCreateOnboardingResult,
  FootprintGetUserResult,
} from './types'

// Mock Footprint per the founder's prompt-06 addendum:
//   "KYC start returns a URL to an in-app mock verification page that
//    auto-completes with status='pass' after a 1-second delay; webhook fires
//    after completion"
//
// The webhook fires asynchronously after the in-process URL handler is
// visited (the mock page in apps/web posts to a finalize API which calls
// `triggerMockFootprintWebhook`). For headless tests we also expose a
// direct helper so the test can fire the webhook without rendering a page.

interface StoredUser {
  fpId: string
  playerId: string
  status: 'pending' | 'pass' | 'fail' | 'none'
  createdAt: number
}

const STORE = new Map<string, StoredUser>()

export class MockFootprintClient implements FootprintClient {
  readonly mode = 'mock' as const

  async createOnboardingSession(
    input: FootprintCreateOnboardingInput,
  ): Promise<FootprintCreateOnboardingResult> {
    const fpId = `fp_id_mock_${randomUUID().replace(/-/g, '').slice(0, 16)}`
    const validationToken = `tok_mock_${randomUUID().replace(/-/g, '').slice(0, 16)}`

    STORE.set(fpId, {
      fpId,
      playerId: input.playerId,
      status: 'pending',
      createdAt: Date.now(),
    })

    // We point the in-app mock onboarding page at /mock-vendors/footprint/
    // — the page auto-completes and calls back to our webhook endpoint.
    const { PLAYER_BASE_URL } = env()
    const base = PLAYER_BASE_URL ?? 'http://localhost:3000'
    const url = `${base}/mock-vendors/footprint/onboarding?fp_id=${encodeURIComponent(
      fpId,
    )}&token=${encodeURIComponent(validationToken)}&email=${encodeURIComponent(input.email)}`

    return { footprintUserId: fpId, validationToken, url }
  }

  async getUser(footprintUserId: string): Promise<FootprintGetUserResult> {
    const stored = STORE.get(footprintUserId)
    if (!stored) {
      return {
        footprintUserId,
        status: 'pending',
        manualReviewStatus: null,
      }
    }
    return {
      footprintUserId,
      status: stored.status === 'pending' ? 'pending' : stored.status,
      manualReviewStatus: null,
    }
  }
}

export interface MockFootprintCompletionInput {
  fpId: string
  status: 'pass' | 'fail' | 'none'
}

export async function triggerMockFootprintWebhook(
  input: MockFootprintCompletionInput,
): Promise<{ delivered: boolean }> {
  const stored = STORE.get(input.fpId)
  if (stored) stored.status = input.status

  const eventId = `evt_mock_${randomUUID().replace(/-/g, '').slice(0, 18)}`
  const payload = {
    id: eventId,
    type: 'footprint.onboarding.completed',
    timestamp: new Date().toISOString(),
    data: {
      fp_id: input.fpId,
      status: input.status,
      timestamp: new Date().toISOString(),
    },
  }
  const rawBody = JSON.stringify(payload)
  const svixId = `msg_${randomUUID().replace(/-/g, '').slice(0, 20)}`
  const svixTimestamp = String(Math.floor(Date.now() / 1000))

  const { signMockFootprintBody } = await import('./verify-webhook')
  const sig = signMockFootprintBody(svixId, svixTimestamp, rawBody)

  const { WEBHOOK_BASE_URL } = env()
  const url = `${WEBHOOK_BASE_URL ?? 'http://localhost:3000'}/api/webhooks/footprint/v1`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': sig,
      },
      body: rawBody,
    })
    return { delivered: res.ok }
  } catch {
    return { delivered: false }
  }
}

export function _resetMockFootprintStore(): void {
  STORE.clear()
}

export function _seedMockFootprintUser(fpId: string, playerId: string): void {
  STORE.set(fpId, { fpId, playerId, status: 'pending', createdAt: Date.now() })
}
