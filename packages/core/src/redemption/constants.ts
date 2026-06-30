// docs/07 §4-§5 — redemption tunables.
//
// Money values are bigint in minor units (1 SC = 10_000n; $1 = 10_000n at the
// ledger's numeric(20,4) scale, or 100n cents at the Finix-facing scale).
// Comments mark each amount in human-readable major units to keep them
// auditable.

import { MINOR_UNITS_PER_MAJOR } from '@coinfrenzy/config'

/** $1 in ledger minor units (numeric(20,4) ⇒ 10_000). */
const USD_PER_DOLLAR = MINOR_UNITS_PER_MAJOR

/** docs/07 §4: redemption is denominated in SC; payout is USD at 1:1. */
export const SC_TO_USD_RATE = 1n

/** Default minimum redemption amount: 1 SC (~$1). */
export const MIN_REDEMPTION_SC = USD_PER_DOLLAR * 1n
/** Hard upper bound per single request: 50_000 SC. Operator-tunable later. */
export const MAX_REDEMPTION_SC = USD_PER_DOLLAR * 50_000n

/** docs/07 §4: rolling 24h cap. */
export const MAX_DAILY_REDEMPTION_SC = USD_PER_DOLLAR * 10_000n
/** Rolling 7-day cap. */
export const MAX_WEEKLY_REDEMPTION_SC = USD_PER_DOLLAR * 25_000n

/** docs/07 §5.1: small redemptions auto-approve up to this USD threshold. */
export const AUTO_APPROVE_THRESHOLD_USD = USD_PER_DOLLAR * 50n

/** docs/07 §4.1: KYC level 3 (EDD) required above this single-request USD amount. */
export const EDD_REQUIRED_USD = USD_PER_DOLLAR * 2_500n
/** Cumulative deposit lifetime threshold for EDD escalation. */
export const EDD_CUMULATIVE_DEPOSIT_USD = USD_PER_DOLLAR * 10_000n

/** docs/07 §10.1: 1099-MISC issuance threshold. */
export const TAX_REPORT_THRESHOLD_USD = USD_PER_DOLLAR * 600n
