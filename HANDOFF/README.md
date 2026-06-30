# CoinFrenzy Handoff Package

Welcome. This folder is the complete, self-contained onboarding package for
the dev team taking over CoinFrenzy v2. Everything you need to read the
codebase, run it locally, ship features, and operate it in production is
documented here.

---

## What CoinFrenzy is, in one paragraph

CoinFrenzy is a US-legal **sweepstakes social casino** operated by Lucky
Labz LLC. Players buy **Gold Coins (GC)** for play and receive **Sweeps
Coins (SC)** as a bonus; SC won at games can be redeemed for cash. This
codebase is a from-scratch v2 platform that replaces the existing Gamma
operator. It's a Next.js 15 + Drizzle + Neon Postgres monorepo with a
player-facing site, a full admin/operator back-office, a host portal for
VIP managers, a CRM, and an Inngest worker for cron/async work. Game
content is iframed in from the **Alea** aggregator; payments and ACH
redemptions run through **Finix**; KYC through **Footprint**.

---

## How to use this folder

You're a senior engineer being handed an unfamiliar codebase. Read these
in roughly this order:

1. `00-quick-start.md` — get the app running on your machine in 30 minutes.
2. `01-project-overview.md` — what we built and why (business + product).
3. `02-architecture.md` — tech stack and system shape at the 30,000-ft view.
4. `03-codebase-tour.md` — folder-by-folder map so you can navigate quickly.
5. `19-glossary.md` — keep this open in another tab; we use a lot of
   sweepstakes-specific vocabulary.

After that, dip into the deep-dive docs as needed:

- **Money & ledger correctness**: `10-ledger-and-money.md` (most important
  file in the package — read before touching anything that moves coins).
- **Database**: `04-database.md` + `architecture-diagrams/data-model.md`.
- **Auth & permissions**: `05-authentication.md`, `15-security-and-compliance.md`,
  `architecture-diagrams/auth-flow.md`.
- **Admin platform**: `06-admin-platform.md`.
- **Player platform**: `07-player-platform.md`.
- **CRM**: `08-crm-system.md`.
- **VIP / Host**: `09-vip-host-system.md`.
- **Vendor integrations**: `11-integrations.md`.
- **Deployment**: `12-deployment.md` + `runbooks/`.
- **What's NOT done**: `13-known-gaps.md` — read this before promising
  timelines.
- **What to build first**: `14-recommended-next-work.md` — prioritized
  backlog with effort estimates.
- **Pre-launch blockers**: `21-pre-launch-blockers.md` — the P0 / P1 / P2
  list of things to fix before processing real money.
- **What changed at handoff**: `22-recent-changes.md` — the May 27 → Jun 1
  delta (dashboard rewrite, monetization breakdown, dev autologin, etc.).
  Read this when a May 27 doc seems to disagree with the live code.

Operational procedures live in `runbooks/`. Visual diagrams (mermaid)
live in `architecture-diagrams/`. Historical session reports written
during the build are in `reports/`.

---

## Files in this package

```
HANDOFF/
├── README.md                       (this file)
├── 00-quick-start.md               day-one local setup
├── 01-project-overview.md          business model + product
├── 02-architecture.md              tech stack + system design
├── 03-codebase-tour.md             folder-by-folder map
├── 04-database.md                  schema, migrations, RLS
├── 05-authentication.md            Better Auth, HMAC, 2FA
├── 06-admin-platform.md            every admin page
├── 07-player-platform.md           every player page
├── 08-crm-system.md                segments, campaigns, flows
├── 09-vip-host-system.md           host portal, weekly caps, 5-layer auth
├── 10-ledger-and-money.md          how money flows (CRITICAL)
├── 11-integrations.md              Alea, Finix, Footprint, Radar, …
├── 12-deployment.md                Vercel + Fly + Neon
├── 13-known-gaps.md                what's NOT built
├── 14-recommended-next-work.md     prioritized backlog
├── 15-security-and-compliance.md   5-layer auth, RLS, audit, jurisdictions
├── 16-testing.md                   how to run / add tests
├── 17-conventions.md               do this, not that
├── 18-troubleshooting.md           common dev issues
├── 19-glossary.md                  SC / GC / AMOE / KYC / RG / etc.
├── 20-credentials-and-access.md    every secret, where it lives
├── 21-pre-launch-blockers.md       P0/P1/P2 list before processing real money
├── 22-recent-changes.md            May 27 → handoff delta (read if older docs conflict)
├── reports/                        historical Cursor session reports
├── architecture-diagrams/          mermaid diagrams
│   ├── system-overview.md
│   ├── data-model.md
│   ├── auth-flow.md
│   ├── ledger-flow.md
│   └── deploy-pipeline.md
└── runbooks/
    ├── deploy-to-staging.md
    ├── deploy-to-production.md
    ├── rollback.md
    ├── add-new-game.md
    ├── publish-new-terms-version.md
    ├── onboard-new-host.md
    └── incident-response.md
```

---

## What lives outside this folder (also worth reading)

- `/docs/` — the original 13 architecture documents (~11,000 lines).
  Treat them as the _constitution_ of the codebase. They are organized
  by domain (data model, ledger, webhooks, bonus engine, CRM, …). The
  `.cursorrules` file at the repo root maps each task type to the
  relevant doc.
- `/docs/_reports/` — composer session reports.
- `/runbooks/` — the _pre-handoff_ runbooks (deploy, secret rotation,
  incident response, cutover night). Those still apply. The new
  `HANDOFF/runbooks/` adds operator-level procedures (add a game, onboard
  a host, etc.) on top.
- `/reference/` — local-only reference materials (the old Frenzy Creator
  codebase, the website-redesign assets, the admin-backend zip). This
  folder is gitignored.

---

## A note on accuracy

Every file path and feature reference in this package was verified
against the repo at handoff time. If you find a discrepancy (a file
moved, a feature renamed) please update the doc in the same PR. The
package is meant to stay in sync with the code, not freeze in time.
