// External provider adapters. Per docs/02 §6 + .cursorrules:
//   - Adapters are the only place that knows about a provider's wire format.
//   - Adapters never call other core modules (one-way dependency).
//   - Every outbound call updates integration_health.
//   - Each adapter exposes the same interface for its mock and real
//     implementation; the per-vendor `get*Client()` factory consults
//     `USE_MOCK_<VENDOR>` from @coinfrenzy/config.

export * as finix from './finix/index'
export * as alea from './alea/index'
export * as footprint from './footprint/index'
export * as radar from './radar/index'
export * as sendgrid from './sendgrid/index'
export * as twilio from './twilio/index'
export * as easyscam from './easyscam/index'
export * as r2 from './r2/index'
