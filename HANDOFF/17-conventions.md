# 17 · Conventions

The "do this, not that" reference. None of these is academic — each one
came from a real bug or a real near-miss. Most are also encoded in
`.cursorrules`; read those for the long form.

---

## Money

- Database: `numeric(20, 4)`. Use the `money()` helper from
  `_shared.ts`.
- App: `bigint`. Minor units (1 USD = 10,000; 1 SC = 10,000; 1 GC =
  10,000).
- Display: format on the server with `formatMoney(amount, currency)`
  and pass the string to the client.
- **NEVER** `number` / `float` / `Decimal.js` / arithmetic with
  parseInt / parseFloat.
- **Currencies are always explicit**: `'GC' | 'SC' | 'USD'`. No
  defaults. No "amount" without a currency tag in the type.

---

## Ledger

- Every coin movement goes through `core.ledger.write(ctx, spec)`. No
  exceptions, even for "small" admin adjustments.
- Every write is idempotent on `(source, source_id)`. If you can't
  generate a deterministic `source_id`, redesign.
- Never bypass via raw SQL `UPDATE wallets`.
- `assertBalanced(spec)` before write; the writer does it anyway but
  fast feedback for bugs.
- Sub-buckets on `player_wallet` entries are mandatory; omitting
  throws.

See `10-ledger-and-money.md` for the deep version.

---

## Idempotency

- Every webhook receiver is idempotent on `event_id` via
  `pending_webhooks`.
- Every Inngest job uses a deterministic event id when it matters.
- Every internal mutation has a natural idempotency key — find it and
  enforce it.

---

## Audit

- Every admin mutation calls `core.audit.record(ctx, …)`.
- `audit_log` is append-only (trigger). Don't try to update or delete.
- Audit includes `actor`, `ip`, `ua`, `reason`, `before`, `after` —
  fill them all.

---

## RLS

- Every sensitive table has Row Level Security enabled.
- Set `app.actor_id`, `app.actor_kind`, `app.actor_role` at the start
  of every transaction. The writers in `core` do this; if you write
  raw SQL, you do it too.
- Default policy stance is **deny-all**; explicit policies open paths.
- New table? RLS policies + tests for the policies before merge.

See `04-database.md` and `15-security-and-compliance.md`.

---

## Server pre-serialisation

- RSC server pages format **every display string** (currency, dates,
  status labels) before crossing into client components.
- Plain JSON props only. No `Date`, `bigint`, `Map`, `Set`, function
  across the boundary.
- The error you'll see if you forget: `Only plain objects can be
passed to Client Components`.

Pattern:

```tsx
// page.tsx (server)
const players = await fetchPlayers(...)
const props = players.map((p) => ({
  id: p.id,
  email: p.email,
  signupAt: format(p.createdAt, 'PP'),
  lifetimeUsd: formatMoney(p.lifetimeUsd, 'USD'),
  vipStatus: STATUS_LABELS[p.vipStatus],
}))
return <PlayersTable rows={props} />
```

---

## File layout for CRUD admin pages

```
<section>/
├── page.tsx              server: fetch + render list shell
├── _panel.tsx            client: table + dialogs
├── _data.ts              server-only fetchers + TypeScript types
├── _form.tsx (CRUD)      client: shared form (RHF + Zod)
├── new/page.tsx (CRUD)   server: defaults + render form
└── [id]/page.tsx (CRUD)  server: fetch + render form + delete dialog
```

This is the shape every section in `(admin)/admin/` uses.

---

## Hard caps in core, soft warnings in UI

- Hard caps live as constants in `packages/core/src/*` (`TIER_CAPS`,
  `HOST_WEEKLY_BONUS_CAP_SC`, `APPROVAL_THRESHOLDS`, …).
- The API enforces them; an over-cap request is rejected.
- The form shows "Heads-up" warnings as values approach caps so the
  operator gets friction before submitting.

---

## Soft delete

- CMS pages, packages, tiers, segments, campaigns, promo codes: never
  `DELETE`. Set `status = 'archived'` or `deleted_at = now()`.
- Hard delete is blocked when references exist (a tier with active
  players, a package with sales history).
- Preserves audit chains and avoids 404s on historical URLs.

---

## Role gating

- Use named permission helpers from
  `packages/core/src/auth/permissions.ts`. Never open-code
  `role === 'manager'` in a route.
- If a new sensitive surface doesn't have a helper yet, add one.
- Approval thresholds (cashier amount caps, manual adjust limits) live
  in `APPROVAL_THRESHOLDS` — consult, don't duplicate.

---

## Naming

- **Files**: kebab-case (`bonus-engine.ts`, `redemption-rules.ts`).
- **React components**: PascalCase (`PlayerCard.tsx`, `GameTile.tsx`).
- **DB columns**: snake_case (`created_at`, `host_admin_id`).
- **App types/variables**: camelCase (`createdAt`, `hostAdminId`).
- **Constants**: SCREAMING_SNAKE (`TIER_CAPS`, `HOST_WEEKLY_BONUS_CAP_SC`).
- **Test files**: `*.test.ts` co-located in `__tests__/`.

---

## Sweepstakes wording

Banned:

| Don't                                         | Do                |
| --------------------------------------------- | ----------------- |
| deposit                                       | **purchase**      |
| withdraw / withdrawal / cashout               | **redemption**    |
| wager / bet                                   | **play**          |
| "real money" or "cash" (when referring to SC) | "Sweeps Coins"    |
| jackpot (in some contexts)                    | check copy review |

Applies to UI labels, email templates, error messages, comments where
shown to operators, and tracking event names where possible.

---

## TypeScript

- Strict mode. No `any` without a `// REASON:` comment.
- Prefer `Result<T, E>` over thrown errors at the core boundary.
- Use Zod for any external input (HTTP body, env, query params).
- Don't use class components — function components only.

---

## Imports

- Workspace aliases: `@coinfrenzy/core`, `@coinfrenzy/db`,
  `@coinfrenzy/ui`, `@coinfrenzy/config`.
- Import from the package root (the barrel) — not deep paths:

```ts
// good
import { ledger, audit } from '@coinfrenzy/core'

// bad
import { write } from '@coinfrenzy/core/src/ledger/write'
```

- `@coinfrenzy/core` is the barrel; each subdomain is exported as a
  namespace.

---

## React patterns

- Function components, named exports preferred.
- Hooks at the top level only (no conditional hooks).
- Use TanStack Query for server state, React state for UI state.
- Don't import from `apps/web/` into `packages/`. The dependency arrow
  always points `apps → packages`, never the reverse.
- Don't use `dangerouslySetInnerHTML`. The CMS parser tokenises
  markers into React nodes; do the same for anything similar.
- Don't use `localStorage` / `sessionStorage` for sensitive data.

---

## Forms

- `react-hook-form` for form state.
- `zod` for schema validation, shared between client and server.
- `@hookform/resolvers/zod` to wire them.
- Error messages localised at the field level; submit-time errors
  surfaced via a single toast.

---

## Time

- Always store `timestamptz` (`tstz()` helper).
- Default to `now()` in DB defaults.
- Server-side computations use `new Date()` only; client-side
  formatting uses `date-fns`.
- Don't `setTimeout`/`setInterval` for periodic work — use Inngest
  cron functions in `apps/worker`.

---

## Logging

- Use the `Logger` interface from `core/logger.ts`. `consoleLogger` in
  dev, structured (Axiom) in prod.
- Never log secrets, full card numbers, SSNs, passwords, API keys.
- Include `reqId` from the Context on every log call within a request.

---

## Comments

- Explain **why**, not **what**. The code shows what.
- Doc blocks at the top of every non-trivial file (`docs/04 §4` style
  pointers help).
- Inline comments only for genuinely surprising or temporary code.

---

## Dependencies

- Don't add a new package without explicit user approval. Every package
  is a maintenance and security cost.
- Prefer existing deps. Five icon libs ≠ five icons.

---

## Migrations

- Update `docs/03_data_model_v3.md` first.
- Hand-written SQL in `packages/db/src/migrations/<NNNN>_<name>.sql`.
- Idempotent (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`,
  `WHERE NOT EXISTS`).
- Always RLS policies for new sensitive tables.
- Backward-compatible: add column nullable, deploy code, backfill, drop
  old column in a later deploy.

---

## Commits

- Small, focused. One concern per commit.
- Prefix with the area: `[ledger] …`, `[crm] …`, `[admin/players] …`.
- Imperative voice: "add", "fix", "refactor", not "adds" / "added".

---

## Testing the convention

If a PR doesn't follow these and isn't called out as deliberate
deviation, push back. Convention drift is a slow tax.

---

## What to read next

- `.cursorrules` — the long form of these rules.
- `10-ledger-and-money.md` — convention enforced in code.
- `06-admin-platform.md` — the file-layout convention in practice.
