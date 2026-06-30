// docs/05 — the webhook plumbing surface. Per-provider handler trees live
// alongside in finix/, alea/, footprint/, sendgrid/, twilio/.

export { receiveWebhook, dispatchPendingWebhook } from './receiver'
export type { ReceiverInput, ReceiverOutcome, DispatchInput } from './receiver'

export {
  markIntegrationHealth,
  computeStatus,
  getIntegrationHealth,
  resetHourlyCounters,
} from './integration-health'

export type { ProviderAdapter, VerifyResult, WebhookProvider, IntegrationHealthMark } from './types'

// Provider-specific event handler registries. Imported by the worker's
// Inngest dispatcher functions.
export * as finix from './finix/index'
export * as alea from './alea/index'
export * as footprint from './footprint/index'
export * as sendgrid from './sendgrid/index'
export * as twilio from './twilio/index'
