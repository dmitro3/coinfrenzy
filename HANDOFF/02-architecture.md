# 02 · Architecture

This is the 30,000-ft view of the stack and the system shape. Folder-by-
folder navigation lives in `03-codebase-tour.md`; data-model detail lives
in `04-database.md`. Skim this once, then refer back as needed.

---

## Tech stack — locked, do not substitute

| Layer               | Choice                                                                                                             | Why                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Web framework       | **Next.js 15** (App Router only)                                                                                   | RSC, route groups, server actions; the entire admin + player + marketing is in one Next app.                |
| Language            | **TypeScript** (`strict`)                                                                                          | Catches money / id mix-ups at compile time.                                                                 |
| ORM                 | **Drizzle ORM**                                                                                                    | SQL-first, type-safe, no codegen step, plays nicely with Neon serverless. _Prisma was explicitly rejected._ |
| Database            | **Neon Postgres** (15+)                                                                                            | Serverless branching for staging/PR DBs, generous free tier, AWS region matches Vercel.                     |
| Auth (players)      | **Better Auth**                                                                                                    | Cookie-based, email + password + magic link, plays well with Drizzle.                                       |
| Auth (admins)       | Custom HMAC session + TOTP 2FA                                                                                     | Audit-first session model; signed cookie with IP + UA binding (docs/09 §5.2).                               |
| UI primitives       | **shadcn/ui** + Tailwind v3                                                                                        | Owned-source components, no v4 alpha.                                                                       |
| Icons               | **lucide-react**                                                                                                   | Single tree-shakable source.                                                                                |
| Client data         | **TanStack Query v5**                                                                                              | Standard for client-side fetch + cache.                                                                     |
| Tables              | **TanStack Table v8**                                                                                              | Used by all DataTables in admin.                                                                            |
| Forms               | **react-hook-form** + **Zod**                                                                                      | Typed forms, server-validated.                                                                              |
| Flow builder        | **@xyflow/react**                                                                                                  | Visual CRM flow designer.                                                                                   |
| Rich text           | **TipTap**                                                                                                         | CRM email templates + CMS pages.                                                                            |
| DnD                 | **dnd-kit**                                                                                                        | Game reorder, lobby section reorder.                                                                        |
| Animations          | **framer-motion**                                                                                                  | Player UI delight (big-win reveals, ticker, popovers).                                                      |
| Queues + cron       | **Inngest**                                                                                                        | `apps/worker` hosts every function; web app emits events.                                                   |
| Worker host         | **Fly.io** (IAD)                                                                                                   | Single 1 GB shared-cpu machine; rolling deploys.                                                            |
| Web host            | **Vercel**                                                                                                         | Pre-built deploys via the `deploy.yml` workflow.                                                            |
| Object storage      | **Cloudflare R2**                                                                                                  | S3-compatible; signed URLs for exports + player uploads.                                                    |
| Cache + rate limits | **Upstash Redis**                                                                                                  | Sub-100 ms balance reads; rate limiting; ephemeral state.                                                   |
| Real-time           | **Pusher Channels**                                                                                                | Live wins ticker, dashboard counters, host portal pings.                                                    |
| Observability       | **Sentry** + **Axiom** + **Grafana Cloud** + **PagerDuty**                                                         | Errors / logs / metrics / on-call.                                                                          |
| Secrets             | **Doppler**                                                                                                        | Single source of truth; mirrors into Vercel + Fly + GitHub.                                                 |
| Email               | **SendGrid**                                                                                                       | Transactional + marketing (with webhook ingest).                                                            |
| SMS                 | **Twilio**                                                                                                         | Transactional + marketing (with webhook ingest).                                                            |
| Tests               | **Vitest** (unit), **fast-check** (properties), **Testcontainers** (integration), **Playwright** (planned for E2E) | Heavy on the ledger; lighter elsewhere.                                                                     |

---

## Monorepo layout (Turbo + pnpm workspaces)

```
apps/
  web/      Next.js 15 app — player, admin, marketing, API
  worker/   Fly.io Node service — Inngest functions + cron + healthz
packages/
  core/     ALL business logic (ledger, bonus, CRM, VIP, auth, integrations)
  db/       Drizzle schema + migrations + seed scripts
  ui/       Shared React components (player, admin, marketing, primitives)
  config/   Env schema, typed constants, vendor-mode toggles
```

Workspace aliases (`@coinfrenzy/core`, `@coinfrenzy/db`,
`@coinfrenzy/ui`, `@coinfrenzy/config`) are defined in
`pnpm-workspace.yaml` and `tsconfig.base.json`.

The **non-negotiable rule** of this monorepo: all business logic lives
in `packages/core`. Apps (`apps/web`, `apps/worker`) are transports —
they parse input, call `core.*` functions, format output. Route handlers
must not contain logic beyond parsing/serialisation. This rule is in
`.cursorrules`; please keep it.

---

## Two apps, one product

### `apps/web` (Vercel · Next.js 15)

Hosts **everything** a browser hits:

- The marketing site (`/`, `/about`, `/p/[slug]`, `/terms`, …) under
  `app/(marketing)/`.
- The player surface (`/lobby`, `/games/[slug]`, `/cashier`, `/account`,
  `/promotions`, `/vip`) under `app/(player)/`.
- The full admin (`/admin/*`) under `app/(admin)/`.
- The auth surface (`/login`, `/signup`, `/admin/login`, `/admin/mfa`,
  `/admin/reset-password`) under `app/(auth)/`.
- Local mock-vendor pages (`/mock-vendors/{alea,finix,footprint}`).
- All HTTP APIs under `app/api/{admin, player, webhooks, dev, games,
realtime, auth, mock-vendors}`.

There is no separate "admin app" — the route group `(admin)` shares the
same Next deploy. Host-based splitting (admin.coinfrenzy.com vs
coinfrenzy.com) can be added in `middleware.ts` if you want it, but
isn't currently.

### `apps/worker` (Fly.io · Node)

A tiny Node HTTP server (port 3030) that:

- Serves `/healthz` (Fly health probe).
- Mounts the Inngest handler at `/api/inngest`.
- Registers every Inngest function in `src/inngest/functions.ts` — 32+
  functions covering reconciliation, snapshot aggregation, webhook
  dispatching, CRM flow runners, scheduled bonuses, VIP qualification,
  Gamma migration, etc.

The worker does **not** serve HTTP traffic to humans. It only runs
Inngest invocations and cron triggers. Hot reload in dev via
`tsx watch`.

---

## Data flow (typical request)

```
Browser
  ↓
Vercel Edge Network
  ↓
Next.js middleware (apps/web/middleware.ts)
  • Checks cookies (admin HMAC, Better Auth)
  • Bounces unauthenticated to /login or /admin/login
  • Gates host-role admins to /admin/{vips, messages, bonus, account}
  ↓
Route handler (app/api/.../route.ts) or RSC page (app/(...)/.../page.tsx)
  • Parses + validates input (zod)
  • Builds a Context object {db, logger, actor, reqId, afterCommit}
  ↓
@coinfrenzy/core function
  • Business logic (ledger.write, bonus.award, crm.dispatch, …)
  • Wraps multi-write work in a Drizzle tx that sets RLS actor context
  • Queues afterCommit hooks (Redis invalidation, Pusher publish, audit)
  ↓
@coinfrenzy/db (Drizzle)
  • Sends parameterized SQL to Neon
  • RLS policies enforce who can see what
  ↓
Postgres (Neon)
  • Triggers enforce ledger immutability + audit append-only
  ↓
Response
  • RSC pages pre-serialise all data before crossing into client components
  • API routes return JSON with `Cache-Control: no-store`
```

---

## Real-time flow (webhook → client tick)

```
External vendor (Alea / Finix / Footprint / SendGrid / Twilio)
  ↓
POST /api/webhooks/<vendor>
  ↓
Verify HMAC / signature (per-adapter verify-webhook.ts)
  ↓
Insert into pending_webhooks (idempotent on event_id)
  ↓
Emit Inngest event (e.g. "alea.game.win")
  ↓
apps/worker handler (e.g. webhook-alea.ts → processAleaWebhook)
  ↓
@coinfrenzy/core (ledger.write or kyc.update or …)
  ↓
afterCommit hook → Pusher.publish on the player's channel
  ↓
Player browser receives Pusher event → state updates
```

The Big Win celebration, balance pill, live wins ticker, and admin
dashboard counters all rely on this path. Channels are namespaced by
player id (`player-<uuid>`) and a few global channels
(`live-wins`, `admin-dashboard`).

---

## Cross-cutting patterns we lean on

These show up everywhere; learn them once and the rest of the codebase
reads cleanly.

### 1. `Context` object (`packages/core/src/context.ts`)

Every core function takes a `Context` as its first argument:

```ts
interface Context {
  db: DbExecutor // pooled client or open tx
  logger: Logger
  actor: Actor // who's doing this — feeds audit + RLS
  reqId: string
  afterCommit: (hook: AfterCommitHook) => void
  inngest?: InngestSender
}
```

`actor` is one of `{player, admin, system, anonymous}`. The shape is
exhaustive and used both for audit-log rows and to set the per-tx
`app.actor_id / app.actor_kind / app.actor_role` settings that drive
RLS policies.

### 2. `Result<T, E>` (`packages/core/src/errors/result.ts`)

Fallible operations return `Result<T, E>`. We never throw across the
core boundary; the route handler is the only place exceptions are
converted to HTTP responses. This keeps the type system honest about
what can go wrong.

### 3. Server pre-serialisation before RSC boundaries

Pages are server components that fetch data, **format all display
strings** (currency, dates, status labels) on the server, then pass
plain JSON props to client components. No `Date` / `bigint` / function
ever crosses the boundary. The Next.js error you'll see if you forget
is `Only plain objects can be passed to Client Components`.

### 4. Hard caps in core, soft warnings in UI

Limits that protect money (tier weekly SC max, manual adjust ceilings,
host weekly cap, redemption rules thresholds) live as constants in
`packages/core/src/{tiers, vip, redemption}/*` and are enforced at the
service layer. The UI shows "Heads-up" warnings when values approach a
cap so an operator with a typo gets a friction signal before they
submit. The cap is the safety net.

### 5. Soft delete (`status='archived'` / `deleted_at`) over hard delete

CMS pages, packages, tiers, segments, campaigns — none of them get
`DELETE`d. They're archived. This preserves audit chains and avoids
404s when historical content is referenced (terms versions, footer
links, expired offers).

### 6. Idempotency everywhere

- Every webhook receiver is idempotent via `pending_webhooks` and an
  `event_id` unique constraint.
- Every ledger write is idempotent via `(source, source_id)`.
- Every Inngest job uses a deterministic event id when it cares about
  not double-processing.

### 7. Role-gating via named permission helpers

Don't open-code `role === 'manager'`. Use
`packages/core/src/auth/permissions.ts`. There's a helper for every
sensitive surface (`canEditPackages`, `canSendOneOffEmail`,
`canOverrideSuppression`, `canManageBonuses`, `canAccessHostPortal`,
…). Routes call these by name.

### 8. Audit at the service layer

`packages/core/src/audit/` exposes a single `audit.record(ctx, …)`
helper. Every admin mutation pipes through it. The `audit_log` table
itself is append-only (`UPDATE` / `DELETE` are rejected by a trigger).

---

## What's NOT here (architectural choices that aren't true)

- **No microservices.** One Next app + one worker. We can split later.
- **No GraphQL.** REST + RSC.
- **No Prisma / TypeORM.** Drizzle.
- **No Supabase / PlanetScale.** Neon Postgres.
- **No Redux / Zustand.** TanStack Query handles server state; React
  state handles UI state. Player-side has a few small contexts
  (`RewardsContext`, `ShopModalContext`).
- **No internationalisation library.** Copy is en-US only for v1.
- **No mobile native app.** PWA-capable web, no app stores.

---

## Performance budgets (per `docs/01` §8)

| Surface                                    | Target       |
| ------------------------------------------ | ------------ |
| Lobby cold load (RSC + lobby data)         | < 800 ms p75 |
| Balance read (Redis hit)                   | < 50 ms p95  |
| Ledger write (single-leg)                  | < 150 ms p95 |
| Webhook receive → ack                      | < 100 ms p95 |
| CRM segment compile + sample (10k players) | < 400 ms p95 |
| Dashboard tile load (Layer-3 snapshots)    | < 250 ms p95 |

The ledger and CRM compiler are the hottest paths; both are covered by
property tests and the budgets are tracked in Grafana. If you see a
budget violated in production, see `18-troubleshooting.md` for the
debug path.

---

## What to read next

- `03-codebase-tour.md` — folder map.
- `04-database.md` — schema and migrations.
- `10-ledger-and-money.md` — the most important page in this folder.
