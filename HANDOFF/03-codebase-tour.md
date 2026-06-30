# 03 · Codebase Tour

A folder-by-folder map. Use this when you need to find code fast or
understand what does what at a glance.

---

## Repo root

```
coinfrenzy-casino/
├── .cursorrules               Agent rules — read once, the constitution.
├── .env.example               Template for apps/web/.env.local.
├── .github/workflows/         CI (ci.yml), deploy (deploy.yml), db-migrate (db-migrate.yml).
├── 00_index.md                Lookup map from task → docs file.
├── README.md                  Founder-facing "how to use the prompts".
├── apps/                      Deployed services (web, worker).
├── docs/                      The 13 architecture docs (~11,000 lines).
├── docs/_reports/             Per-session composer reports.
├── package.json               Root scripts (turbo dev/build/lint/typecheck/test).
├── packages/                  Shared workspaces (core, db, ui, config).
├── pnpm-workspace.yaml        Workspace declaration.
├── prompts/                   Pre-written prompts used during the build (01 → 12).
├── reference/                 Local-only reference (gitignored).
├── runbooks/                  Pre-handoff ops runbooks (deploy, cutover, secrets).
├── tsconfig.base.json         Root TS config.
└── turbo.json                 Turbo pipeline (dev/build/lint/typecheck/test).
```

---

## `apps/web` — the Next.js 15 app

Everything a browser talks to lives here. App Router only.

```
apps/web/
├── app/
│   ├── (admin)/admin/         Admin + host portal (route group)
│   ├── (auth)/                Login, signup, mfa, password reset, verify email
│   ├── (marketing)/           Landing, /about, /terms, /privacy, /p/[slug]
│   ├── (player)/              Lobby, /games, /cashier, /account, /vip, …
│   ├── (public)/              Static-ish public routes
│   ├── api/                   HTTP API routes
│   │   ├── admin/             Admin-only REST endpoints (28 areas)
│   │   ├── auth/              Better Auth + admin auth handlers
│   │   ├── dev/               Dev-only seed/fixture endpoints
│   │   ├── games/             Player game launch
│   │   ├── mock-vendors/      Local mock-vendor callbacks (Alea/Finix/Footprint)
│   │   ├── player/            Player REST endpoints (purchase, redeem, …)
│   │   ├── realtime/          Pusher channel auth
│   │   └── webhooks/          Live vendor webhooks (alea, finix, footprint, sendgrid, twilio)
│   ├── mock-vendors/          The mock-vendor UI pages (visit /mock-vendors locally)
│   ├── globals.css            Tailwind base + admin tokens
│   └── layout.tsx             Root layout (fonts, providers)
├── components/                App-specific React (small)
├── lib/                       App-only helpers
│   ├── admin-route.ts         Server-side helpers for admin route handlers
│   ├── admin-rsc-context.ts   Build a core Context from an admin RSC request
│   ├── admin-session.ts       Cookie/session readers for /api/admin routes
│   ├── auth.ts                Better Auth instance
│   ├── auth-client.ts         Browser-side Better Auth wrapper
│   ├── format.ts              Money / date display
│   ├── games-catalog.ts       Player game catalog helper
│   ├── inngest-client.ts      Inngest client wrapper for emitting events
│   ├── player-categories.ts   Hardcoded category list (used when USE_DB_LOBBY_LAYOUT=false)
│   ├── player-data.ts         Player RSC data fetchers
│   ├── player-session.ts      Player session readers
│   ├── report-csv.ts          CSV streaming helpers used by admin export endpoints
│   ├── webhook-context.ts     Build Context for webhook handlers
│   └── webhook-route.ts       Shared parsing helpers for /api/webhooks/*
├── middleware.ts              Edge middleware — auth + host gating
├── next.config.mjs
├── package.json
├── postcss.config.mjs
├── public/                    Static assets (brand, favicon, OG images)
├── tailwind.config.ts
├── tsconfig.json
└── vercel.json                Vercel build + headers + redirects
```

### `apps/web/app/(admin)/admin/` — every admin section

Each section is its own folder with the same shape:

```
<section>/
├── page.tsx             RSC server page (fetch + render shell)
├── _panel.tsx           Client component (table, dialogs)
├── _data.ts             Server-only data fetchers + types
├── _form.tsx (if CRUD)  Shared form used by new + [id]
├── new/page.tsx (CRUD)  Defaults
└── [id]/page.tsx (CRUD) Populate + render
```

Sections (high level):

- `account/` — Admin's own profile + 2FA + password.
- `admin-added-coins/` — Manual SC/GC adjustments.
- `audit/` — Read-only `audit_log` viewer.
- `banners/` — Player-facing promotional banners.
- `bonus/` — Bonus templates, active awards, playthrough, manual award.
- `cashier/` — Pending / approved / cancelled / aml-hold redemptions, redeem rules.
- `casino/` — Providers, games, lobby editor, aggregators, sub-categories.
- `cms/` — Dynamic CMS pages with live preview.
- `crm/` — Segments, cohorts, campaigns, flows, email/sms templates, message log, suppression, library.
- `domain-blocking/` — Block email domains at signup.
- `email-center/` — Compose, filtered inbox, detail dialog.
- `exports/` — Export Center + scheduled report subscriptions.
- `integrity/` — Vendor health + reconciliation status; mock-mode badges.
- `messages/` — Inbox-style admin messaging (host channels).
- `migration/` — Gamma migration pipeline runs.
- `notifications/` — In-app notification compose + log.
- `packages/` — Coin packages with featured-slot management.
- `players/` — Player list + detail (KYC, RG, wallet, action dialogs).
- `promo-codes/` — Active / archived / bonus / restrictions.
- `promocode-blocking/` — Blocked promo codes list.
- `reports/` — affiliate / bonus / custom-query / daily-kpis / playthrough / purchase / redeem-rate / tax / users-daily.
- `settings/` — Operator settings; safety caps; terms versions.
- `staff/` — Admin CRUD (master only).
- `tiers/` — Loyalty tiers with hard caps.
- `transactions/` — Purchases / redemptions / bonus-awards / casino / banking / redeem-requests.
- `vip/` — Master / manager-facing VIP overview, hosts, assignments.
- `vips/` — Host-facing VIP queue (singular `vip/` for master, plural `vips/` for host — intentional dual route, see `09-vip-host-system.md`).

Top-level admin pieces:

- `layout.tsx` — Decides between `AdminShell` and `HostShell` based on role.
- `page.tsx` — The dashboard.
- `dashboard-client.tsx` + `dashboard-data.ts` — Dashboard wiring.
- `admin-shell.tsx` — Full admin chrome (sidebar, topbar).
- `host-shell.tsx` — Host portal chrome (restricted sidebar).
- `_host-dashboard.tsx` — Host-specific dashboard view.
- `_providers.tsx` — Admin-side TanStack Query, theme.
- `_realtime.tsx` — Pusher subscription wiring for admin dashboard.

### `apps/web/app/(player)/` — the player surface

```
(player)/
├── _shell.tsx          Sidebar + topbar chrome for logged-in player
├── _providers.tsx      TanStack Query + shop modal + rewards context
├── _realtime.tsx       Pusher subscription (balance, big wins)
├── _terms-banner.tsx   "We've updated our terms" banner
├── account/            Profile, KYC, RG, transactions
├── bonuses/            Active + pending + history
├── cashier/            Shop + redeem
├── casino-games/       Category page (e.g. /casino-games/slots)
├── favorites/          Favorited games
├── games/              [slug] game launch (iframes Alea)
├── live-support/       Live chat surface (Intercom hook)
├── lobby/              The main lobby (game grid + ticker + hero)
├── promotions/         Active promotional offers + AMOE info
├── recent-games/       Recently played
├── referrals/          Referral program
├── shop/               Standalone shop route (mostly redirects into lobby modal)
├── support/            FAQ / contact / open ticket
├── vip/                VIP perks + tier ladder
├── layout.tsx          Player root layout (wraps _shell + providers)
├── error.tsx
└── loading.tsx
```

### `apps/web/app/(marketing)/` — public marketing + legal

```
(marketing)/
├── _legal-doc.tsx              Shared chrome for legal pages
├── layout.tsx
├── page.tsx                    Landing
├── about/
├── amoe/                       The Alternative Method of Entry page
├── contact/
├── faq/
├── p/[slug]/                   Generic CMS page renderer
├── privacy/
├── responsible-gaming/
├── sweepstakes-rules/
└── terms/
```

### `apps/web/app/(auth)/`

`login`, `signup`, `mfa`, `reset-password`, `verify-email`. Better
Auth-based player auth lives here; admin auth lives at `/admin/login`,
`/admin/mfa` (in the admin route group).

### `apps/web/app/api/`

REST endpoints, organized by audience.

- `admin/` — admin-only. Always require an admin session via
  `requireAdminSession`. 28 subfolders mirroring the admin sections.
- `player/` — player-only. Always require a Better Auth session via
  `requirePlayerSession`. Subfolders: `bonus`, `kyc`, `notifications`,
  `packages`, `promo`, `purchase`, `redemptions`, `rg`, `search-index`,
  `sessions`, `signup`, `terms`, `wallets`.
- `webhooks/` — vendor-incoming. Verify signature, drop into
  `pending_webhooks`, fire Inngest event. Five vendors:
  `alea`, `finix`, `footprint`, `sendgrid`, `twilio`.
- `mock-vendors/` — local fixture callbacks (used by the
  `/mock-vendors` UI).
- `auth/` — Better Auth + admin auth handlers.
- `dev/` — dev-only seed/fixture endpoints (gated by
  `requireAdminSession`; should also assert `NODE_ENV !== 'production'`
  — see report 2026-05-19 §4.6 for that recommendation).
- `games/` — player game session start.
- `realtime/` — Pusher channel auth endpoint.

### `apps/web/app/mock-vendors/`

A local mock-vendor dashboard you can visit at `/mock-vendors` while
the corresponding `USE_MOCK_*` flag is on. Lets you simulate a Finix
purchase, a Footprint KYC verdict, an Alea game session — all without
real vendor credentials. The router pages are `/mock-vendors/alea`,
`/mock-vendors/finix`, `/mock-vendors/footprint`.

---

## `apps/worker` — the Fly.io worker

```
apps/worker/
├── Dockerfile             Node 20 alpine + tsx-built dist
├── fly.toml               Single 1 GB shared-cpu machine, IAD
├── package.json
├── src/
│   ├── index.ts           HTTP server (/healthz + /api/inngest)
│   ├── inngest/
│   │   ├── client.ts       Inngest client (event key + signing key)
│   │   ├── functions.ts    All registered functions
│   │   ├── webhook-alea.ts
│   │   ├── webhook-finix.ts
│   │   ├── webhook-footprint.ts
│   │   ├── webhook-sendgrid.ts
│   │   └── webhook-twilio.ts
│   ├── jobs/              Cron + queue jobs (32+ files — see Section "Worker jobs" below)
│   ├── lib/               Worker-side helpers
│   └── scripts/           One-off scripts (balance-compare, replay-window, cutover-checklist)
└── tsconfig.json
```

### Worker jobs (`apps/worker/src/jobs/`)

| File                                                 | Cadence                                           | What it does                                            |
| ---------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------- |
| `aggregate-snapshots.ts`                             | hourly + nightly + rebuild on demand              | Rolls up `daily_operational_snapshots` (docs/12 §3-§4). |
| `annual-tax-rollup.ts`                               | yearly Jan 1                                      | Generates 1099-MISC source rollups (docs/07 §10).       |
| `crm-campaign-sender.ts`                             | per-event + AB winner decider + conversion attrib | Drives the CRM campaign engine (docs/11).               |
| `crm-flow-enroller.ts`                               | per-event                                         | Enrolls eligible players into active flows.             |
| `crm-flow-runner.ts`                                 | step interval                                     | Advances flow enrollments one step at a time.           |
| `expire-bonuses.ts`                                  | hourly                                            | Marks expired bonus awards forfeit (docs/06 §9).        |
| `gamma-import.ts` + `pullGammaSnapshot`              | manual + nightly                                  | The Gamma migration pipeline (docs/13).                 |
| `generate-export.ts` + `expireDownloadLinks`         | on enqueue + hourly                               | Export Center workers (docs/12 §7).                     |
| `hello.ts`                                           | once on boot                                      | Smoke test.                                             |
| `poll-easyscam.ts`                                   | hourly                                            | AMOE entries via EasyScam (docs/06 §11).                |
| `poll-stuck-redemptions.ts`                          | hourly                                            | Re-checks Finix payouts that haven't acked.             |
| `poll-stuck-transfers.ts`                            | hourly                                            | Generic transfer-stuck detection.                       |
| `publish-dashboard-counters.ts`                      | every 5 s                                         | Pushes the admin dashboard counters to Pusher.          |
| `reconcile-alea.ts`                                  | nightly                                           | Pulls Alea's round-level report; flags any drift.       |
| `reconcile-wallets.ts` + `reconcile-wallets-full.ts` | nightly + monthly                                 | Wallet balance vs ledger sum sanity check.              |
| `refresh-player-stats.ts` + `*-full.ts`              | hourly + nightly                                  | Materialised view-ish player attribute refresh for CRM. |
| `reset-integration-health-counters.ts`               | hourly                                            | Rolls the per-vendor 1h request/error counters.         |
| `send-scheduled-reports.ts`                          | hourly                                            | Honours `report_subscriptions` cadence.                 |
| `submit-redemption-to-finix.ts`                      | on event                                          | The actual Finix payout call after cashier approval.    |
| `vip-qualification.ts`                               | nightly                                           | Re-scores players against the VIP threshold.            |
| `weekly-tier-bonuses.ts` + `monthlyTierBonuses`      | weekly + monthly                                  | Tier-based SC payouts.                                  |

---

## `packages/core` — business logic (the heart)

```
packages/core/src/
├── adapters/              External vendor adapters (one folder per vendor)
│   ├── alea/              client-mock | client-real | verify-webhook | types | index
│   ├── easyscam/
│   ├── finix/
│   ├── footprint/
│   ├── r2/
│   ├── radar/
│   ├── sendgrid/
│   ├── twilio/
│   └── index.ts            adapterFactory() — picks mock vs real per env flag
├── audit/                  audit.record(ctx, …) — single writer for audit_log
├── auth/                   admin-session, admin-2fa, admin-login, login (player), password, permissions, player-signup
├── bonus/                  engine, compute-amount, expire, game-weight, playthrough, redeem-promo, triggers, claim-pending, list-pending, types
├── cashier/                redemption-rules
├── casino/                 aggregators, providers, games (admin views)
├── cms/                    admin (CRUD), markdown (in-house parser)
├── compliance/             blocked-states + helpers
├── context.ts              Context, Actor, AfterCommitQueue (see 02-architecture.md §1)
├── crm/                    Segment compiler + campaigns + flows + attributes (50+ attrs) + dispatchers + AB stats
├── email/                  Email Center (sendOneOffEmail, inbox, message detail)
├── errors/                 Result<T,E>, typed error classes
├── events/                 events.emit() (Inngest)
├── games/                  Game catalog + launch logic
├── index.ts                Barrel: re-exports every sub-module as a namespace
├── kyc/                    Footprint integration + KYC state machine
├── ledger/                 THE money engine — write, balance, reconcile, drain-order, transactions, money primitives
├── legal/                  Terms versions
├── logger.ts               Logger interface + consoleLogger + noopLogger
├── migration/              Gamma migration helpers (CSV parsers, transforms, replay-webhooks)
├── notifications/          Notification Center
├── packages/               Coin package admin CRUD
├── realtime/               Pusher publisher
├── redemption/             create / approve / reject / aml-action / eligibility / tax-rollup / submit-to-finix
├── reports/                Report queries + scheduled-reports
├── system/                 system_config table accessors (safety caps, etc.)
├── tiers/                  Loyalty tier admin CRUD (with TIER_CAPS)
├── vip/                    Qualification, host-bonus, interactions
└── webhooks/               Per-vendor webhook handlers (called by worker)
```

**Import rule**: app code imports from `@coinfrenzy/core` (the barrel),
not deep paths. The barrel re-exports each subdomain as a namespace, so
you write `core.ledger.write(...)` or `core.crm.compileSegment(...)`.

---

## `packages/db` — schema + migrations + seeds

```
packages/db/src/
├── _shared.ts          createdAt, updatedAt, deletedAt, money(), tstz(), playerStatus enum
├── client.ts           DbClient construction (postgres-js + drizzle)
├── index.ts            re-exports schema namespace + DbExecutor type
├── migrate.ts          Custom migration runner (records in _app_migrations)
├── migrations/         0000_init.sql → 0025_terms_versions.sql (26 files)
├── reset-admin.ts      Wipes + recreates an admin (dev only)
├── schema/             36 schema files (one per domain area)
├── seed-admin.ts       Bootstrap a single master admin from env
├── seed-fake-fixtures.ts
├── seed-fake-players.ts
├── seed-realistic-data.ts
├── seed-realistic-fix-dashboard.ts
├── seed-realistic-reconcile.ts
├── smoketest.ts        Verifies the DB has all expected tables
└── verify.ts           Lints the schema for missing indexes/RLS
```

Schema files (high level — see `04-database.md` for tables):

```
admin-adjustments.ts   admin.ts            affiliates.ts        audit.ts
auth.ts                blocklists.ts       bonuses.ts           casino-categories.ts
cms.ts                 compliance.ts       crm.ts               events.ts
exports.ts             games.ts            geo.ts               house-accounts.ts
integration-health.ts  kyc.ts              ledger.ts            migration.ts
packages.ts            payment-instruments.ts                   players.ts
promo-codes.ts         purchases.ts        redemption-rules.ts  redemptions.ts
snapshots.ts           stats.ts            system-config.ts     tiers.ts
vip.ts                 webhooks.ts
```

---

## `packages/ui` — shared React

```
packages/ui/src/
├── admin/             cards, crm, data, display, forms, host, interactive, layout
├── charts/            recharts wrappers
├── composite/         compound layouts that reach across primitives
├── lib/               className helpers
├── marketing/         marketing-only components
├── player/            player-only components (LiveWinsTicker, ShopModalRoot, FoxIllustration, …)
├── primitives/        shadcn-style primitives (Button, Input, Dialog, …)
├── styles/            Player + admin CSS tokens (--cf-red-*, --cf-gold-*, …)
├── theme/             Theme constants
└── tailwind.config.ts CSS-presets shared across apps
```

---

## `packages/config` — env + constants

```
packages/config/src/
├── constants/      Hardcoded operator constants (USD/SC ratios, KYC tiers, etc.)
├── env.ts          Zod-validated process.env (parseEnv + env())
├── index.ts
├── types/          Shared types
└── vendor-mode.ts  isMock(vendor) helper used by adapter factory
```

---

## `docs/` — the constitution

Thirteen architecture docs, ~11,000 lines total. `00_index.md` is the
task → doc lookup. Do not edit these docs casually — they're the
source of truth for the build. If something here disagrees with what
the code does, the disagreement is a bug in the docs OR the code; raise
it and we'll reconcile.

```
docs/
├── 00_index.md (lookup)         already at repo root as 00_index.md
├── 01_architecture_overview.md
├── 02_core_service_layer.md
├── 03_data_model_v3.md
├── 04_ledger_and_wallet.md
├── 05_webhooks.md
├── 06_bonus_engine_playthrough.md
├── 07_redemption_and_kyc.md
├── 08_admin_panel.md
├── 09_security_compliance_audit.md
├── 10_frontend_architecture.md
├── 11_crm.md
├── 12_reporting_dashboards_exports.md
├── 13_migration_from_gamma.md
├── ux-polish-audit.md (cross-cutting visual audit)
└── _reports/
    └── 2026-05-19_admin_backoffice_pass.md
```

---

## `runbooks/` (pre-handoff)

The original ops runbooks. Still valid; supplemented by
`HANDOFF/runbooks/` for operator procedures.

```
runbooks/
├── cutover_night.md       Detailed Gamma → CoinFrenzy cutover
├── deploy.md              Vercel + Fly deploy
├── incident_response.md   Sev classification + PagerDuty flow
└── secret_rotation.md     7-day overlap pattern for HMAC + Better Auth secrets
```

---

## `reference/` (gitignored)

The original Frenzy Creator codebase, the website-redesign assets, and
the admin-backend zip from the legacy operator. Useful only when you're
porting a specific feature; not part of the live build.

---

## What to read next

- `04-database.md` — schema deep dive.
- `06-admin-platform.md` — every admin page.
- `10-ledger-and-money.md` — the money engine.
