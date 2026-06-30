# CoinFrenzy Casino — v2 Platform

US-legal sweepstakes social casino built by Lucky Labz LLC. Replaces the
existing Gamma operator. Next.js 15 + Drizzle + Neon Postgres monorepo
with a player site, a full admin/operator back-office, a host portal for
VIP managers, a CRM, and an Inngest worker for cron + async work.

---

## I'm new here — where do I start?

You are likely an engineer being onboarded. The complete handoff package
is in [`HANDOFF/`](./HANDOFF/). Read these in this order:

1. [`HANDOFF/README.md`](./HANDOFF/README.md) — the orientation doc.
2. [`HANDOFF/00-quick-start.md`](./HANDOFF/00-quick-start.md) — get the
   app running locally in ~30 minutes.
3. [`HANDOFF/01-project-overview.md`](./HANDOFF/01-project-overview.md)
   — what the business is and what we built.
4. [`HANDOFF/02-architecture.md`](./HANDOFF/02-architecture.md) — tech
   stack and system shape.
5. [`HANDOFF/03-codebase-tour.md`](./HANDOFF/03-codebase-tour.md) —
   folder-by-folder map.
6. [`HANDOFF/13-known-gaps.md`](./HANDOFF/13-known-gaps.md) — what's
   **not** done. Read before promising any timeline.
7. [`HANDOFF/14-recommended-next-work.md`](./HANDOFF/14-recommended-next-work.md)
   — prioritized backlog with effort estimates.

Open the [glossary](./HANDOFF/19-glossary.md) in another tab while you
read — sweepstakes uses a lot of domain-specific vocabulary.

The most recent delta (the May 27 → Jun 1 polish work — dashboard
rewrite, players-page rewrite, monetization breakdown, dev autologin) is
documented in
[`HANDOFF/22-recent-changes.md`](./HANDOFF/22-recent-changes.md).

---

## tl;dr — run it locally

```bash
# 1. install
pnpm install

# 2. fill in apps/web/.env.local (copy from .env.example)
cp .env.example apps/web/.env.local
# minimum: DATABASE_URL, DATABASE_URL_DIRECT, BETTER_AUTH_SECRET (32+
# chars), ADMIN_SESSION_SECRET (32+ chars), ENCRYPTION_KEY_CURRENT
# (32+ chars). Generate with: openssl rand -hex 32

# 3. migrate + seed
pnpm -F @coinfrenzy/db db:migrate
pnpm -F @coinfrenzy/db db:seed-admin   # uses BOOTSTRAP_ADMIN_* env vars
pnpm -F @coinfrenzy/db seed:realistic  # populates fake players/activity

# 4. dev
pnpm dev
# → http://localhost:3000  (player + marketing)
# → http://localhost:3000/admin/login  (admin)
# → http://localhost:3030/healthz       (worker)

# 5. verify
pnpm typecheck && pnpm lint && pnpm test
```

Dev shortcut: setting `DEV_PLAYER_AUTOLOGIN=true` in `apps/web/.env.local`
auto-impersonates the first seeded player on `/lobby` so you can browse
the player surface without signing up. Hard-rejected when
`NODE_ENV=production`.

---

## Repository layout

```
apps/
  web/        Next.js 15 app — player + admin + marketing + auth + APIs
  worker/     Fly.io worker — Inngest functions, cron, queues, scripts

packages/
  config/     Env schema, shared types, currency constants
  core/       ALL business logic (ledger, bonus, redemption, crm, kyc, …)
  db/         Drizzle schema, migrations, seed scripts
  ui/         Shared React components (admin + player + marketing)

docs/         13 architecture documents (~11,000 lines) — the constitution
prompts/      12 build prompts used to scaffold the system originally
runbooks/     Operational procedures (deploy, secrets, incidents, cutover)
HANDOFF/      Full onboarding package (read this first — see above)
reference/    Local-only reference materials (gitignored)
```

The non-negotiable rule: **all business logic lives in `packages/core`**.
Apps (`apps/web`, `apps/worker`) are thin transports — they parse input,
call core functions, format output. The full architecture rules are in
[`.cursorrules`](./.cursorrules).

---

## Stack — locked

| Layer           | Choice                                                      |
| --------------- | ----------------------------------------------------------- |
| Framework       | Next.js 15 (App Router) + React 19                          |
| Language        | TypeScript strict                                           |
| ORM             | Drizzle (NOT Prisma)                                        |
| Database        | Neon Postgres (pooled + direct)                             |
| Styling         | Tailwind v3 + shadcn/ui                                     |
| Player auth     | Better Auth                                                 |
| Admin auth      | HMAC sessions + TOTP (custom — see docs/09)                 |
| Queue / cron    | Inngest                                                     |
| Worker host     | Fly.io                                                      |
| Real-time       | Pusher Channels                                             |
| Object storage  | Cloudflare R2                                               |
| Cache           | Upstash Redis (planned)                                     |
| Email / SMS     | SendGrid + Twilio                                           |
| KYC             | Footprint                                                   |
| Payments + ACH  | Finix                                                       |
| Geo             | Radar                                                       |
| Game aggregator | Alea                                                        |
| Observability   | Sentry + Axiom + Grafana Cloud + PagerDuty                  |
| Secrets         | Doppler                                                     |
| Tests           | Vitest + fast-check + Testcontainers + Playwright (planned) |

Don't propose substitutions. Each was picked deliberately and the docs
assume the choice.

---

## What's done, what isn't

- **Built and working**: ledger + wallet, bonus engine + playthrough,
  redemption flow + KYC, full admin panel (~100 pages), full player surface
  (~25 pages), CRM (segments + campaigns + flows), VIP host portal,
  webhook handlers (Finix, Alea, Footprint, Radar, SendGrid, Twilio with
  mocks for dev), 35-table Drizzle schema with RLS, Gamma migration
  pipeline (`packages/core/src/migration/`), cutover runbook.
- **Tests**: 246 unit + property tests passing in `packages/core` (ledger
  - bonus heavy). E2E (Playwright) is **not** written. App-level tests
    are sparse.
- **Production-hardening gaps**: see
  [`HANDOFF/21-pre-launch-blockers.md`](./HANDOFF/21-pre-launch-blockers.md)
  for the full P0 / P1 / P2 list (idempotency keys, RLS runtime check,
  reconciliation drift, SendGrid ECDSA verification, CI gating, etc.).

---

## Common commands

```bash
pnpm dev                       # Turbo dev: web on :3000, worker on :3030
pnpm typecheck                 # tsc --noEmit across all workspaces
pnpm lint                      # ESLint
pnpm test                      # vitest (mostly packages/core)
pnpm build                     # Turbo production build

# database
pnpm -F @coinfrenzy/db db:migrate          # apply pending migrations
pnpm -F @coinfrenzy/db db:migrate:status   # show applied + pending
pnpm -F @coinfrenzy/db db:generate         # generate migration from schema
pnpm -F @coinfrenzy/db db:seed-admin       # bootstrap first admin
pnpm -F @coinfrenzy/db seed:realistic      # fake players + activity

# worker (locally)
pnpm -F @coinfrenzy/worker dev
```

---

## Where to put new code

| You're building                               | It belongs in                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| A new business rule, computation, or workflow | `packages/core/<domain>/`                                                |
| A new admin page                              | `apps/web/app/(admin)/admin/<route>/`                                    |
| A new player page                             | `apps/web/app/(player)/<route>/`                                         |
| A new HTTP endpoint                           | `apps/web/app/api/<area>/<route>/route.ts` (parse + call core; no logic) |
| A new background job / cron                   | `apps/worker/src/jobs/<name>.ts` (call core)                             |
| A new shared React component                  | `packages/ui/src/<surface>/<Component>.tsx`                              |
| A new DB table                                | `packages/db/src/schema/<domain>.ts` + new migration                     |
| Shared types / Zod schemas / constants        | `packages/config/src/`                                                   |

If a task crosses the line (e.g. "add a dashboard counter"), do the
service helper in `packages/core/src/reports/` and call it from the page.
The page should not own the SQL.

---

## Help

- Architecture questions → relevant doc in `docs/` (map in
  [`.cursorrules`](./.cursorrules) and [`00_index.md`](./00_index.md)).
- Codebase questions → relevant doc in `HANDOFF/`.
- Operational questions → `runbooks/` and `HANDOFF/runbooks/`.
- Vendor integrations → [`HANDOFF/11-integrations.md`](./HANDOFF/11-integrations.md).

If something in `docs/` is genuinely ambiguous, ping the founder — he can
get the original architect to weigh in.
