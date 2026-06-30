# 11 · Integrations

Every external vendor we depend on, where the adapter lives, how to
switch real ↔ mock, and what credentials it needs.

---

## The adapter pattern

Every vendor follows the same shape in `packages/core/src/adapters/<vendor>/`:

```
adapters/<vendor>/
├── client-mock.ts      Local implementation (uses fixtures/in-memory state)
├── client-real.ts      Real HTTP client (axios/fetch)
├── verify-webhook.ts   (where applicable) HMAC/signature verification
├── types.ts            Vendor-specific types
└── index.ts            Picks mock vs real based on `USE_MOCK_<VENDOR>`
```

The factory (`adapters/index.ts`) reads `env().USE_MOCK_<VENDOR>` at
import time and returns the appropriate client. Every `USE_MOCK_*` env
defaults to `true`, so a fresh checkout never hits a real vendor.

The Integrity page at `/admin/integrity` shows a "Mock Mode" badge on
every vendor whose flag is on, so operators can see at a glance what's
live.

---

## Alea — game aggregator

**What it does**: aggregates ~20 game studios under one iframe + webhook
contract. Players launch a game; Alea handles the game; sends us
bet/win/jackpot webhooks; we update the ledger.

| Surface              | Path                                                                           |
| -------------------- | ------------------------------------------------------------------------------ |
| Adapter              | `packages/core/src/adapters/alea/`                                             |
| Webhook receiver     | `apps/web/app/api/webhooks/alea/v1/route.ts`                                   |
| Worker handler       | `apps/worker/src/inngest/webhook-alea.ts` → `core.webhooks.processAleaWebhook` |
| Reconciliation cron  | `apps/worker/src/jobs/reconcile-alea.ts` (nightly)                             |
| Mock UI              | `/mock-vendors/alea`                                                           |
| Game session creator | `apps/web/app/api/games/.../session`                                           |
| Player launch page   | `/games/[slug]` (iframes Alea)                                                 |

### Credentials

| Env var               | Where used          | How to obtain                                          |
| --------------------- | ------------------- | ------------------------------------------------------ |
| `ALEA_API_BASE`       | Adapter             | Alea operator portal.                                  |
| `ALEA_API_KEY`        | Adapter             | Alea operator portal — issue per env.                  |
| `ALEA_WEBHOOK_SECRET` | `verify-webhook.ts` | Alea operator portal — must match webhook config.      |
| `USE_MOCK_ALEA`       | Adapter factory     | Default `true`; flip to `false` when live creds wired. |

### Reconciliation

The nightly `reconcileAleaNightly` job pulls Alea's round-level report
for the previous 24h and diffs against our `game_rounds` partition for
the same window. Differences are recorded in
`alea_reconciliation_findings` (migration `0023`) and surfaced on the
Integrity page.

### Constraint

We **cannot animate inside the iframe** — Alea owns the game UI. We
animate the launch chrome, the "big win" celebration that fires off
webhook events, and the lobby tile.

---

## Finix — payments

**What it does**: card / ACH / debit-push processing for both coin
package purchases AND outbound redemptions.

| Surface           | Path                                                 |
| ----------------- | ---------------------------------------------------- |
| Adapter           | `packages/core/src/adapters/finix/`                  |
| Webhook receiver  | `apps/web/app/api/webhooks/finix/v1/route.ts`        |
| Worker handler    | `apps/worker/src/inngest/webhook-finix.ts`           |
| Mock UI           | `/mock-vendors/finix`                                |
| Purchase intent   | `apps/web/app/api/player/purchase/start/route.ts`    |
| Payout submission | `apps/worker/src/jobs/submit-redemption-to-finix.ts` |

### Credentials

| Env var                            | Where used                   |
| ---------------------------------- | ---------------------------- |
| `FINIX_API_KEY`                    | Adapter (server)             |
| `FINIX_APPLICATION_ID`             | Adapter + Hosted Fields      |
| `FINIX_WEBHOOK_SECRET`             | `verify-webhook.ts`          |
| `NEXT_PUBLIC_FINIX_APPLICATION_ID` | Browser Hosted Fields script |
| `NEXT_PUBLIC_FINIX_ENVIRONMENT`    | `'sandbox'` or `'live'`      |
| `USE_MOCK_FINIX`                   | Adapter factory              |

### Modes

- **Hosted Fields** — card capture is iframed in from Finix; we never
  see raw PAN. PCI scope is minimised.
- **ACH push** — outbound payout via Finix Transfer.
- **Debit push** (APT / "instant" debit redemption) — outbound to a
  debit card via APT Debit; uses the same Finix Transfer endpoint with
  a different rail.

### Mock mode

The mock UI at `/mock-vendors/finix` lets you simulate any webhook by
clicking a button. The simulator POSTs to our own webhook receiver with
a valid mock signature.

---

## Footprint — KYC verification

**What it does**: identity verification (KYC tier 2+). Players hand over
ID + selfie; Footprint runs OCR, document checks, sanctions screening,
and posts a verdict via webhook (delivered through Svix).

| Surface          | Path                                              |
| ---------------- | ------------------------------------------------- |
| Adapter          | `packages/core/src/adapters/footprint/`           |
| Webhook receiver | `apps/web/app/api/webhooks/footprint/v1/route.ts` |
| Worker handler   | `apps/worker/src/inngest/webhook-footprint.ts`    |
| Mock UI          | `/mock-vendors/footprint`                         |
| KYC core logic   | `packages/core/src/kyc/`                          |
| Player flow      | `/account/verify` (or first redemption request)   |

### Credentials

| Env var                    | Where used                              |
| -------------------------- | --------------------------------------- |
| `FOOTPRINT_API_KEY`        | Adapter                                 |
| `FOOTPRINT_WEBHOOK_SECRET` | Svix-style signature verification       |
| `FOOTPRINT_PLAYBOOK_ID`    | The Footprint playbook driving the flow |
| `USE_MOCK_FOOTPRINT`       | Adapter factory                         |

### KYC tiers

| Tier | Means                                                                             |
| ---- | --------------------------------------------------------------------------------- |
| 0    | Unverified (signup state). Can play GC + win SC. **Cannot redeem.**               |
| 1    | Light verification (email + phone).                                               |
| 2    | Full KYC — ID + selfie. **Required for first redemption ≥ $1.**                   |
| 3    | Enhanced — additional docs (typically triggered by AML flag or large redemption). |

Tier is stored on `players.kyc_level` (CHECK `0..3`).

---

## Radar — geolocation

**What it does**: server-side geo IP + state lookup. We refuse SC
gameplay and redemption in blocked states (`packages/core/src/compliance/`
→ `BLOCKED_STATES`). Radar also gives us VPN/proxy detection.

| Surface | Path                                  |
| ------- | ------------------------------------- |
| Adapter | `packages/core/src/adapters/radar/`   |
| Used by | Signup, lobby load, redemption start. |

### Credentials

| Env var          | Where used                       |
| ---------------- | -------------------------------- |
| `RADAR_API_KEY`  | Server-side adapter              |
| `USE_MOCK_RADAR` | Adapter factory (default `true`) |

In mock mode, the adapter returns a configurable fake state. Useful for
testing the blocked-state UX without a VPN.

---

## SendGrid — transactional + marketing email

**What it does**: sends every email (welcome, KYC outcome, redemption
confirmations, CRM campaigns).

| Surface              | Path                                             |
| -------------------- | ------------------------------------------------ |
| Adapter              | `packages/core/src/adapters/sendgrid/`           |
| Webhook receiver     | `apps/web/app/api/webhooks/sendgrid/v1/route.ts` |
| Worker handler       | `apps/worker/src/inngest/webhook-sendgrid.ts`    |
| Email Center compose | `/admin/email-center`                            |

### Credentials

| Env var                   | Where used                 |
| ------------------------- | -------------------------- |
| `SENDGRID_API_KEY`        | Adapter                    |
| `SENDGRID_FROM_EMAIL`     | Verified sender            |
| `SENDGRID_WEBHOOK_SECRET` | Event webhook verification |
| `USE_MOCK_SENDGRID`       | Adapter factory            |

### Webhook ingest

SendGrid posts a stream of `processed/delivered/open/click/bounce/spam`
events to our webhook. The handler updates `crm_message_log` per
message (matched by the custom `cf_message_id` header we set on
outbound) so the Email Center inbox shows live status.

---

## Twilio — transactional + marketing SMS

**What it does**: sends every SMS (2FA SMS fallback isn't enabled in
v1 — we use TOTP; SMS is CRM-only).

| Surface          | Path                                           |
| ---------------- | ---------------------------------------------- |
| Adapter          | `packages/core/src/adapters/twilio/`           |
| Webhook receiver | `apps/web/app/api/webhooks/twilio/v1/route.ts` |
| Worker handler   | `apps/worker/src/inngest/webhook-twilio.ts`    |

### Credentials

| Env var                 | Where used                            |
| ----------------------- | ------------------------------------- |
| `TWILIO_ACCOUNT_SID`    | Adapter                               |
| `TWILIO_AUTH_TOKEN`     | Adapter                               |
| `TWILIO_WEBHOOK_SECRET` | Twilio request signature verification |
| `TWILIO_FROM_NUMBER`    | Verified sender phone number          |
| `USE_MOCK_TWILIO`       | Adapter factory                       |

---

## EasyScam — AMOE (Alternative Method of Entry)

**What it does**: free Sweeps Coins entries via the no-purchase
necessary path. Players (or anyone) can request free SC via a
postal/email AMOE handled by EasyScam.

| Surface               | Path                                             |
| --------------------- | ------------------------------------------------ |
| Adapter               | `packages/core/src/adapters/easyscam/`           |
| Polling cron          | `apps/worker/src/jobs/poll-easyscam.ts` (hourly) |
| Public AMOE page      | `/amoe`                                          |
| Bonus engine handling | `packages/core/src/bonus/`                       |

### Credentials

| Env var             | Where used      |
| ------------------- | --------------- |
| `EASYSCAM_API_KEY`  | Adapter         |
| `EASYSCAM_API_BASE` | Adapter         |
| `USE_MOCK_EASYSCAM` | Adapter factory |

### Pull model

EasyScam doesn't push webhooks; we poll their endpoint hourly for new
entries since the last cursor. Each entry creates a `bonus_award` for
the matched player.

---

## Cloudflare R2 — object storage

**What it does**: stores generated exports (`data_exports`), uploaded
KYC documents (when not handled by Footprint's own storage), and CMS
assets.

| Surface | Path                                             |
| ------- | ------------------------------------------------ |
| Adapter | `packages/core/src/adapters/r2/`                 |
| Used by | Export Center, file uploads, signed-URL fetches. |

### Credentials

| Env var                | Where used |
| ---------------------- | ---------- |
| `R2_ACCOUNT_ID`        | Adapter    |
| `R2_ACCESS_KEY_ID`     | Adapter    |
| `R2_SECRET_ACCESS_KEY` | Adapter    |
| `R2_BUCKET`            | Adapter    |

Signed URLs use `@aws-sdk/s3-request-presigner` (R2 is S3-compatible).
Default expiry: 1 hour. Rotated daily by `expireDownloadLinks`.

---

## Upstash Redis — cache + ephemeral state

**What it does**: balance snapshot cache (30s TTL), CRM compile cache,
rate limits, ephemeral state (pending 2FA tokens, password-reset
tokens).

| Surface | Path                                                |
| ------- | --------------------------------------------------- |
| Client  | `packages/core/src/ledger/redis.ts` (small wrapper) |

### Credentials

| Env var     | Where used       |
| ----------- | ---------------- |
| `REDIS_URL` | All Redis access |

If `REDIS_URL` is unset, the cache layer no-ops gracefully (every read
hits Postgres). Useful for local dev without Redis.

---

## Pusher Channels — real-time

**What it does**: pushes balance updates, big-win celebrations, live
wins ticker entries, and admin dashboard counters to subscribed
clients.

| Surface           | Path                                                                              |
| ----------------- | --------------------------------------------------------------------------------- |
| Server publisher  | `packages/core/src/realtime/`                                                     |
| Client subscriber | `apps/web/app/(player)/_realtime.tsx`, `apps/web/app/(admin)/admin/_realtime.tsx` |
| Channel auth      | `apps/web/app/api/realtime/auth/route.ts`                                         |
| Worker publisher  | `apps/worker/src/jobs/publish-dashboard-counters.ts`                              |

### Credentials

| Env var                      | Where used                            |
| ---------------------------- | ------------------------------------- |
| `PUSHER_APP_ID`              | Server publisher                      |
| `PUSHER_KEY`                 | Server publisher (matches public key) |
| `PUSHER_SECRET`              | Server publisher (used to sign auth)  |
| `PUSHER_CLUSTER`             | Both sides                            |
| `NEXT_PUBLIC_PUSHER_KEY`     | Browser                               |
| `NEXT_PUBLIC_PUSHER_CLUSTER` | Browser                               |

### Channels

| Channel                     | Who subscribes      | What's published                               |
| --------------------------- | ------------------- | ---------------------------------------------- |
| `private-player-<uuid>`     | The player          | Balance updates, big-win events, bonus claims. |
| `live-wins`                 | All players (lobby) | Anonymised "Player X won $Y" entries.          |
| `private-admin-dashboard`   | All admins          | Dashboard counters (every 5s).                 |
| `private-admin-host-<uuid>` | A specific host     | Inbox pings, VIP activity.                     |

`private-*` channels require auth via `/api/realtime/auth` which
validates the session before signing.

---

## Inngest — queues + cron

**What it does**: hosts every async function on `apps/worker`. Web app
emits events; worker consumes them.

| Surface           | Path                                   |
| ----------------- | -------------------------------------- |
| Client (emit)     | `apps/web/lib/inngest-client.ts`       |
| Function registry | `apps/worker/src/inngest/functions.ts` |
| Jobs              | `apps/worker/src/jobs/`                |

### Credentials

| Env var               | Where used                             |
| --------------------- | -------------------------------------- |
| `INNGEST_EVENT_KEY`   | Web app (sender)                       |
| `INNGEST_SIGNING_KEY` | Worker (receiver, verifies signatures) |

In dev, Inngest's local dev server can be started separately and points
at `http://localhost:3030/api/inngest`. Optional — if absent, events
just buffer.

---

## Sentry / Axiom / Grafana / PagerDuty — observability

| Tool          | Purpose                                                      | Env var(s)              |
| ------------- | ------------------------------------------------------------ | ----------------------- |
| Sentry        | Error tracking (web + worker)                                | `SENTRY_DSN`            |
| Axiom         | Structured log aggregation                                   | `AXIOM_TOKEN`           |
| Grafana Cloud | Metric dashboards (perf budgets, GGR, NGR, redemption rates) | `GRAFANA_API_KEY`       |
| PagerDuty     | On-call paging for sev-1/sev-2 alerts                        | `PAGERDUTY_ROUTING_KEY` |

The four are independent. Wiring lives in `apps/web/lib/` and
`apps/worker/src/lib/`. Default dev mode logs to stdout via
`consoleLogger`.

---

## Doppler — secrets

**What it does**: single source of truth for every secret. Mirrors into
Vercel, Fly, GitHub Actions.

```bash
# Pull all secrets into local .env.local
doppler setup --project coinfrenzy --config dev
doppler secrets download --no-file --format env > apps/web/.env.local

# Push to Fly (worker)
doppler run -- flyctl secrets import --app coinfrenzy-worker < secrets.env

# Mirror to Vercel (auto-sync via integration)
doppler integrations create vercel
```

See `runbooks/secret_rotation.md` (root `runbooks/`) for the rotation
pattern (7-day overlap on HMAC secrets).

---

## Intercom — live support (planned)

`INTERCOM_ACCESS_TOKEN` is in the env schema for the planned Intercom
live-chat integration. The `/live-support` route exists as a stub; the
real Intercom widget isn't wired yet. See `13-known-gaps.md`.

---

## 1099-MISC reporting — STUBBED

For redemptions over the IRS threshold ($600/yr/payee), we owe a
1099-MISC. The platform has:

- The data: `core.redemption.tax-rollup.ts` and the annual cron
  `annual-tax-rollup.ts` aggregate by player by year.
- The UI: `/admin/reports/tax` and `/admin/players/[id]` show
  per-player YTD totals.
- The blob: not yet implemented. **Vendor not yet selected** — likely
  Track1099 or TaxBandits. PDF generation + filing endpoints are
  stubbed. See `13-known-gaps.md`.

---

## How to flip a vendor from mock to real

1. Get the real credentials from the vendor portal.
2. Add them to Doppler (`dev`, `staging`, `prod` configs).
3. Mirror to Vercel + Fly + GitHub Actions secrets.
4. Set `USE_MOCK_<VENDOR>=false` in the same config(s).
5. Confirm `apps/web` and `apps/worker` re-deploy with the new env.
6. Visit `/admin/integrity` — the "Mock Mode" badge for that vendor
   should disappear.
7. Run an end-to-end smoke (e.g. start a real Finix purchase intent in
   sandbox).

---

## How to add a new vendor

1. Read `docs/02 §7` (adapter pattern).
2. Create `packages/core/src/adapters/<vendor>/` with
   `client-mock.ts`, `client-real.ts`, optionally `verify-webhook.ts`,
   `types.ts`, and `index.ts`.
3. Add the env vars to `packages/config/src/env.ts` (and to
   `.env.example`).
4. Add a `USE_MOCK_<VENDOR>` boolean to the same schema.
5. Wire the adapter factory into `packages/core/src/adapters/index.ts`.
6. If the vendor has webhooks, add `/api/webhooks/<vendor>` and a
   worker handler.
7. Add an Integrity page tile so operators can see live/mock + recent
   error rates.
8. Update `HANDOFF/11-integrations.md` (this file) with the new vendor.

---

## What to read next

- `13-known-gaps.md` — what's stubbed and pending.
- `20-credentials-and-access.md` — full env var inventory.
- `docs/05_webhooks.md` — webhook patterns in depth.
