import type { Vendor } from '@coinfrenzy/config'

// docs/05 §2 — shared webhook plumbing types. Every per-provider receiver
// adheres to this surface so the universal receiver and integration_health
// updater can stay vendor-agnostic.

export type WebhookProvider = Vendor | 'inngest' | 'pusher'

export type VerifyResult = { ok: true } | { ok: false; error: string }

export interface ProviderAdapter {
  /** Header-by-header signature verification per docs/05 §2 step 2. */
  verifyWebhook(rawBody: string, headers: Record<string, string>): Promise<VerifyResult>
  /** docs/05 §3.3, §4.3, §5.x — globally-unique event id extracted from body or headers. */
  extractIdempotencyKey(rawBody: string, headers: Record<string, string>): string
  /** Where to dispatch to inside Inngest — defaults to `webhook/<provider>.received`. */
  extractEventType(rawBody: string, headers: Record<string, string>): string
}

export interface IntegrationHealthMark {
  provider: WebhookProvider
  outcome: 'success' | 'failure' | 'duplicate'
  latencyMs?: number | null
  errorReason?: string | null
}
