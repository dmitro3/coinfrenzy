# 23 · Code Health Report

A clear-eyed inventory of the codebase as it stands today, written for the
conversation with the incoming dev firm. This is **not** a re-audit (that's
`21-pre-launch-blockers.md`) and **not** a cleanup proposal. It's a map of
what's actually here so you can walk into the engagement knowing what's
solid, what's intentional, and what someone might reasonably question.

Severity tags used throughout:

- **informational** — a fact, no action implied.
- **minor** — small, real, but not worth blocking on.
- **flag** — worth raising with the dev firm proactively.

Every finding cites a file path. Nothing in the repo was changed to produce
this report.

> Note on the numbers in the brief: the kickoff summary quoted "141k lines /
> 937 files / 35 tables." The line and file counts are right (see below).
> The table count is not — the schema defines ~90 tables, not 35. The
> verified numbers are in the next section.

---

## Executive summary

The codebase is in good shape for its stage. It's a real monorepo with a
clean separation between business logic (`packages/core`), data
(`packages/db`), UI (`packages/ui`), and thin transport apps (`apps/web`,
`apps/worker`). The expensive, correctness-critical parts — the ledger, the
bonus/playthrough engine, the CRM segment compiler, the webhook receivers —
are the parts that actually have tests, and the tests are substantive rather
than decorative. Most of what "looks like a lot" (107 admin pages, ~90
tables, a separate worker app, mock mode for every vendor) is genuine
operational surface area for a regulated money product, not bloat. The honest
soft spots are: zero test coverage outside `packages/core`, a real amount of
small-scale duplication (money/date formatters, a 3-way-duplicated markdown
parser), and the production-hardening blockers already catalogued in
`21-pre-launch-blockers.md`. None of those are architectural; they're the
normal debt of a pre-launch build that was optimized for "get the surface
built correctly" over "polish every edge."

---

## By the numbers (verified)

All counts below were measured against the repo at report time, excluding
`node_modules`, `.next`, `.turbo`, and `apps/worker/dist` (compiled output).

### Lines of code by package (`.ts` + `.tsx`)

| Package           |   Files |       Lines | Avg lines/file |
| ----------------- | ------: | ----------: | -------------: |
| `apps/web`        |     500 |      73,185 |            146 |
| `packages/core`   |     231 |      36,325 |            157 |
| `packages/ui`     |     115 |      18,250 |            158 |
| `packages/db`     |      48 |      10,581 |            220 |
| `apps/worker`     |      36 |       2,648 |            101 |
| `packages/config` |       7 |         682 |             97 |
| **Total**         | **937** | **141,671** |       **~151** |

So the "141k lines / 937 files" figure is accurate **once you exclude
`apps/worker/dist`**. That `dist/` folder is committed compiled output
(~25k extra lines of `.d.ts` and `.js`); a raw `find` over the repo counts
~167k lines / ~1,478 files because it sweeps that in. Worth knowing because
a dev firm running their own `cloc` will see the bigger number and may ask.

**`packages/db` has the highest average file size (220 lines)** — that's the
seed scripts (`seed-realistic-data.ts` is 2,473 lines, `seed-fake-fixtures.ts`
is 2,057). Those are data-generation tools, not application code. See the
"large files" discussion below.

### Code vs test vs generated vs config

- **Application + library code**: ~138k lines (the bulk).
- **Test code**: 25 test files, 3,389 lines, all in `packages/core`.
- **Generated/compiled**: `apps/worker/dist` (gitignored intent but present
  locally), Drizzle migration metadata in `packages/db/src/migrations/meta`.
- **Config**: 31 config files (enumerated below), ~1k lines total.

### File-size distribution

- **Files over 800 lines (12 total, excluding `dist`)**:
  - `packages/db/src/seed-realistic-data.ts` (2,473) — seed tool
  - `packages/db/src/seed-fake-fixtures.ts` (2,057) — seed tool
  - `apps/web/app/(admin)/admin/players/[id]/_action-dialogs.tsx` (1,824)
  - `packages/ui/src/player/ShopModalRoot.tsx` (1,653)
  - `packages/core/src/crm/attributes.ts` (1,485) — the CRM attribute catalog
  - `apps/web/app/(admin)/admin/dashboard-client.tsx` (1,159)
  - `apps/web/app/(admin)/admin/players/[id]/player-detail-client.tsx` (1,134)
  - `packages/ui/src/admin/crm/CampaignWizard.tsx` (999)
  - `apps/web/app/(admin)/admin/email-center/_client.tsx` (999)
  - `packages/ui/src/admin/crm/SegmentBuilder.tsx` (946)
  - `apps/web/app/(admin)/admin/transactions/_data.ts` (885)
  - `apps/web/app/(admin)/admin/players/[id]/_data.ts` (867)
- **Tiny files (under 30 lines): 104** out of 937 (~11%). Most are barrel
  `index.ts` re-exports and single-purpose Zod schemas — normal for this
  style, not over-fragmentation.
- **Average file is ~151 lines** — healthy.

### Other verified counts

| Metric                                      |                            Verified |    Brief said |
| ------------------------------------------- | ----------------------------------: | ------------: |
| API route handlers (`app/api/**/route.ts`)  |                                 182 |         182 ✓ |
| Admin pages (`(admin)/**/page.tsx`)         |                                 107 |         107 ✓ |
| Player pages (`(player)/**/page.tsx`)       |                                  26 |          26 ✓ |
| Marketing pages (`(marketing)/**/page.tsx`) |                                  10 |             — |
| SQL migrations                              |                  27 (`0000`–`0026`) |          27 ✓ |
| Tables defined (`pgTable(...)`)             |                                 ~90 |          35 ✗ |
| `it()` test cases in `packages/core`        |                                 224 | "246 passing" |
| Property tests (`fast-check`)               | 6 `fc.assert` blocks across 6 files |             — |

On the "246 tests": there are **224 `it()` blocks** statically. The 246
figure is the runtime count Vitest reports, which is higher because
parameterized tests (e.g. the adapter-equivalence suite loops over each
vendor) expand into multiple runtime cases. Both numbers are honest; they
count slightly different things. The ledger property suite alone generates
~1,900 cases at runtime via fast-check's `numRuns`.

### Dependency count

Runtime dependencies (deduped across all `package.json`): **~45 distinct
packages**. Full enumeration in "Dependency observations."

---

## What looks healthy

- **The monorepo boundary is real, not cosmetic.** `apps/web` and
  `apps/worker` import business logic from `@coinfrenzy/core`; they don't
  reimplement it. The `.cursorrules` rule "all business logic lives in
  `packages/core`" is largely honored — route handlers parse input and call
  core functions.
- **The ledger is the best-tested module in the repo.**
  `packages/core/src/ledger/__tests__/` has unit tests for money math
  (`money.test.ts`), drain order (`drain-order.test.ts`), balance checks
  (`balanced.test.ts`), transaction builders (`transactions.test.ts`), and a
  property suite (`properties.test.ts`) asserting the three docs/04
  invariants (per-currency balance, idempotency, wallet-equals-ledger-sum)
  against a real Postgres via Testcontainers. This is exactly where you want
  the test investment in a money product.
- **Foreign keys are disciplined.** Every schema file that declares
  `.references(...)` also declares `onDelete` behavior. Spot-checking the FK
  count vs `onDelete` count per file shows no orphaned references missing a
  delete rule. (`packages/db/src/schema/*.ts`.)
- **Webhook receivers all verify signatures.** All five real webhook
  receivers (`apps/web/app/api/webhooks/{finix,alea,sendgrid,footprint,twilio}/v1/route.ts`)
  route through a shared `handleWebhookRoute` helper with an adapter that
  calls `verifyWebhook` before persistence. (One known caveat: SendGrid uses
  HMAC where prod spec wants ECDSA — already tracked as P1 in
  `21-pre-launch-blockers.md` §5.)
- **Admin API gating is consistent.** Of 146 `api/admin/*` routes, 135 use
  `buildAdminContext` / role helpers directly, 8 reports-export routes gate
  via the shared `buildReportsContext` helper
  (`apps/web/app/api/admin/reports/_shared.ts`, which calls `buildAdminContext`
  - `canReadAuditLog`), and 5 are the auth endpoints (login/logout/2fa) that
    are pre-authentication by definition. Net: no unintentionally open admin
    routes found in the spot-check.
- **No `@ts-ignore` or `@ts-expect-error` anywhere** in app/library code.
  Zero. That's unusually clean for a codebase this size.
- **No committed secrets found.** Grepping for `sk_live`/`sk_test`/`pk_*`/
  `BEGIN PRIVATE KEY`/`BEGIN RSA` across `apps` and `packages` returns
  nothing. Secrets live in `.env.local` (gitignored) and Doppler, per the
  `.cursorrules` contract.
- **The `Result<T,E>` + `ok`/`err` pattern has a single source**
  (`packages/core/src/errors/result.ts`) and is used consistently across
  core. No competing error-handling conventions.
- **ESLint is centralized.** Every package's `.eslintrc.cjs` extends the
  root `../../.eslintrc.cjs` (except `apps/web`, which extends Next's
  config plus the same unused-vars rule). Rules are consistent across
  packages — no drift.

---

## What looks busy but is intentional

These are the things a dev firm might flag on first skim. Each is defensible.

- **107 admin pages** (`apps/web/app/(admin)/**/page.tsx`). This is a full
  operator back-office for a regulated sweepstakes casino: players, KYC,
  redemptions/cashier, transactions, bonuses, promo codes, CRM (segments,
  campaigns, flows, templates), VIP/host management, CMS, casino-game
  catalog management, reports, audit, settings, migration tooling. Each of
  those is a domain with multiple list/detail/edit pages. 107 pages for that
  much operational surface is reasonable, not padded. Cross-reference
  `06-admin-platform.md` for the page-by-page map.
- **~90 database tables.** This serves casino + payments + bonus engine +
  CRM + VIP + affiliates + compliance + audit + Gamma-migration pipeline +
  reporting snapshots. Grouped by domain in "Schema and API observations"
  below. Each domain genuinely needs its tables; there's no single bloated
  catch-all table doing ten jobs.
- **27 migrations.** This is iterative feature evolution, not schema thrash.
  Only one migration (`0013_repair_subcat_backfill.sql`) is a "fix the
  previous one" entry, and it's an honest data-repair for the sub-category
  backfill in `0012`. The rest are additive feature migrations (VIP hosts,
  daily bonus, redemption rules, packages, terms versions, player favorites,
  the migration pipeline, etc.). See "Migration history."
- **A separate `apps/worker` app.** Inngest cron + async jobs (reconcile
  wallets, send scheduled reports, expire bonuses, poll AMOE, etc.) run in a
  Fly.io worker separate from the Vercel web app. This is the correct
  separation — you don't want long-running/cron work in serverless request
  handlers, and the `.cursorrules` explicitly forbids `setInterval` for
  periodic work. 34 Inngest functions are registered.
- **A `core` package separate from `web`.** Business logic is reused by both
  `web` and `worker`, is unit-testable without spinning up Next.js, and
  contains the vendor integration adapters. This is the spine of the
  architecture (docs/02).
- **Mock mode for every vendor.** `packages/core/src/adapters/*/client-mock.ts`
  alongside `client-real.ts` for Finix, Alea, Footprint, etc. This lets
  developers run the whole flow without live credentials, and the
  adapter-equivalence test (`packages/core/src/adapters/__tests__/adapter-equivalence.test.ts`)
  asserts mock and real clients expose the same surface. This is a feature,
  not duplication.
- **Big seed scripts** (`packages/db/src/seed-realistic-data.ts`, 2,473
  lines). These generate realistic demo data (players, purchases, ledger
  history, snapshots) for local dev and demos. They're tools, run via
  `pnpm seed:*`, never bundled or shipped. Their size is fine.

---

## What might get questioned and is worth a real conversation

These are places where the dev firm might have a fair point.

- **Test coverage stops at `packages/core`.** `apps/web`, `apps/worker`,
  `packages/ui`, `packages/db`, and `packages/config` all have
  `"test": "echo 'no tests yet'"` placeholders. There are no component
  tests, no route-handler tests, no E2E (Playwright is listed as a dep but
  not wired — see `16-testing.md`). For a money product this is the most
  legitimate coverage gap. **flag**
- **Small-scale duplication is real and widespread** (money formatters, date
  formatters, a 3-way-duplicated markdown parser). Individually trivial; in
  aggregate it's the kind of thing a reviewer will notice repeatedly. Full
  list in "Duplication" below. **flag**
- **Some large client components** (`_action-dialogs.tsx` at 1,824 lines,
  `dashboard-client.tsx` at 1,159, `ShopModalRoot.tsx` at 1,653). They work,
  but they're big enough that onboarding a new dev to them takes real time,
  and they'd benefit from decomposition. Not a bug — a maintainability cost.
  **minor**
- **The committed `apps/worker/dist/`** inflates the apparent codebase and
  can drift from source. It looks like it should be gitignored. **minor**
- **CI doesn't gate deploys** — already tracked as P1 in
  `21-pre-launch-blockers.md` §8. Tests exist but nothing blocks a bad merge.
  **flag** (but already known)

---

## Dead code / orphans (informational, do not delete)

Scan covered ~850 source files (excluding `dist`, migrations, and the test
tree). Orphan rate is low — roughly 0.6% of files. Next.js App Router
conventions (`page.tsx`, `route.ts`, `_*.tsx`, `[param]`, `(group)`) and the
Inngest registry mean very few `app/` files are truly orphaned.

### Orphan files

- `packages/core/src/errors/index.ts` — re-exports `./result` but nothing
  imports the barrel; all consumers import `../errors/result` directly.
  **Genuinely dead** (redundant barrel). informational
- `packages/ui/src/composite/index.ts`,
  `packages/ui/src/charts/index.ts`,
  `packages/ui/src/theme/index.ts`,
  `packages/ui/src/admin/forms/index.ts` — four empty `export {}` barrels
  with doc comments referencing future components.
  **Leftover scaffolding** from the prompt-driven build. informational

### Unused exports (selected)

- `writeWithRetry` / `WriteWithRetryOptions`
  (`packages/core/src/ledger/write-with-retry.ts`) — implemented and
  exported per docs/04 §8.2, but no caller uses it; only `ledger.write()` is
  called. **Intentional but unused.** This is the most interesting one: the
  contention-retry wrapper exists on paper but isn't on the hot path. Worth a
  look (it intersects `21-pre-launch-blockers.md` §4 "hot-path money writes
  skip safety wrappers"). flag
- `buildAffiliatePayout` (`packages/core/src/ledger/transactions/affiliate-payout.ts`)
  — exported and unit-tested, but no production affiliate-payout flow is
  wired yet. **Intentional but unused.** informational
- `unwrap`, `mapResult` (`packages/core/src/errors/result.ts`) — exported at
  package root, zero call sites. **Genuinely dead exports.** informational
- `Money`, `CoinMoney`, `makeMoney`, `MINOR_UNITS_PER_MAJOR`
  (`packages/config/src/types/money.ts`) — documented money types,
  superseded in practice by `packages/core/src/ledger/money.ts`. The ledger
  uses its own helpers. **Intentional but unused / consolidation candidate.**
  informational
- A cluster of `packages/ui/src/player/motion-primitives.ts` and
  `celebrations.ts` helpers (e.g. `haptic`, `useReducedMotion`,
  `classifyWinTier`) are exported from the `@coinfrenzy/ui/player` barrel but
  only consumed internally by other UI components. **Barrel bloat**, not dead
  — they're used, just not from outside the package. informational
- `StubPage` (`packages/ui/src/admin/layout/StubPage.tsx`) — placeholder for
  unbuilt admin sections, exported but never imported in `apps/web`.
  **Intentional but unused.** informational

### Unused folders

- The four empty UI barrels listed above (`composite/`, `charts/`, `theme/`,
  `admin/forms/`). **Leftover scaffolding.** informational

Everything checked under `apps/web/app/mock-vendors/`, `apps/web/app/api/dev/`,
`apps/worker/src/jobs/`, and `packages/core/scripts/` is wired (routes, jobs,
or `pnpm` scripts) and is **not** dead.

---

## Duplication (informational, do not consolidate)

Lots of small, true duplication. None of it is dangerous; all of it is the
kind of thing a dev firm will point at. The pattern is consistent: helpers
that can't easily cross the server/client or package boundary get
re-implemented locally.

### Money formatting — many implementations

Canonical helpers exist (`packages/core/src/ledger/money.ts` for the 4dp DB
representation, `apps/web/lib/format.ts` for 2dp human display), but
`formatMoney`/`formatUsd`/`toMoneyBigint` are also re-implemented locally in
at least:

- `apps/web/app/(admin)/admin/reports/_shared.client.tsx`
- `apps/web/app/(admin)/admin/dashboard-client.tsx`
- `apps/web/app/api/admin/packages/route.ts` + `[id]/route.ts`,
  `apps/web/app/api/admin/tiers/route.ts` + `[id]/route.ts` (identical
  `toMoneyBigint` copy-pasted 4×)
- `packages/core/src/crm/templates.ts` + `preview.ts` (CRM context)
- `apps/worker/src/jobs/send-scheduled-reports.ts`
- the three `packages/db/src/seed-*.ts` scripts

**flag** — the confusing part is that `formatMoney` means three different
things in three places (DB literal vs UI display vs `Number().toFixed`).

### Date formatting — `formatRelative` / `relativeTime` ×7

Canonical `relativeTime` is in `apps/web/lib/format.ts`, but near-identical
"Ns/Nm/Nh/Nd ago" implementations also live in
`apps/web/app/(admin)/admin/players/players-list-client.tsx`,
`packages/ui/src/admin/display/ActivityFeed.tsx`,
`packages/ui/src/admin/display/IntegrationHealthTile.tsx`,
`apps/web/app/(admin)/admin/integrity/integrity-client.tsx`,
`apps/web/app/(admin)/admin/cms/page.tsx`,
`packages/ui/src/admin/crm/SamplePlayerPreview.tsx`, and
`packages/ui/src/admin/crm/EventsFeed.tsx`. **flag**

### Markdown parser — still 3 places

The earlier senior-dev pass flagged this; it is **not yet resolved**. The
parser exists in:

- `packages/core/src/cms/markdown.ts` (canonical, server-safe)
- `apps/web/app/(admin)/admin/cms/_renderer.tsx` (comment explicitly says
  "duplicate of `@coinfrenzy/core/cms/markdown`", kept for a lean client
  bundle)
- `apps/web/app/(marketing)/p/[slug]/_public-renderer.tsx` (third copy)

This is a **documented intentional tradeoff** (avoid pulling Postgres/Drizzle
into the client bundle), but it's still what a reviewer will circle. Also
note `slugify` is duplicated between `cms/markdown.ts` and
`apps/web/app/(admin)/admin/cms/_form.tsx` for the same reason. **flag**

### Permission helpers — partially consolidated

The `13-known-gaps.md` note about routes open-coding
`role === 'marketing' || hasAtLeast(role, 'manager')` is **mostly resolved** —
that exact pattern now only appears inside
`packages/core/src/auth/permissions.ts`. But a handful of admin pages still
call raw `hasAtLeast(role, 'manager')` where a named helper exists
(`packages/.../admin/packages/page.tsx`, `tiers/page.tsx`,
`cashier/redeem-rules/page.tsx`, `settings/page.tsx`), and the player-mutation
and migration route clusters use raw `hasAtLeast` because no
`canManagePlayers` / `canAccessMigration` helper was ever defined. Also:
`canManagePromoCodes` is defined but unused — promo routes use
`canManageBonuses` instead. **minor**

### Other

- **No shared client-side fetch wrapper** — 50+ inline `fetch('/api/...')`
  calls across `apps/web` repeat error-parsing/POST boilerplate. (Server-side
  is consolidated via `buildAdminContext`.) **minor**
- **Amount parsing ×4** in the web layer (`lib/format.ts`,
  `transactions/_data.ts`, `cashier/redeem/_form.tsx`, the redemptions
  route). **minor**
- **Inline `z.string().email()` in 15+ places** — no shared `emailSchema`.
  **minor**

### Looks duplicated but is intentional

- Per-vendor mock + real adapters (architecture, not copy-paste).
- Separate admin vs player UI component trees (different audiences/contracts).
- Migration-ingest CSV parser vs report-export CSV writer (different jobs).
- The markdown 3-way split (documented bundle-boundary tradeoff above).

---

## Dependency observations

Full runtime dependency set, by package:

- **`apps/web`**: `@coinfrenzy/*` (workspace), `@dnd-kit/{core,sortable,utilities}`,
  `@hookform/resolvers`, `@radix-ui/react-slot`, `@sendgrid/mail`,
  `@tanstack/react-query`, `@tanstack/react-table`, `@tiptap/*` (5 packages),
  `@xyflow/react`, `better-auth`, `canvas-confetti`,
  `class-variance-authority`, `clsx`, `cmdk`, `date-fns`, `drizzle-orm`,
  `framer-motion`, `handlebars`, `inngest`, `lucide-react`, `next`,
  `pusher-js`, `react`, `react-dom`, `react-hook-form`, `react-hotkeys-hook`,
  `recharts`, `tailwind-merge`, `twilio`, `zod`.
- **`packages/ui`**: 14 `@radix-ui/*` primitives, `@dnd-kit/*`,
  `@tanstack/react-table`, `@tanstack/react-virtual`, `@xyflow/react`,
  `canvas-confetti`, `class-variance-authority`, `clsx`, `cmdk`,
  `framer-motion`, `lucide-react`, `react-hotkeys-hook`, `recharts`,
  `tailwind-merge`.
- **`packages/core`**: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`,
  `@sendgrid/mail`, `bcryptjs`, `date-fns`, `drizzle-orm`, `handlebars`,
  `otplib`, `postgres`, `pusher`, `qrcode`, `twilio`, `zod`.
- **`packages/db`**: `bcryptjs`, `drizzle-orm`, `postgres`.
- **`packages/worker`**: `@sendgrid/mail`, `drizzle-orm`, `handlebars`,
  `inngest`, `twilio`.
- **`packages/config`**: `zod` only.

### What's worth flagging

- **Aligned on the locked stack.** Next 15, Drizzle (no Prisma), Zod,
  react-hook-form, better-auth, TanStack Query, lucide-react, Tailwind 3 —
  all match `.cursorrules`. No forbidden ORMs, no rogue date libraries
  (it's `date-fns`, not moment). Good. informational
- **`drizzle-orm` version skew.** `apps/web`/`apps/worker` pin `^0.36.4`,
  `packages/core`/`packages/db` pin `^0.36.1`. Same minor, caret range, so
  pnpm dedupes — but worth normalizing to one version string. minor
- **`inngest` version skew.** `apps/web` has `^3.54.2`, `apps/worker` has
  `^3.27.0`. The worker is the one that actually runs Inngest functions;
  align these. minor
- **Two TipTap stacks-worth of editor deps** (`@tiptap/*` ×5) plus
  `@xyflow/react` (flow-diagram canvas) plus `recharts` plus `framer-motion`
  plus `canvas-confetti`. These are all legitimately used (rich email editor,
  CRM flow builder, dashboard charts, animations, win celebrations), but
  they're the heavy hitters in the `apps/web` bundle. No single trivial-use
  heavyweight stood out (no lodash-for-one-function situation). informational
- **`@xyflow/react` is declared in both `apps/web` and `packages/ui`** but
  the actual flow components live in `packages/ui` — the `apps/web`
  declaration may be redundant. minor
- **`handlebars`** appears in `core`, `web`, and `worker` — it's the email/
  template renderer; consistent use, not duplication. informational
- **Bundle impact estimate (`apps/web`):** the local `.next` build artifact
  is ~1.5 GB on disk (includes cache + all server/client chunks), which is
  not the shipped size. The shipped client bundle is dominated by the editor
  (TipTap), flow canvas (xyflow), charting (recharts), and motion
  (framer-motion). These are admin-surface features and could be route-split/
  lazy-loaded if first-load size becomes a concern, but that's an
  optimization, not a problem today. informational

No dependency was found that isn't imported somewhere.

---

## Security smell spot-check results

This is a spot-check, not the audit. The audit is `21-pre-launch-blockers.md`.

- **`dangerouslySetInnerHTML`**: the earlier pass said "zero." That's
  **almost** right. Two files contain it only in a comment forbidding it
  (`apps/web/app/(admin)/admin/cms/_renderer.tsx`,
  `apps/web/app/(marketing)/p/[slug]/_public-renderer.tsx`). **One real
  usage exists**:
  `apps/web/app/(admin)/admin/crm/email-templates/_editor.tsx:272`, which
  renders the server-produced HTML email preview into the admin editor. The
  content is admin-authored email-template HTML rendered back to the same
  admin, not player-supplied input, so the blast radius is "an admin XSSes
  their own browser." Low risk, but the brief said "zero," so this is the
  correction. **flag** (for accuracy, not severity).
- **`console.log` in production paths**: none in `packages/core/src`
  (it has a real `logger.ts`), none in `apps/web/app`. The `console.log`s
  that exist are in `apps/worker/src/scripts/*` (cutover/balance CLI tools,
  where console output is the point), `apps/worker/src/jobs/hello.ts`
  (scaffold), and `packages/db/src/seed-*.ts` (seed progress output). All
  appropriate. informational
- **Committed secrets**: none. Grep for `sk_live`/`sk_test`/`pk_*`/
  `BEGIN PRIVATE KEY`/`BEGIN RSA` is clean across `apps` and `packages`.
  informational
- **`any` types in non-test code**: present but bounded. Occurrences cluster
  in the seed scripts (`seed-fake-players.ts`, `seed-realistic-data.ts`,
  `seed-fake-fixtures.ts` — ~55 between them), `packages/ui/src/admin/data/DataTable.tsx`
  (generic table, 8), and a handful in `crm/attributes.ts`, `crm/preview.ts`,
  and a few route handlers. The `.cursorrules` requires a `// REASON:`
  comment for `any`; that convention is not consistently followed in the
  seed scripts. ESLint has `no-explicit-any` set to `warn` (not `error`), so
  these don't fail the build. **minor**
- **`@ts-ignore` / `@ts-expect-error`**: **zero** in app/library code.
  informational

---

## Schema and API observations

### Tables grouped by domain (~90 total)

- **Auth & admin**: `auth_users`, `auth_sessions`, `auth_accounts`,
  `auth_verification`, `auth_two_factor`, `player_limit_changes`, `admins`,
  `admin_roles`, `admin_role_assignments`, `admin_permissions`,
  `admin_sessions`, `admin_dashboard_layouts`, `admin_saved_views`,
  `admin_notes`, `custom_query_definitions`.
- **Players & wallets**: `players`, `wallets`, `player_favorites`,
  `player_lifetime_stats`, `player_30d_stats`, `player_game_stats`,
  `player_events`, `geo_history`.
- **Money / ledger**: `ledger_entries`, `house_accounts`, `purchases`,
  `redemptions`, `redemption_rules`, `payment_instruments`,
  `admin_adjustments`, `packages`.
- **Bonus engine**: `bonuses`, `bonuses_awarded`, `promo_codes`,
  `promo_redemptions`.
- **Tiers / VIP**: `tiers`, `tier_progress`, `tier_history`,
  `host_player_interactions`.
- **Games**: `aggregators`, `game_providers`, `games`, `game_sessions`,
  `game_rounds`, `alea_reconciliation_findings`, `casino_sub_categories`,
  `casino_sub_category_games`.
- **CRM**: `crm_segments`, `crm_campaigns`, `crm_flows`, `crm_flow_steps`,
  `crm_flow_enrollments`, `crm_message_log`, `crm_suppression`.
- **CMS / content**: `site_content`, `banners`, `email_templates`,
  `sms_templates`, `notifications`, `terms_versions`.
- **Compliance / KYC / blocklists**: `kyc_status`, `compliance_flags`,
  `blocked_emails`, `blocked_domains`, `blocked_ips`, `blocked_promo_codes`,
  `aml_review_queue`.
- **Affiliates**: `affiliates`, `affiliate_codes`, `affiliate_attribution`,
  `affiliate_payouts`.
- **Reporting snapshots**: `daily_operational_snapshots`,
  `daily_per_state_snapshot`, `daily_per_game_snapshot`,
  `daily_per_affiliate_snapshot`, `daily_redemption_rate_snapshot`.
- **Ops / integration**: `pending_webhooks`, `integration_health`,
  `system_config`, `data_exports`, `report_subscriptions`.
- **Audit**: `audit_log`.
- **Gamma migration pipeline**: `migration_imports`, `migration_id_map`,
  `migration_column_mappings`, `migration_runs`, `migration_row_errors`,
  `migration_review_queue`, `migration_replay_log`, `tax_reports`.

**Redundancy / orphans**: nothing jumped out as a duplicate-purpose table.
The closest candidates are the three player-stats tables
(`player_lifetime_stats`, `player_30d_stats`, `player_game_stats`), which
look overlapping but serve different windows/granularities (lifetime vs
rolling-30d vs per-game) and are read by different surfaces — intentional
denormalization, not redundancy. The five `daily_*_snapshot` tables are
similarly per-dimension report rollups, not duplicates. A deeper
table-by-table "is this queried anywhere" sweep wasn't done (see "What this
report did not cover").

### Migration history

27 migrations, `0000`–`0026`. Reading the headers, these are additive
feature migrations tied to specific docs sections (each header cites a
`docs/NN §X`). The only "fix the previous migration" entry is
`0013_repair_subcat_backfill.sql`, which repairs the sub-category backfill
from `0012` — one repair in 27 is healthy, not thrash. RLS is established in
`0005_rls.sql` ("enable + policies for every sensitive table"), with
immutability triggers for the ledger and audit log in `0003_triggers_rules.sql`.
Note the **runtime RLS-enforcement question is already a P0** in
`21-pre-launch-blockers.md` §2 (policies defined but possibly bypassed by the
app's DB role) — that's a runtime config concern, not a schema-definition
concern; the policies themselves exist.

### API surface (182 routes)

Grouped by top-level segment:

- `admin/*`: 146
- `player/*`: 23
- `webhooks/*`: 6
- `mock-vendors/*`: 3 (dev-only vendor fire endpoints)
- `realtime`, `games`, `dev`, `auth`: 1 each

**Role-gating spot-check (10+):** sampled across `players/[id]/suspend`,
`players/[id]/adjust-balance`, `redemptions/[id]/approve`, `promo-codes`,
`tiers`, `packages`, `crm/segments`, `staff`, `bonus/manual-award`,
`reports/*/export` — all gate through `buildAdminContext` (or
`buildReportsContext`, which wraps it). The only `api/admin/*` routes without
a direct gate call are the five pre-auth auth endpoints and the eight
reports-export routes (gated via the shared helper). No accidental open
endpoints found.

**Webhook signature verification:** all five real receivers verify
(`finix`, `alea`, `sendgrid`, `footprint`, `twilio`). The `mock-vendors/*`
fire endpoints are dev-only and intentionally unsigned.

**Dead/duplicate endpoints:** none obviously dead. Endpoint paths look
purpose-distinct; no two routes appeared to do the same job under different
paths. (A full "does client code call this" sweep per endpoint wasn't done.)

---

## Predicted dev firm questions, pre-answered

- **"Why 107 admin pages?"** — Real operational surface for a regulated
  casino back-office (players, KYC, cashier, transactions, bonuses, promos,
  CRM, VIP, CMS, casino catalog, reports, audit, settings, migration tools).
  Not padded. Map: `06-admin-platform.md`.
- **"Why ~90 tables?"** — Casino + payments + bonus + CRM + VIP + affiliates
  - compliance + audit + reporting snapshots + Gamma-migration pipeline. Full
    domain grouping above. No catch-all god-table.
- **"Why 27 migrations?"** — Iterative feature evolution, each tied to a docs
  section. Exactly one is a repair (`0013`). Not thrash.
- **"Why a separate worker app?"** — Cron + async jobs don't belong in
  serverless request handlers; `.cursorrules` forbids `setInterval` for
  periodic work. 34 Inngest functions live there.
- **"Why `core` separate from `web`?"** — Logic reuse across web + worker,
  testability without Next.js, and the home of vendor adapters. It's the
  architecture spine.
- **"Why mock mode for every vendor?"** — Develop and test the full flow
  without live credentials; an equivalence test keeps mock and real in sync.
- **"Why is `apps/web/.next` / `apps/worker/dist` so big?"** — Build output.
  `.next` is local cache (~1.5 GB, not shipped). `apps/worker/dist` is
  committed compiled output that inflates raw line counts and should probably
  be gitignored.
- **"This `_action-dialogs.tsx` is 1,824 lines."** — True. It's the player-
  detail action dialogs (suspend, adjust balance, KYC, notes, RG limits,
  etc.) in one file. It works and is cohesive by domain, but it's a fair
  decomposition target. Maintainability cost, not a bug.
- **"There's a 600+-line route/data file."** — The big ones are `_data.ts`
  server data-loaders (`transactions/_data.ts` 885, `players/[id]/_data.ts`
  867). These are query-assembly modules, not request handlers with logic —
  the logic still lives in `core`. Long but legitimate.
- **"Markdown parser is duplicated 3 times."** — Yes, and it's a documented
  tradeoff to keep Postgres/Drizzle out of the client bundle. Worth
  revisiting (a shared client-safe parser package would fix it) but not
  wrong.
- **"`formatMoney` is everywhere and means different things."** — Correct and
  worth tidying. Three legitimate representations (DB 4dp literal, UI 2dp
  display, CRM template string) share a name; consolidating into clearly
  named helpers would reduce confusion.
- **"Test coverage for `apps/*` and most of `packages/*` is zero."** — True
  and the most legitimate gap. Core (ledger, bonus, CRM, webhooks) is well
  covered; everything else relies on TypeScript + manual QA. E2E (Playwright)
  is a dep but unwired.
- **"I see `any` in the seed scripts without the required `// REASON:`
  comment."** — Correct; the `any`-justification convention slipped in the
  data-generation tools. Low risk (tools, not runtime), worth a cleanup pass.
- **"`writeWithRetry` exists but nothing calls it."** — Correct, and it
  overlaps a P0 in `21-pre-launch-blockers.md` (hot-path money writes
  skipping safety wrappers). Worth confirming the intended write path.

---

## Risk register

Ranked by severity. Items already in `21-pre-launch-blockers.md` are
referenced, not restated.

### Real risks to tell the dev firm about

- **Production-hardening blockers** — see `21-pre-launch-blockers.md` in
  full. The P0s (redemption request idempotency, runtime RLS enforcement,
  ledger idempotency index, hot-path money-write safety wrappers) are the
  genuine money-correctness/security risks. This report's findings about
  `writeWithRetry` being unused (above) reinforces P0 §4 — worth confirming
  the write path together.
- **No CI gate on deploys** (`21-pre-launch-blockers.md` §8) — tests exist
  but don't block bad merges.
- **Test coverage outside `packages/core` is zero** — no route, component, or
  E2E tests. For a money product, the web/worker transport layers and the
  redemption/cashier UI flows deserve at least smoke coverage.

### Things that look messy but are functional

- Money/date formatter duplication (7+ date copies, many money copies).
- Markdown parser + `slugify` duplicated across the bundle boundary.
- Large client components (`_action-dialogs.tsx`, `dashboard-client.tsx`,
  `ShopModalRoot.tsx`).
- Committed `apps/worker/dist/` inflating the codebase.
- `any` in seed scripts without the required justification comment.

### Keep an eye on during the engagement

- `drizzle-orm` and `inngest` version skew across packages.
- Permission-helper consolidation half-finished (raw `hasAtLeast` in some
  pages; missing `canManagePlayers`/`canAccessMigration`; unused
  `canManagePromoCodes`).
- The one real `dangerouslySetInnerHTML` in the email-template editor
  (admin-only, low blast radius, but track it).
- `apps/web` bundle weight from editor/flow/chart/motion deps if first-load
  performance becomes a goal.

### Healthy

- Ledger test discipline (unit + property + integration against real PG).
- FK `onDelete` coverage.
- Webhook signature verification across all real receivers.
- Admin route gating consistency.
- Zero committed secrets, zero `@ts-ignore`/`@ts-expect-error`.
- Single-source `Result`/error handling.
- Centralized, consistent ESLint config.

---

## Recommendation

The platform is architecturally sound and honestly built; nothing here
suggests a rewrite or a structural problem. What stands between it and
production is a known, bounded list of production-hardening items
(`21-pre-launch-blockers.md`) plus a normal layer of pre-launch polish debt
(test coverage outside core, formatter/markdown duplication, a few oversized
components). Walk into the dev-firm conversation framing it that way: the
bones are good, the money-critical core is tested, and the work ahead is
hardening and polish on a solid foundation — not foundational repair.

---

## What this report did NOT cover (and why)

- **Runtime behavior.** No code was executed; no app was booted; no real
  queries were run. Findings are static. The runtime RLS question, for
  example, is flagged but can only be confirmed by testing the live DB role
  (it's already a P0 in `21-pre-launch-blockers.md`).
- **A full security re-audit.** That's `21-pre-launch-blockers.md`'s job;
  §10 here was an explicit spot-check, not a sweep.
- **Performance profiling.** No bundle analyzer was run, no query plans
  inspected. Bundle comments are estimates from the dependency set, not
  measurements.
- **Per-endpoint "is this called by a client" and per-table "is this queried
  anywhere" exhaustive sweeps.** Spot-checked, not enumerated — a complete
  reachability analysis across 182 endpoints and ~90 tables was out of scope
  for a one-pass inventory.
- **Test re-run.** The 224/246 counts are static + the documented runtime
  figure; tests were not executed for this report.
