import { env } from '@coinfrenzy/config'

import type {
  FootprintClient,
  FootprintCreateOnboardingInput,
  FootprintCreateOnboardingResult,
  FootprintGetUserResult,
  FootprintUserStatus,
} from './types'
import { err } from '../../errors/result'

// docs/05 §4 + docs/07 §6 — Footprint's REST API. Two endpoints we need
// for prompt 06:
//   POST /onboarding_session_token  → start a hosted KYC flow
//   GET  /users/:fp_id              → fetch terminal status

const FOOTPRINT_API_BASE = 'https://api.onefootprint.com'

export class RealFootprintClient implements FootprintClient {
  readonly mode = 'real' as const

  async createOnboardingSession(
    input: FootprintCreateOnboardingInput,
  ): Promise<FootprintCreateOnboardingResult> {
    try {
      const e = env()
      if (!e.FOOTPRINT_PLAYBOOK_ID) throw err('FOOTPRINT_PLAYBOOK_ID is not set')

      const body: Record<string, unknown> = {
        kind: 'onboard',
        key: e.FOOTPRINT_PLAYBOOK_ID,
        bootstrap_data: {
          'id.email': input.email,
          ...(input.prefill?.first_name
            ? { 'id.first_name': input.prefill.first_name }
            : undefined),
          ...(input.prefill?.last_name ? { 'id.last_name': input.prefill.last_name } : undefined),
          ...(input.prefill?.dob ? { 'id.dob': input.prefill.dob } : undefined),
          ...(input.prefill?.phone_number
            ? { 'id.phone_number': input.prefill.phone_number }
            : undefined),
        },
        user_external_id: input.playerId,
        ...(input.returnUrl ? { redirect_url: input.returnUrl } : undefined),
      }
      const json = await this.request<{
        token: string
        fp_id: string
        link?: string
      }>('POST', '/onboarding/session', body)
      return {
        footprintUserId: json.fp_id,
        validationToken: json.token,
        url: json.link ?? `https://onefootprint.com/?token=${encodeURIComponent(json.token)}`,
      }
    } catch (error) {
      // console.error(' FOOTPRINT_ERROR:::>>>', error)
      throw err(error)
    }
  }

  async getUser(footprintUserId: string): Promise<FootprintGetUserResult> {
    const json = await this.request<{
      status?: string
      requires_manual_review?: string
      requires_additional_info?: string
    }>('GET', `/users/${encodeURIComponent(footprintUserId)}`)
    return {
      footprintUserId,
      status: mapStatus(json.status),
      manualReviewStatus: json.requires_manual_review === 'true' ? 'pending' : null,
      raw: json,
    }
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const e = env()
    if (!e.FOOTPRINT_API_KEY) throw new Error('FOOTPRINT_API_KEY is not set')

    const headers: Record<string, string> = {
      'X-Footprint-Secret-Key': e.FOOTPRINT_API_KEY,
      Accept: 'application/json',
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json'

    const res = await fetch(`${FOOTPRINT_API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    if (!res.ok) {
      throw new Error(`footprint_request_failed:${res.status}:${text.slice(0, 200)}`)
    }
    return JSON.parse(text) as T
  }
}

function mapStatus(value: string | undefined): FootprintUserStatus {
  if (value === 'pass' || value === 'fail' || value === 'none' || value === 'pending') return value
  return 'pending'
}
