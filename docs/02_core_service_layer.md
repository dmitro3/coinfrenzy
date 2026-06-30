# CoinFrenzy Platform — Core Service Layer & Folder Structure

**Document:** 02 of 13
**Reads:** Doc 01 (Architecture Overview)
**Read before:** Doc 03 (Data Model), Doc 04 (Ledger)
**Purpose:** Define the exact code organization. Cursor reads this first.

---

## 1. The one rule

**All business logic lives in `packages/core`. No exceptions.**

If a function is called from two surfaces (player API, admin API,
webhook receiver, worker job, cron, CLI script), it lives in core.
If a function might be called from two surfaces, it lives in core
preemptively.

The webhook receivers, the API routes, the admin UI mutations, and
the worker jobs are *thin transport layers*. They handle HTTP/auth/
parsing/serialization, then call into core. Core handles the actual
work and returns plain typed results.

This is the lesson from Frenzy Creator's `api/_lib/ledger.js`:
"Every page that shows earned, owed, balance, or paid for an
affiliate MUST go through this module." We extend that principle
to every domain.

---

## 2. Monorepo layout

```
coinfrenzy/
├── apps/
│   ├── web/                    # Next.js 15 app (player + admin surfaces)
│   │   ├── app/
│   │   │   ├── (marketing)/    # Public marketing pages
│   │   │   ├── (player)/       # Authenticated player surface
│   │   │   ├── (admin)/        # Admin/staff surface (subdomain-routed)
│   │   │   ├── api/
│   │   │   │   ├── player/     # Player-facing API
│   │   │   │   ├── admin/      # Admin/staff API
│   │   │   │   ├── webhooks/   # Inbound webhooks (alea, finix, ...)
│   │   │   │   └── cron/       # Vercel cron triggers (light only)
│   │   │   └── layout.tsx
│   │   ├── middleware.ts       # Subdomain routing, session validation
│   │   └── package.json
│   │
│   └── worker/                 # Long-running Node service (Fly.io)
│       ├── src/
│       │   ├── jobs/
│       │   │   ├── reconcile-alea.ts
│       │   │   ├── crm-rollups.ts
│       │   │   ├── crm-send-batch.ts
│       │   │   ├── gamma-import.ts
│       │   │   ├── scheduled-bonus.ts
│       │   │   └── report-snapshots.ts
│       │   ├── inngest/
│       │   │   ├── client.ts
│       │   │   └── functions.ts  # Inngest event handlers
│       │   └── index.ts
│       └── package.json
│
├── packages/
│   ├── core/                   # All business logic (this is THE package)
│   │   ├── src/
│   │   │   ├── ledger/         # Doc 04
│   │   │   ├── wallet/         # Doc 04
│   │   │   ├── bonus/          # Doc 06
│   │   │   ├── playthrough/    # Doc 06
│   │   │   ├── redemption/     # Doc 07
│   │   │   ├── purchase/       # Doc 05 (Finix flow)
│   │   │   ├── kyc/            # Doc 07 (Footprint adapter)
│   │   │   ├── geo/            # Doc 09 (Radar + jurisdiction logic)
│   │   │   ├── games/          # Doc 05 (Alea adapter + session/round)
│   │   │   ├── package/        # Coin packages
│   │   │   ├── tier/           # Tier progression
│   │   │   ├── promo/          # Promo codes
│   │   │   ├── affiliate/      # Affiliate attribution + payouts
│   │   │   ├── crm/            # Doc 11
│   │   │   │   ├── events.ts
│   │   │   │   ├── segments.ts
│   │   │   │   ├── campaigns.ts
│   │   │   │   └── flows.ts
│   │   │   ├── notifications/  # In-app notifications
│   │   │   ├── audit/          # Audit log writes
│   │   │   ├── compliance/     # Jurisdiction, RG limits, exclusions
│   │   │   ├── adapters/       # External provider clients
│   │   │   │   ├── alea/
│   │   │   │   ├── finix/
│   │   │   │   ├── footprint/
│   │   │   │   ├── radar/
│   │   │   │   ├── sendgrid/
│   │   │   │   ├── twilio/
│   │   │   │   └── intercom/
│   │   │   ├── auth/           # Better Auth + admin HMAC
│   │   │   ├── reporting/      # Aggregations for dashboards
│   │   │   ├── errors/         # Typed error classes
│   │   │   ├── events/         # Typed event bus (Inngest)
│   │   │   └── index.ts        # Barrel — single import surface
│   │   ├── tests/
│   │   └── package.json
│   │
│   ├── db/                     # Drizzle schema + migrations
│   │   ├── src/
│   │   │   ├── schema/         # One file per domain
│   │   │   ├── client.ts       # Pooled Neon connection
│   │   │   └── index.ts
│   │   ├── drizzle/            # Generated migrations
│   │   ├── seed/               # Seed scripts (dev only)
│   │   └── package.json
│   │
│   ├── ui/                     # Shared React components
│   │   ├── src/
│   │   │   ├── primitives/     # Buttons, inputs, etc. (shadcn-based)
│   │   │   ├── composite/      # Cards, tables, modals
│   │   │   ├── charts/         # Recharts wrappers
│   │   │   └── theme/
│   │   └── package.json
│   │
│   ├── config/                 # Shared configs
│   │   ├── env.ts              # Zod-validated env at startup
│   │   ├── constants.ts        # GC, SC, restricted states, etc.
│   │   └── package.json
│   │
│   └── tsconfig/               # Shared tsconfig presets
│
├── docs/                       # The 13 architecture docs live here
├── .github/
│   └── workflows/              # CI: lint, typecheck, test, drizzle check
├── pnpm-workspace.yaml
├── package.json
├── turbo.json                  # Turborepo for builds/caching
└── .doppler/                   # Doppler config (gitignored secrets)
```

---

## 3. Why this shape

**Monorepo + pnpm workspaces + Turborepo.** One repo so changes
across web/worker/core land atomically. pnpm because it handles
workspaces cleanly. Turborepo for build/test caching — without it
CI takes 8 minutes; with it 90 seconds.

**`apps/web` vs `apps/worker`.** Vercel serverless is great for
HTTP but bad for long jobs (cold starts, 60s function limit,
no shared in-memory state). Anything that runs > 10s or needs
persistent connections lives in worker. Examples: nightly Alea
reconciliation, CRM rollup refreshes, Gamma snapshot ingest.

**`packages/core` is the brain.** Every other package depends on
core. Core depends only on `db` and `config`. This keeps the
dependency graph one-directional and prevents the "did I import
this from the right place?" problem.

**`packages/db` is just schema + client.** No business logic. If
you find yourself writing `if (user.tier === 'gold') return ...`
in `packages/db`, you're in the wrong package — that goes in core.

**`packages/ui` is presentation-only.** No data fetching, no API
calls, no business logic. Pure React components that take props.
Storybook lives here.

---

## 4. The core module contract

Every domain in `packages/core/src/{domain}/` follows the same shape:

```
packages/core/src/ledger/
├── index.ts          # Public API barrel
├── ledger.ts         # The main module
├── ledger.types.ts   # TypeScript types
├── ledger.errors.ts  # Domain-specific error classes
├── ledger.test.ts    # Unit tests (Vitest)
└── README.md         # 1-page doc of what this module does + invariants
```

**Public API rules:**

1. Only `index.ts` is imported by consumers. Internal files (`ledger.ts`, helpers) are not.
2. Every exported function has a typed signature with no `any`.
3. Every exported function returns `Promise<Result<T, E>>` for fallible operations — never throws across module boundary. (Use a tiny `Result` type, not `neverthrow` — keep dependencies minimal.)
4. Every exported function takes a `ctx` first argument with `{ db, logger, actor }` so we can swap test deps and trace every call.
5. Every mutation that touches money also takes an `idempotencyKey: string` argument so retries are safe.

Example signature:

```typescript
// packages/core/src/ledger/index.ts

export async function credit(
  ctx: Context,
  args: {
    walletId: string;
    amount: bigint;           // smallest unit — never floats for money
    currency: 'GC' | 'SC';
    reason: LedgerReason;
    metadata: Record<string, JsonValue>;
    idempotencyKey: string;
  }
): Promise<Result<LedgerEntry, LedgerError>> { ... }
```

**Why `bigint` not `number`:** JS numbers lose precision above 2^53.
At our scale (a single SC = 100 cents = 100 minor units; a player
could plausibly accumulate billions of SC across lifetime),
`number` will silently round and we'll have to do an emergency
migration. Use `bigint` from day one. Convert to display strings at
the UI boundary.

**Why `Result<T, E>`:** Throwing across module boundaries makes
the call graph unreadable and forces every caller to remember
which exceptions to catch. A `Result` type makes failure visible
in the type system. The `Result` type:

```typescript
// packages/core/src/errors/result.ts
export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
```

That's the entire type. We don't need a library.

---

## 5. Context object

Every core function takes a `Context` as first arg:

```typescript
// packages/core/src/context.ts
export type Context = {
  db: DrizzleClient;                 // Pooled DB client (transaction-aware)
  logger: Logger;                    // Structured logger (writes to Axiom)
  actor: Actor;                      // Who is doing this
  reqId: string;                     // Trace ID for correlation
  inngest: InngestClient;            // For firing events
};

export type Actor =
  | { kind: 'player'; playerId: string }
  | { kind: 'admin'; adminId: string; role: AdminRole; ip: string }
  | { kind: 'system'; service: 'webhook' | 'worker' | 'cron'; source: string }
  | { kind: 'anonymous' };
```

**Why pass it explicitly:** No global state. Tests pass a fake
context with an in-memory DB and a noop logger. Background jobs
pass a system context. The audit log writer reads `ctx.actor` to
know who to attribute the action to — without it, you can't audit.

**Transaction boundary:** `ctx.db` can be either the pooled client
or a transaction. The pattern:

```typescript
import { db } from '@coinfrenzy/db';

// Top-level (HTTP handler)
const ctx = { db, logger, actor, reqId, inngest };
await someCore.doThing(ctx, args);

// Inside a function that needs a transaction
export async function doThing(ctx: Context, args: ...) {
  return ctx.db.transaction(async (tx) => {
    const txCtx = { ...ctx, db: tx };
    await ledger.credit(txCtx, ...);
    await wallet.update(txCtx, ...);
    await audit.write(txCtx, ...);
    // All committed together or rolled back together
  });
}
```

---

## 6. Adapters — the external boundary

Every external provider gets an adapter in
`packages/core/src/adapters/{provider}/`:

```
packages/core/src/adapters/alea/
├── index.ts                # Public adapter API
├── client.ts               # HTTP client (axios or fetch)
├── webhook-verifier.ts     # HMAC signature verification
├── types.ts                # Alea's API types (handwritten or from OpenAPI)
├── errors.ts               # Alea-specific errors mapped to our errors
├── alea.test.ts            # Mocked HTTP integration tests
└── README.md               # What this adapter does
```

**Adapter rules:**

1. Adapters are the only place that knows about the provider's wire format. Everything else in core sees our domain types only.
2. Every outbound call writes to `integration_health` (success or failure) before returning.
3. Every adapter exports a typed client + a webhook verifier (if the provider posts back).
4. Adapters never call other core modules. One-way dependency: core/ledger calls adapters/alea, never the reverse.

Example:

```typescript
// packages/core/src/adapters/alea/index.ts
export const alea = {
  async launchSession(ctx, args): Promise<Result<AleaSession, AleaError>> {
    const started = Date.now();
    try {
      const resp = await aleaClient.post('/sessions', args);
      await markIntegrationHealth(ctx, 'alea', 'launch', 'ok', Date.now() - started);
      return ok(parseAleaSession(resp));
    } catch (e) {
      await markIntegrationHealth(ctx, 'alea', 'launch', 'error', Date.now() - started, e);
      return err(toAleaError(e));
    }
  },

  webhook: {
    verify(req): Result<AleaWebhookPayload, AleaWebhookError> { ... }
  }
};
```

---

## 7. The thin transport layer

API routes, webhook receivers, and worker jobs are *thin*. They:
1. Parse + validate the incoming request (using Zod schemas).
2. Build a `Context` (with auth-determined Actor).
3. Call into core.
4. Map the `Result` to HTTP response or job completion.

Example player API route:

```typescript
// apps/web/app/api/player/redemption/route.ts
import { redemption } from '@coinfrenzy/core';
import { requirePlayer } from '@/lib/auth';
import { buildContext } from '@/lib/context';
import { z } from 'zod';

const Body = z.object({
  amountSC: z.bigint().positive(),
  method: z.enum(['ach', 'card_payout']),
  idempotencyKey: z.string().uuid()
});

export async function POST(req: Request) {
  const player = await requirePlayer(req);
  if (!player) return new Response('unauthorized', { status: 401 });

  const body = Body.parse(await req.json());
  const ctx = buildContext({ req, actor: { kind: 'player', playerId: player.id } });

  const result = await redemption.request(ctx, {
    playerId: player.id,
    amountSC: body.amountSC,
    method: body.method,
    idempotencyKey: body.idempotencyKey
  });

  if (!result.ok) {
    return Response.json({ error: result.error.code }, { status: result.error.status });
  }

  return Response.json({ redemption: result.value });
}
```

**Notice what's NOT in this file:**
- No SQL.
- No KYC checking logic.
- No "compute available SC balance" math.
- No audit log write.

All of that is in `core/redemption/`. The API route is 20 lines and
will never need to change when redemption logic evolves.

---

## 8. Webhook receivers — same pattern, different transport

```typescript
// apps/web/app/api/webhooks/alea/route.ts
import { alea } from '@coinfrenzy/core/adapters';
import { games } from '@coinfrenzy/core';
import { buildContext } from '@/lib/context';

export async function POST(req: Request) {
  // Verify signature first, ALWAYS
  const verified = await alea.webhook.verify(req);
  if (!verified.ok) {
    // Log and 401 — never let an unverified webhook touch core
    return new Response('invalid signature', { status: 401 });
  }

  const ctx = buildContext({
    req,
    actor: { kind: 'system', service: 'webhook', source: 'alea' }
  });

  // Idempotency: Alea sends event IDs, we use them as idempotency keys
  const result = await games.handleAleaEvent(ctx, {
    event: verified.value,
    idempotencyKey: verified.value.eventId
  });

  if (!result.ok) {
    // 500 so Alea retries
    return new Response('processing failed', { status: 500 });
  }

  // 200 immediately, even if downstream work is queued
  return new Response('ok', { status: 200 });
}
```

**Webhook discipline:**
1. Verify signature first. Always. Reject 401 if invalid.
2. Use the provider's event ID as our idempotency key — if they retry, we no-op on the second call.
3. Respond 200 quickly. Queue the heavy work via Inngest if it'll take > 200ms.
4. Respond 500 (not 400) on processing failure so the provider retries. 4xx means "you're wrong, don't retry."

---

## 9. The event bus

Inngest gives us typed events. We define every event in core:

```typescript
// packages/core/src/events/index.ts

export type PlayerEvent =
  | { name: 'player.signup'; data: { playerId: string; affiliateCode?: string } }
  | { name: 'player.kyc.verified'; data: { playerId: string; level: number } }
  | { name: 'player.deposit'; data: { playerId: string; amountUSD: bigint; packageId: string } }
  | { name: 'player.redemption.requested'; data: { playerId: string; amountSC: bigint } }
  | { name: 'player.redemption.approved'; data: { playerId: string; amountSC: bigint } }
  | { name: 'player.game.session.start'; data: { playerId: string; gameId: string } }
  | { name: 'player.game.bet'; data: { playerId: string; gameId: string; amount: bigint; currency: 'GC' | 'SC' } }
  | { name: 'player.game.win'; data: { playerId: string; gameId: string; amount: bigint; currency: 'GC' | 'SC' } }
  | { name: 'player.bonus.awarded'; data: { playerId: string; bonusId: string; amountSC: bigint } }
  | { name: 'player.tier.up'; data: { playerId: string; from: string; to: string } }
  | { name: 'admin.action'; data: { adminId: string; action: string; target: string; payload: JsonValue } };

export async function emit<E extends PlayerEvent>(ctx: Context, event: E) {
  // 1. Write to player_events (or audit_log for admin events) — synchronous
  // 2. Send to Inngest — async
  // 3. Update integration_health on Inngest send
}
```

**Why a single typed event union:** When we add a new event, TypeScript
forces us to update every consumer (CRM flows, dashboards, audit log).
When we want to find every place that fires `player.deposit`, find-all-
references gives the answer in milliseconds.

**Two-write pattern:**
- Write to `player_events` table synchronously (for CRM segments)
- Send to Inngest asynchronously (for flow triggers, real-time notifs)

If Inngest is down we don't lose the event — it's already in the DB.
The worker can backfill Inngest from `player_events` on recovery.

---

## 10. Environment + secrets

```typescript
// packages/config/src/env.ts
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  
  // Auth
  BETTER_AUTH_SECRET: z.string().min(32),
  ADMIN_SESSION_SECRET: z.string().min(32),
  
  // Adapters
  ALEA_API_KEY: z.string(),
  ALEA_API_BASE: z.string().url(),
  ALEA_WEBHOOK_SECRET: z.string().min(16),
  
  FINIX_API_KEY: z.string(),
  FINIX_APPLICATION_ID: z.string(),
  FINIX_WEBHOOK_SECRET: z.string().min(16),
  
  FOOTPRINT_API_KEY: z.string(),
  FOOTPRINT_WEBHOOK_SECRET: z.string().min(16),
  
  RADAR_API_KEY: z.string(),
  
  SENDGRID_API_KEY: z.string(),
  SENDGRID_FROM_EMAIL: z.string().email(),
  
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  
  // Infra
  INNGEST_EVENT_KEY: z.string(),
  INNGEST_SIGNING_KEY: z.string(),
  
  R2_ACCOUNT_ID: z.string(),
  R2_ACCESS_KEY_ID: z.string(),
  R2_SECRET_ACCESS_KEY: z.string(),
  R2_BUCKET: z.string(),
  
  SENTRY_DSN: z.string().optional(),
  AXIOM_TOKEN: z.string().optional(),
});

export const env = envSchema.parse(process.env);
```

**Why Zod-parsed env:** The app crashes on startup if a required
env var is missing or malformed, instead of failing at runtime when
a webhook hits at 2am. Run this parser at every entry point (web,
worker, scripts).

**Secrets via Doppler.** Three Doppler configs: `dev`, `staging`,
`prod`. Vercel, Fly.io, and local dev all pull from Doppler. No
secrets in `.env` files committed anywhere, ever.

---

## 11. Testing strategy

Three layers:

1. **Unit tests** — `.test.ts` next to each module. Vitest. Mock DB and adapters. Fast. Run on every push.

2. **Integration tests** — `packages/core/tests/integration/`. Real Postgres (Neon dev branch per test run via the Neon API), real Drizzle. Slow but verify the SQL is correct. Run on PR.

3. **End-to-end** — `apps/web/tests/e2e/`. Playwright. Hits real local stack. Run on PR for happy paths, on schedule for full suite.

**Test discipline:**
- Every ledger function: unit + integration test. Hard requirement.
- Every webhook receiver: integration test with realistic payload from provider.
- Every admin action: e2e test (login → action → audit log row exists).

---

## 12. Folder rules that prevent drift

These are enforced by ESLint config + CI:

1. **`apps/*` cannot import from another app.** Worker can't import from web.
2. **`apps/*` cannot import from `packages/db` directly.** Must go through `packages/core`.
3. **`packages/core` cannot import from `apps/*`.** One-way dependency.
4. **`packages/ui` cannot import from `packages/core`.** UI is pure.
5. **Adapters (`packages/core/src/adapters/*`) cannot import from sibling adapters.** No `adapters/alea` calling `adapters/finix`. If they need each other, refactor through the calling domain (e.g. `core/games` calls both).
6. **No business logic in `apps/web/app/api/**`.** API routes are < 30 lines each. Enforced by line-count lint rule.

We add a custom ESLint rule for #6 because it's the most common regression.

---

## 13. Cursor-specific guidance

This section is for `.cursorrules`. Paste this into your repo root:

```markdown
# CoinFrenzy — Cursor Rules

## Architecture
- Read `docs/01_architecture_overview.md` and `docs/02_core_service_layer.md` before generating code.
- All business logic lives in `packages/core`. API routes and webhook receivers are < 30 lines.
- Every core function takes `(ctx: Context, args)` and returns `Promise<Result<T, E>>`.
- Money values use `bigint`, never `number`.
- Every mutation that touches money takes an `idempotencyKey: string`.

## Database
- Schema is in `packages/db/src/schema/`. Don't put schema definitions anywhere else.
- Use Drizzle. Don't write raw SQL except in migrations.
- Every table with player data has RLS enabled.
- High-volume tables (`ledger_entries`, `game_rounds`, `player_events`) are partitioned by month.

## Adapters
- Every external provider gets an adapter in `packages/core/src/adapters/{provider}/`.
- Adapters never call core modules. One-way dependency.
- Webhook receivers verify signature BEFORE doing anything else.
- Use the provider's event ID as idempotency key.

## Testing
- Every core function needs a unit test.
- Every adapter needs an integration test with mocked HTTP.
- Run `pnpm test` before suggesting a commit.

## Style
- TypeScript strict mode. No `any`, no `@ts-ignore`.
- Prefer named exports. No default exports outside React components.
- No comments that restate what the code does. Comments explain WHY.

## Forbidden
- Don't put logic in API routes. Move it to `packages/core`.
- Don't use `number` for money.
- Don't catch and silently swallow errors. Return `Result` or rethrow with context.
- Don't import from `packages/db` outside of `packages/core`.
- Don't write to `audit_log` from anywhere except `core/audit/`.
```

---

## 14. Build sequence for week 1

This is what to actually do in Cursor week 1:

**Day 1: Repo setup**
- Init pnpm workspace + Turborepo
- Create empty `apps/web`, `apps/worker`, `packages/{core,db,ui,config,tsconfig}`
- Wire up TypeScript strict, ESLint, Prettier, the custom ESLint rules from §12
- Set up Doppler and pull env vars locally
- Set up Neon dev branch + Drizzle config

**Day 2: Auth foundation**
- Install Better Auth, wire to Postgres via Drizzle adapter
- Set up player signup + login routes
- Build admin HMAC session pattern (ported from Frenzy Creator)
- Build `requirePlayer` and `requireAdmin` helpers
- Write `buildContext` helper

**Day 3-5: Schema + core scaffold**
- Implement Doc 03 schema in Drizzle
- Create all `packages/core/src/{domain}/` folders with empty `index.ts`, types, README
- Wire up Inngest client
- Wire up Axiom logger
- Wire up Sentry
- First migration deployed to Neon dev

**Day 6-7: First real domain — Wallet**
- Implement `core/wallet` (read balance, create wallet)
- Build the API route + admin UI to read a player's balance
- Unit + integration tests
- Demonstrates the full pattern end-to-end before we add complexity

That's week 1. After this, every subsequent domain (ledger, bonuses,
redemptions, etc.) follows the exact same shape.
