# Prompt 06 — Implement Webhooks and Integration Adapters

Copy this entire file into Cursor's chat and hit enter. Prompts 01-05
must be complete.

---

Continuing the CoinFrenzy build. This prompt wires the platform to its
external dependencies: Finix (payments), Alea (games), Footprint (KYC),
Radar (geo + fraud), SendGrid/Twilio (messaging), EasyScam (AMOE).

Read these documents:
- `docs/05_webhooks.md` (the entire doc)
- `docs/02_core_service_layer.md` §7 (adapter pattern)
- `docs/04_ledger_and_wallet.md` §3 (transaction types invoked by handlers)

Re-read `.cursorrules`.

## Before you start

Ask the user for these secrets to add to Doppler (the prompt 02 work
covered DATABASE_URL — these are new):

- `FINIX_API_KEY` (server-side)
- `FINIX_APPLICATION_ID`
- `FINIX_WEBHOOK_SECRET`
- `ALEA_API_KEY`
- `ALEA_WEBHOOK_SECRET`
- `ALEA_API_BASE` (sandbox URL initially; production URL when live)
- `FOOTPRINT_API_KEY`
- `FOOTPRINT_WEBHOOK_SECRET`
- `FOOTPRINT_PLAYBOOK_ID`
- `RADAR_SECRET_KEY` (server-side, not publishable)
- `SENDGRID_API_KEY`
- `SENDGRID_FROM_EMAIL`
- `SENDGRID_WEBHOOK_SECRET`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WEBHOOK_SECRET`
- `EASYSCAM_API_KEY`
- `EASYSCAM_API_BASE`
- `INNGEST_EVENT_KEY` (from Inngest dashboard)
- `INNGEST_SIGNING_KEY` (from Inngest dashboard)
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
- `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET`, `PUSHER_CLUSTER`

Wait for the user to confirm these are in Doppler before proceeding.

## Specific requirements

1. **The `pending_webhooks` table** — verify it exists from prompt 02 per
   docs/05 §2.1. If missing, add a migration.

2. **The universal receiver pattern** per docs/05 §2:
   - `packages/core/src/webhooks/receiver.ts` — the 8-step pattern
   - Per-provider modules under `packages/core/src/webhooks/{provider}/`

3. **Finix integration** per docs/05 §3:
   - Adapter at `packages/core/src/adapters/finix/`
     - `client.ts` — REST client for Finix API
     - `verify-webhook.ts` — HMAC-SHA256 signature verification
   - Webhook receiver at `apps/web/app/api/webhooks/finix/v1/route.ts`
   - Event handlers at `packages/core/src/webhooks/finix/handlers/`:
     - `transfer-succeeded.ts` (full pattern per docs/05 §3.4)
     - `transfer-failed.ts`
     - `dispute-created.ts`
     - `authorization-events.ts`
     - `settlement-events.ts`
     - `payment-instrument-events.ts`
   - Inngest function `apps/worker/src/inngest/webhook-finix.ts` consumes
     `webhook/finix.received` events and dispatches to handlers

4. **Footprint integration** per docs/05 §4 and docs/07 §6:
   - Adapter at `packages/core/src/adapters/footprint/`
     - `client.ts` — implements the interface from docs/07 §6.6
     - `verify-webhook.ts` — uses `svix` npm package per docs/05 §4.2
   - Webhook receiver at `apps/web/app/api/webhooks/footprint/v1/route.ts`
   - Event handlers at `packages/core/src/webhooks/footprint/handlers/`:
     - `onboarding-completed.ts` per docs/05 §4.4
     - `manual-review.ts`
     - `watchlist-check.ts` (the AML hold flow per docs/07 §7.3)
   - The `aml_review_queue` table is already in schema from prompt 02

5. **Alea integration** per docs/05 §5:
   - Adapter at `packages/core/src/adapters/alea/`
     - `client.ts` — game session launch API
     - `verify-webhook.ts` — HMAC framework per docs/05 §5.4
     - NOTE: exact webhook header names should be confirmed against
       Alea's wiki at https://app.aleaplay.com/wikialea — the patterns
       in docs/05 §5.4 are best-guess industry-standard; verify and
       adjust during this prompt
   - Webhook receiver at `apps/web/app/api/webhooks/alea/v1/route.ts`
   - Synchronous balance query at `apps/web/app/api/webhooks/alea/v1/balance-query/route.ts`
     per docs/05 §5.3
   - Event handlers at `packages/core/src/webhooks/alea/handlers/`:
     - `round-bet.ts` per docs/05 §5.5 (writes bet ledger entries, calls
       bonus engine for playthrough — bonus engine call will be a stub
       that prompt 07 fills in)
     - `round-win.ts` per docs/05 §5.5
     - `session-events.ts`
   - The game session launch flow at `packages/core/src/games/launch.ts`
     per docs/05 §5.2
   - The placeholder game lobby from prompt 05 now becomes real: the
     game grid fetches from Alea's game list API (`gamesAvailable` for
     sandbox per the integration notes from the user)

6. **Radar integration** per docs/05 §6:
   - Adapter at `packages/core/src/adapters/radar/`
     - `geocode.ts` — IP geocode + fraud signals
     - `track.ts` — Track API for ongoing fraud monitoring
   - No webhook handler for v1 (Radar is mostly polled per docs/05 §6)
   - Wire the IP geocode into the player signup flow (replacing the stub
     from prompt 05) and into the purchase/redemption eligibility checks

7. **SendGrid integration** per docs/05 §7.1:
   - Adapter at `packages/core/src/adapters/sendgrid/`
     - `client.ts` — send emails
     - `verify-webhook.ts` — verify SendGrid event webhook signature
   - Webhook receiver at `apps/web/app/api/webhooks/sendgrid/v1/route.ts`
   - Event handlers update `crm_message_log` and emit CRM events
   - Transactional email templates wired up: welcome, email verification,
     password reset, redemption receipts

8. **Twilio integration** per docs/05 §7.2:
   - Adapter at `packages/core/src/adapters/twilio/`
   - Webhook receiver at `apps/web/app/api/webhooks/twilio/v1/route.ts`
     - Outbound event statuses
     - Inbound SMS handler with TCPA STOP/HELP keyword handling per docs/05 §7.2

9. **EasyScam (AMOE) integration** per docs/06 §11:
   - Adapter at `packages/core/src/adapters/easyscam/`
     - Poll-based (no webhooks) per docs/06 §11
   - Worker job `apps/worker/src/jobs/poll-easyscam.ts` runs every 15
     minutes per Inngest cron
   - The actual AMOE award path uses `bonusEngine.award()` — stub for
     this prompt; prompt 07 makes it real

10. **Health monitoring** per docs/05 §8:
    - The `integration_health` table is already in schema
    - Every webhook receipt (success or failure) updates this table
    - The Integrity page in admin (placeholder from prompt 04) becomes
      real: real-time tiles per provider with SSE feed
    - PagerDuty alert at red status per docs/05 §8

11. **The poller fallbacks** per docs/05 §9.5:
    - `apps/worker/src/jobs/poll-stuck-transfers.ts` — Finix transfers
      stuck in `pending` for > 10 min
    - `apps/worker/src/jobs/poll-stuck-redemptions.ts` — redemptions
      in `awaiting_webhook` for > 10 min (uses prompt 08 redemption
      code; stub the integration here)

## Constraints

- All adapter modules implement the adapter pattern from docs/02 §7:
  interface in `types.ts`, implementation in `client.ts`, mock for
  tests in `__mocks__/`.
- Webhook handlers MUST be idempotent. Use the (source, source_id)
  ledger constraint as the final defense.
- Webhook receipt MUST be fast (< 200ms). Heavy work goes to Inngest.
- Signatures verified BEFORE any DB write.
- Raw webhook body saved in `pending_webhooks` for forensic replay.

## Verification

1. `pnpm typecheck` passes
2. `pnpm lint` passes
3. Manual test:
   - Use Finix sandbox: trigger a test transfer event → verify
     `pending_webhooks` has the row, `purchases` was updated, ledger
     entries written
   - Use Footprint sandbox: complete a verification → verify
     `kyc_status` and `players.kyc_level` updated
   - Use Alea sandbox: launch a game, place a sandbox bet → verify
     `game_rounds` has the row, ledger has bet+win entries with same
     pair_id, wallet balance reflects the result
   - Trigger an integration-down scenario by setting an invalid Finix
     webhook secret → verify webhook returns 401, audit log entry
     written, integration_health goes yellow
4. The admin Integrity page shows green tiles for all 4 providers

## When done

Standard report. Specifically confirm:
- All 5 webhook receivers respond to test events
- Signature verification rejects forged events
- Idempotency works on duplicate webhook deliveries
- The Integrity page is live with real health data

Tell the user to message Claude with the report. This is the integration
gate — Claude will verify all 5 providers are working before approving
prompt 07.
