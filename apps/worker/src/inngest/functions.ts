import {
  aggregateSnapshotsHourly,
  aggregateSnapshotsNightly,
  aggregateSnapshotsRebuild,
} from '../jobs/aggregate-snapshots'
import { annualTaxRollup } from '../jobs/annual-tax-rollup'
import {
  crmAbWinnerDecider,
  crmCampaignSender,
  crmConversionAttribution,
} from '../jobs/crm-campaign-sender'
import { crmFlowEnroller } from '../jobs/crm-flow-enroller'
import { crmFlowRunner } from '../jobs/crm-flow-runner'
import { expireBonuses } from '../jobs/expire-bonuses'
import { gammaImport, pullGammaSnapshot } from '../jobs/gamma-import'
import { expireDownloadLinks, generateExport } from '../jobs/generate-export'
import { helloWorld } from '../jobs/hello'
import { pollEasyScam } from '../jobs/poll-easyscam'
import { pollStuckRedemptions } from '../jobs/poll-stuck-redemptions'
import { pollStuckTransfers } from '../jobs/poll-stuck-transfers'
import { publishDashboardCounters } from '../jobs/publish-dashboard-counters'
import { reconcileAleaNightly } from '../jobs/reconcile-alea'
import { reconcileWalletsNightly } from '../jobs/reconcile-wallets'
import { reconcileWalletsMonthly } from '../jobs/reconcile-wallets-full'
import { refreshPlayerStatsHourly } from '../jobs/refresh-player-stats'
import { refreshPlayerStatsFull } from '../jobs/refresh-player-stats-full'
import { resetIntegrationHealthCounters } from '../jobs/reset-integration-health-counters'
import { sendScheduledReports } from '../jobs/send-scheduled-reports'
import { submitRedemptionToFinixJob } from '../jobs/submit-redemption-to-finix'
import { vipQualificationNightly } from '../jobs/vip-qualification'
import { monthlyTierBonuses, weeklyTierBonuses } from '../jobs/weekly-tier-bonuses'

import { processAleaWebhook } from './webhook-alea'
import { processFinixWebhook } from './webhook-finix'
import { processFootprintWebhook } from './webhook-footprint'
import { processSendGridWebhook } from './webhook-sendgrid'
import { processTwilioWebhook } from './webhook-twilio'

// Every Inngest function the worker serves is registered here.
// New jobs are added in their docs-mapped prompts (see docs/02 §14).
export const functions = [
  helloWorld,
  // docs/04 §7 — ledger reconciliation (prompt 03).
  reconcileWalletsNightly,
  reconcileWalletsMonthly,
  reconcileAleaNightly,
  // docs/12 §9 — admin dashboard counters publisher (real, prompt 10).
  publishDashboardCounters,
  // docs/12 §3-§4 — Layer 3 snapshot aggregator (prompt 10).
  aggregateSnapshotsHourly,
  aggregateSnapshotsNightly,
  aggregateSnapshotsRebuild,
  // docs/12 §7 — Export Center (prompt 10).
  generateExport,
  expireDownloadLinks,
  // docs/12 §10 — scheduled report subscriptions (prompt 10).
  sendScheduledReports,
  // docs/05 — webhook dispatchers (prompt 06).
  processFinixWebhook,
  processFootprintWebhook,
  processAleaWebhook,
  processSendGridWebhook,
  processTwilioWebhook,
  // docs/05 §9.5 + docs/06 §11 — pollers (prompt 06).
  pollStuckTransfers,
  pollStuckRedemptions,
  pollEasyScam,
  // docs/05 §8 — hourly reset of integration_health 1h counters.
  resetIntegrationHealthCounters,
  // docs/06 §9 + §13 — bonus engine cron jobs (prompt 07).
  expireBonuses,
  weeklyTierBonuses,
  monthlyTierBonuses,
  // docs/07 §8 + §10 — redemption flow background jobs (prompt 08).
  submitRedemptionToFinixJob,
  annualTaxRollup,
  // docs/11 §3.1 + §4.2 + §5.3 — CRM jobs (prompt 09).
  refreshPlayerStatsHourly,
  refreshPlayerStatsFull,
  crmFlowRunner,
  crmFlowEnroller,
  crmCampaignSender,
  crmAbWinnerDecider,
  crmConversionAttribution,
  // docs M4 §worker job — nightly VIP qualification.
  vipQualificationNightly,
  // docs/13 — Gamma migration pipeline (prompt 11).
  gammaImport,
  pullGammaSnapshot,
]
