# 22 · Recent Changes (May 27 → handoff)

The handoff package files dated May 27 are mostly accurate, but a polish
pass between then and the actual handoff added new admin-dashboard +
players-list features, a new monetization breakdown, three new
time-range presets, a developer ergonomics shortcut, and a top-level
README rewrite. This doc summarizes those changes so the incoming team
isn't surprised by deltas between the May 27 docs and the live code.

If a file in this folder predates May 27 and you spot a mismatch with
this doc, this doc is the newer truth.

---

## 1. Admin dashboard rewrite (`/admin`)

**Files**: `apps/web/app/(admin)/admin/page.tsx`,
`apps/web/app/(admin)/admin/dashboard-client.tsx`,
`apps/web/app/(admin)/admin/dashboard-data.ts`,
`apps/web/app/(admin)/admin/_realtime.tsx`,
`packages/core/src/reports/dashboard-counters.ts`.

The dashboard was previously an 8-tile grid of small "money tiles". It
was reorganized into a clear hierarchy:

1. **Two hero cards** — `GgrHeroCard` and `NetCashHeroCard`. GGR is shown
   as a single large dollar number with hold % and the underlying total
   bet / total win as sub-metrics. Net Cash is shown the same way with
   purchases, redemptions, and pending redemption count as sub-metrics.
   Both color-coded (green / red) by sign and include a delta vs. the
   previous comparable period.
2. **At-a-glance row** — `StatCard`s for Total Players, Total Purchasers,
   Online Players, Pending Redemptions.
3. **Monetization Section** — see §3 below. Inserted between
   "At-a-glance" and the legacy "Coin economy" section.
4. **Coin economy / Engagement** — the previous mid-page sections,
   retained but de-emphasized.

`DashboardCounters` (in `packages/core/src/reports/dashboard-counters.ts`)
gained these fields:

- `scWonToday` (BigInt → serialized as string)
- `holdBpsToday` (basis points; integer)
- `purchaseCountToday`, `purchasingPlayersToday`
- `completedRedemptionsCount`, `completedRedemptionsUsd`
- `netCashToday` (purchases - redemptions, in money minor)
- `totalPlayersAllTime`, `totalPurchasersAllTime`

Hold% is derived in JS from `scStaked`/`scWon`. `completedRedemptions`
uses `paid_at` (not `created_at`) for accuracy.

The realtime channel (`apps/web/app/(admin)/admin/_realtime.tsx`) was
updated to safely accept payloads from older worker versions: a
`hydrateCounters` helper fills defaults for any missing field, so a
worker mid-deploy doesn't crash the UI.

---

## 2. New time range presets

**Files**: `packages/config/src/types/time-range.ts`,
`packages/ui/src/admin/data/TimeRangeSelector.tsx`.

Added three presets to the dashboard time-range selector:

- `last_month`
- `last_year`
- `last_12_months`

Bounds are computed UTC-aware using `utcStartOfMonth` /
`utcAddMonths` helpers in `time-range.ts`. The inline-chip default in
`TimeRangeSelector` was updated to surface them.

---

## 3. Monetization breakdown (cohorts + lifetime aggregates)

**Files**: `packages/core/src/reports/monetization-breakdown.ts` (new),
`packages/core/src/reports/index.ts`,
`apps/web/app/(admin)/admin/dashboard-data.ts`,
`apps/web/app/(admin)/admin/dashboard-client.tsx`.

A new core helper `computeMonetizationBreakdown(db)` returns the full
spender cohort + lifetime aggregate set the founder asked for (modeled
on the Frenzy Creator dashboard):

```ts
interface MonetizationBreakdown {
  totalPlayers: number
  payingPlayers: number
  spendersByTier: Record<100 | 500 | 1_000 | 2_500 | 5_000 | 10_000, number>
  lifetimeDepositsUsd: string // BigInt-serialized
  lifetimeWithdrawalsUsd: string
  lifetimeWageredSc: string
  lifetimeWonSc: string
  avgDepositPerPayerUsd: string
  netHouseHoldUsd: string
  conversionBps: number // basis points
  withdrawalsPctBps: number
  holdRateBps: number
  betMultiplierBps: number
  winPctBps: number
}
```

The query joins `players` × `player_lifetime_stats` once and computes
all cohorts via `COUNT(*) FILTER (WHERE …)`. Internal accounts and
soft-deleted players are excluded.

The dashboard renders this as `MonetizationSection` with two sub-grids:
`CohortTile` (paying / $100+ / $500+ / $1k+ / $2.5k+ / $5k+ / $10k+)
and `AggregateTile` (lifetime deposits / withdrawals / net house hold /
wagered / won / averages).

---

## 4. Players list rewrite (`/admin/players`)

**Files**: `apps/web/app/(admin)/admin/players/_data.ts`,
`apps/web/app/(admin)/admin/players/page.tsx`,
`apps/web/app/(admin)/admin/players/players-list-client.tsx`,
`apps/web/app/api/admin/players/export/route.ts`.

`PlayersListRow` now includes lifetime stats (`lifetimeRedeemedUsd`,
`netPositionUsd`, `purchaseCount`, `redemptionCount`, `totalWageredSc`,
`roundCount`, `sessionCount`, `daysActive`, `lastPurchaseAt`) via a
left-join with `player_lifetime_stats`.

The table replaced the old per-stat columns with three custom cells:

- **`MoneyTriadCell`** — Spend / Redeem / Net (color-coded by net
  position sign; sortable by net position)
- **`WagerCell`** — Total SC wagered + average bet per spin
- **`ActivityCell`** — Spins, sessions, days active

Player state is folded into the player-name sub-line to save horizontal
space (the standalone "State" column was removed). CSV export at
`/api/admin/players/export` was updated to include all the new lifetime
fields.

---

## 5. Dev player autologin (and root-→-lobby redirect)

**Files**: `apps/web/lib/player-session.ts`,
`apps/web/middleware.ts`,
`apps/web/app/(marketing)/page.tsx`,
`.env.example`,
`apps/web/.env.local`.

A new `devAutoLoginSession()` helper inside `getPlayerSession()` engages
when **both**:

1. `NODE_ENV !== 'production'`
2. `DEV_PLAYER_AUTOLOGIN === 'true'`

When engaged, Better Auth is short-circuited and the request is treated
as the most-recently-active seeded player (from `players` joined with
the row's `metadata`). Production is hard-rejected at the entry point
of `devAutoLoginSession()`, and the same condition gates the
middleware's player-cookie check, so the bypass cannot leak into a real
environment even if the env var leaks.

The marketing root (`/`) now redirects authed visitors directly to
`/lobby` (which is the right product behavior anyway — logged-in users
should not see a marketing splash). Combined with the autologin, this
means a fresh dev clone with the flag on opens straight into the
casino.

---

## 6. About prompts 11 and 12 (migration + cutover)

A casual remark during the polish pass implied prompts 11 (Gamma
migration pipeline) and 12 (cutover runbook) were never executed.
**They were.** For the avoidance of doubt:

- **Prompt 11 — migration pipeline**: built. Live in
  `packages/core/src/migration/` (18 files):
  `import-players.ts`, `import-purchases.ts`, `import-redemptions.ts`,
  `import-affiliates.ts`, `import-daily-kpis.ts`, `replay-webhooks.ts`,
  `dual-capture.ts`, `validation.ts`, `balance-compare.ts`,
  `snapshot-store.ts`, `transforms.ts`, `transforms-rsg.ts`, `csv.ts`,
  `run.ts`, plus tests under `__tests__/`.
- **Worker job**: `apps/worker/src/jobs/gamma-import.ts` invokes the
  pipeline on demand or via Inngest schedule.
- **Prompt 12 — cutover runbook**: built. Lives at
  `runbooks/cutover_night.md` (196 lines, T-7-day → T-0 → T+24h
  checklist) plus the supporting script
  `apps/worker/src/scripts/cutover-checklist.ts`.

What's **not** done is the live dry-run rehearsal. Per
`runbooks/cutover_night.md`, you do at least 3 full rehearsals on
staging against real Gamma snapshots before scheduling a real cutover
night. None of those rehearsals have been run. The pipeline is built;
the operational practice on top is the new team's responsibility.

---

## 7. Cleanup performed at handoff

- `check_catalog.mjs` — one-off debug script in repo root, deleted.
- `HANDOFF/.DS_Store` — macOS cruft, deleted.
- `.env.example` — added `BETTER_AUTH_URL`, `ADMIN_2FA_OPTIONAL`, and
  `DEV_PLAYER_AUTOLOGIN` (all referenced by code and docs but missing
  from the template).
- Top-level `README.md` — rewritten from "founder's prompt-runner manual"
  into a team-onboarding entry point that points at this folder.
- `HANDOFF/13-known-gaps.md` — added a "URL / route inconsistencies"
  section calling out three minor naming items the new team can clean
  up at their leisure.

---

## 8. Verification at handoff time

```bash
pnpm typecheck   # ✓ green (6 packages)
pnpm lint        # ✓ green (no warnings or errors)
```

Test suite:

- `packages/core` — 246 unit + property tests passing (ledger property
  tests dominate; ~1,900 fast-check cases on ledger invariants).
- `apps/web`, `apps/worker` — placeholder test scripts. App-level
  tests are a known gap (see `13-known-gaps.md`).
- E2E (Playwright) — not yet written. Highest-impact next test
  investment.

---

## 9. Where to read more

- The pre-launch blocker list is in
  [`21-pre-launch-blockers.md`](./21-pre-launch-blockers.md). Read it
  before processing real money.
- The full dashboard architecture sits under `docs/12_reporting_dashboards_exports.md`.
  The new monetization breakdown extends that contract.
- The full bonus engine doc is `docs/06_bonus_engine_playthrough.md`. The
  promo-code dialog (`apps/web/app/(admin)/admin/promo-codes/_promo-dialog.tsx`)
  is the operator-facing contract.
