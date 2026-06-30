# Report for Claude — Admin back-office hardening pass

**Author:** Composer (Claude Opus 4.7, Cursor)
**Session date:** 2026-05-18 → 2026-05-19
**Branch:** `main`
**Scope:** ~12 prompts focused on making the operator-facing admin truly ship-ready.

This report tells you what changed, why each piece was structured the
way it was, where I deviated from the docs, and what I think still
deserves a senior eye before this is locked in. The founder asked
for a comprehensive "tour" — please flag anything that looks off,
and we'll address in the next session.

---

## 1. Scope completed

Worked through the entire admin sidebar, top-to-bottom. Where a page
was a placeholder or partially functional, it's now real CRUD with
audit, RLS, and proper RSC structure. The list below maps each surface
to the new shape; I've called out the files that are the entry points.

### 1.1 Casino Management (docs/08 §3–§4)

**Removed:**

- `/admin/casino/jackpot` page (operator does not want a jackpot surface — moved to CMS placeholder page).
- `/admin/casino/providers-dashboard`, `/admin/casino/games-dashboard` (redundant — providers and games pages now own their dashboards inline).

**Rewritten / added:**

- `/admin/casino/providers` — added GGR %, top-3 rank, expanded date sort.
- `/admin/casino/games` — added "Total Hold" widget; reorderable.
- `/admin/casino/games/reorder` — new dnd-kit drag UI (`reorder-client.tsx`).
- `/admin/casino/lobby` — live-preview WYSIWYG editor (`lobby-editor-client.tsx`) with section + per-section game ordering, PUT to `/api/admin/casino/lobby/layout`.
- `/admin/casino/aggregators` — comprehensive aggregator catalogue with provider counts, latency/uptime widgets.
- `/admin/casino/sub-categories` — full rewrite, JSONB → dedicated tables (`casino_sub_categories`, `casino_sub_category_games`). Bulk-add by provider, drag reorder of both sections and games. Migration `0012_casino_sub_categories.sql` + `0013_repair_subcat_backfill.sql`.
- Feature-flagged the public lobby cutover (`apps/web/app/(player)/lobby/page.tsx`).

### 1.2 Reports (docs/12)

- New index page `/admin/reports/page.tsx`.
- `ListPageShell` + breadcrumb + quick-preset date chips standardised across every report (`/admin/reports/_filters.tsx`).
- CSV export on every report (`/api/admin/reports/*/export/route.ts`).
- Summary metric tiles (open rate, GGR, etc) per report.
- Polished `custom-query` workbench.

### 1.3 Transactions (docs/02 + docs/04)

- Shared `_advanced-filters.tsx` and `_export-button.tsx`.
- Date-range, amount-range, and CSV export added to:
  - `/admin/transactions/purchases`
  - `/admin/transactions/redemptions`
  - `/admin/transactions/bonus-awards`
  - `/admin/transactions/casino` (this one was the user's biggest pain — added pagination, sorting, search).
- Export endpoints under `/api/admin/transactions/*/export/`.

### 1.4 Pending Redemptions / Cashier (docs/07)

- Split-view preserved (`/admin/cashier/_split-view.tsx`).
- Top-of-card KPIs: NGR (color-coded), rolling 30-day amount, redemption amount, last redeem date.
- Approve / Cancel with double-confirm dialogs.
- **Cancel auto-credits the SC back to the player wallet** via the ledger (`/api/admin/redemptions/[id]/cancel/route.ts`).
- New "Redeem Rules" engine: `/admin/cashier/redeem-rules`, backed by `packages/core/src/cashier/redemption-rules.ts` and `redemption_rules` table (migration `0014`).
- AML hold queue kept intact.

### 1.5 Bonuses (docs/06)

- Bonus templates simplified: three categories — `purchase`, `player_gift`, `promo_code_signup`, `promo_code_free` (the latter is the "lightning-bolt code" category).
- Manual award page simplified to mirror the player-card "Send bonus" UX. Player picker uses `/api/admin/players/search`.
- Removed cooldown hours / playthrough-by-hours from the main UI; surfaced "instances" instead.
- Pending bonus claim flow added: `/api/player/bonus/pending/[awardId]/claim/route.ts`, `packages/core/src/bonus/claim-pending.ts`, `packages/core/src/bonus/list-pending.ts`.

### 1.6 Promo Codes (new module)

- New `promo_codes` and `blocked_promo_codes` tables.
- `/admin/promo-codes/{active,archived,bonus,restrictions}` pages with a shared `_promo-dialog.tsx`.
- Free SC/GC on signup, on any purchase, and "lightning-bolt" code redemption — all auditable.
- API: `/api/admin/promo-codes/*`.

### 1.7 VIP / Hosts (docs/08 §6)

- Host creation UI cleaned up (`/admin/vip/hosts/[id]`).
- Host interaction log: `_host-player-roster.tsx` shows the host's players with last-touch + channel.
- WhatsApp / Telegram / phone channels stored in `host_interactions.metadata` JSONB.
- Hosts can be assigned via `/admin/vip/assignments`.

### 1.8 CRM (docs/11)

- `packages/core/src/crm/event-registry.ts` — single source of truth for triggerable + conversion events.
- `packages/core/src/crm/flow-recipes.ts` + `_recipe-gallery.tsx` — pre-built flow templates (welcome series, dormant winback, etc.).
- Campaign list `_row-actions.tsx` with quick pause / resume / archive.
- Segment, flow, campaign, email-template, sms-template pages all converted to `ListPageShell`.

### 1.9 Packages (rewrite — docs/06, docs/13)

- Migration `0015_packages_overhaul.sql` adds `bonus_sc_playthrough_multiplier`, `featured_slot` (partial unique index on active+non-archived), banner fields, badge color.
- `packages/core/src/packages/admin.ts` — CRUD + reorder + featured-slot management with audit.
- Admin UI: `/admin/packages/{new,[id]}` with `_form.tsx`, `_panel.tsx`.
- Welcome-package logic: player-facing API filters by `playerLifetimeStats.firstPurchaseAt`; purchase intent enforces server-side ("can't buy welcome after first purchase, can't buy standard before").
- `packages/ui/src/player/ShopModalRoot.tsx` — renders featured banner + welcome-mode notice.

### 1.10 Tiers (rewrite)

- `packages/core/src/tiers/admin.ts` — CRUD + reorder + **hard safety caps** (`TIER_CAPS`):
  - `weeklyScMax` 5,000 SC, `monthlyScMax` 25,000 SC, `loginMultMax` 3.0x, `cashbackPctMax` 25%, `maxTierCount` 8.
- Atomic two-step reorder to escape the unique-level constraint.
- Form (`_form.tsx`) shows live "Heads-up" warnings near caps.
- Edit page shows current player count + estimated weekly/monthly payout.
- Delete is blocked if players are in the tier or packages reference it.

### 1.11 Dynamic CMS (new module)

- Reused `site_content` (JSONB `value_json.kind = 'page'`) — no new tables.
- `packages/core/src/cms/admin.ts` — CRUD + slug validation + audit.
- Admin UI: list (`page.tsx`, `_panel.tsx`), new (`new/page.tsx`), edit (`[id]/page.tsx`), `_form.tsx` with mini-toolbar + split-pane live preview, `_renderer.tsx` (client-safe).
- Public `/p/[slug]` route + `_public-renderer.tsx` (server) — matches existing legal-doc chrome.
- Migration `0016_cms_pages_seed.sql` seeds Terms, Privacy, Cookies, Sweepstakes Rules, Responsible Gaming, Bonus Terms, Jackpot (idempotent `ON CONFLICT DO NOTHING`).
- **Tiny in-house markdown dialect** (`## heading`, blank-line paragraphs, `-` lists, `**bold**`, `_italic_`, `[label](url)`). No new deps; no `dangerouslySetInnerHTML`.

### 1.12 Email Center (new module, today)

- `packages/core/src/email/center.ts` — `sendOneOffEmail`, `listInbox`, `getMessage`. Honours suppression by default; manager+ can override with audit (`ignoredSuppression: true`).
- API: `/api/admin/email-center/{send, messages/[id], templates}`.
- Compose dialog (`_client.tsx`) — recipient picker (email or player-search autocomplete), template loader from `email_templates`, HTML body editor with safe text-preview toggle, optional plain-text fallback.
- Detail dialog — full delivery timeline (queued → sent → delivered → opened → clicked), player + template + provider links, error block, body preview.
- 8 widgets: Sent today, Open rate, Click rate, Bounce rate, Bounces, Failed, Sending now, Sent 7d (tone-coded against thresholds).
- CSV export of the filtered inbox.

### 1.13 Player-page improvements (cross-cutting)

- New player API endpoints: `/api/admin/players/[id]/{kyc-level, password-reset, profile, stealth-lock, wipe}`. All audit-logged.
- Player-detail UI now exposes these via the action dialogs (`_action-dialogs.tsx`).

### 1.14 Migrations added

```
0011_daily_bonus_and_pending_claims.sql
0012_casino_sub_categories.sql
0013_repair_subcat_backfill.sql
0014_redemption_rules.sql
0015_packages_overhaul.sql
0016_cms_pages_seed.sql
```

All are idempotent (use `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`,
or guard with `WHERE NOT EXISTS`).

---

## 2. Cross-cutting architectural patterns I locked in

These showed up in several modules; I want you to confirm they're the
patterns we want going forward.

### 2.1 Server pre-serialisation before client components

`packages/core` exports value-level functions (`parsePageBody`,
`slugify`, …) that are normally fine in client bundles, BUT
`@coinfrenzy/core` indirectly imports Drizzle/Postgres. To keep the
client bundle clean, I duplicated the tiny markdown parser inline in
both `_renderer.tsx` (client) and `_public-renderer.tsx` (server).

**Trade-off:** ~50 lines duplicated three places (admin form, public
route, core). Comments mark them as duplicates that must stay in sync.

**Cleaner option to consider:** push the parser to a separate published
sub-package (`@coinfrenzy/cms-markdown`) with explicit no-runtime-deps
guarantee, and import from both. Probably overkill for one parser.

### 2.2 `ListPageShell` + `_panel.tsx` + insights tiles

Every list page is now:

```
page.tsx                # server — fetches data, pre-formats all strings
_panel.tsx              # client — table, row actions, dialogs
_form.tsx (when CRUD)   # client — shared by new/[id]
new/page.tsx            # server — defaults
[id]/page.tsx           # server — fetch + populate
```

Display strings (currency, dates, status labels) are formatted on
the server before crossing into client props so no function or
non-serialisable object ever crosses the boundary.

### 2.3 Hard safety caps in core, soft warnings in UI

Tiers and packages both got `*_CAPS` constants in core. The API
enforces them; the form shows "Heads-up" warnings when values
approach a cap. This stops a typo at 3 a.m. from giving away
$25k SC/week.

### 2.4 Soft-delete (archive) over hard-delete

CMS pages, packages, tiers — all use `status = 'archived'` instead
of `DELETE`. Hard delete is blocked when references exist (e.g. a
tier with active players, a package with sales history). This keeps
audit chains intact and stops accidental footer-link 404s.

### 2.5 Admin role gating

I used three buckets consistently:

- `support` / `kyc` / `cashier` — read-only on most surfaces.
- `marketing` — can create/edit content (CMS, packages, emails, promos).
- `manager+` — can override compliance-sensitive things (suppression list, redemption rules thresholds).

Pattern is `role === 'marketing' || coreAuth.hasAtLeast(role, 'manager')`.
If you want a finer policy matrix, we should formalise it in
`packages/core/src/auth/permissions.ts` rather than splatter it in
route handlers.

---

## 3. Quality sweep done before commit

I scanned for and fixed the following before committing:

- **Dead imports + `void X` re-exports** that older code used to keep
  unused symbols alive — removed across `casino/_data.ts`,
  `transactions/_data.ts`, `cashier/_split-view.tsx`,
  `casino/lobby/lobby-editor-client.tsx`, `settings/page.tsx`,
  `api/admin/crm/message-log/route.ts`, `core/vip/interactions.ts`,
  `core/tiers/admin.ts`, `core/cms/admin.ts`.
- **`dangerouslySetInnerHTML`** — zero occurrences in any new file
  (CMS parser tokenises inline markers into React nodes).
- **RSC boundary**: every client component receives only serialisable
  props. No functions crossing the boundary.
- **Audit log entries** wired on every mutation (CMS, packages, tiers,
  redemption rules, promo codes, manual awards, host interactions,
  email sends, player profile changes).
- **`pnpm typecheck` clean** across all six packages.
- **`pnpm lint` clean** (one pre-existing warning in
  `core/adapters/sendgrid/client-real.ts` unchanged; not mine).
- **`pnpm -F @coinfrenzy/web build` clean**, all new routes show
  up in the route table.

---

## 4. Things I'd want a senior reviewer to look at

Ranked by how much I'd want a second opinion:

### 4.1 (HIGH) Permissions matrix is splattered

I open-coded `role === 'marketing' || hasAtLeast(role, 'manager')` in
several routes. Better:

```ts
// packages/core/src/auth/permissions.ts
export function canEditContent(role) // marketing+
export function canSendOneOffEmail(role) // marketing+
export function canOverrideSuppression(role) // manager+
export function canEditPackages(role) // manager+
export function canEditTiers(role) // manager+
export function canManageRedemptionRules(role) // manager+
```

Then route handlers call those by name. **Easy follow-up; ~30 min.**

### 4.2 (HIGH) Tier safety caps live in code, not config

`TIER_CAPS` is hardcoded in `packages/core/src/tiers/admin.ts`. If
operations wants to lift `monthlyScMax` from 25,000 to 30,000 they
have to ship a deploy. Probably fine for v1 — but worth deciding
whether this should be in `site_content` / an env var / Doppler
before launch. Same applies to the redemption-rules engine.

### 4.3 (MEDIUM) Markdown parser duplicated three places

See §2.1. Three copies of a ~50-line parser:

- `packages/core/src/cms/markdown.ts` (canonical, server-safe)
- `apps/web/app/(admin)/admin/cms/_renderer.tsx` (client preview)
- `apps/web/app/(marketing)/p/[slug]/_public-renderer.tsx` (server)

I'd like your call on whether to split into a leaf sub-package or
just live with the duplication (it's small + tested + tied together
by a comment).

### 4.4 (MEDIUM) `crm_message_log` is partitioned by `(id, created_at)`

The Email Center detail dialog calls `getMessage(id)` which does
`WHERE id = ?` against the partitioned table. Postgres will plan
across all partitions because we don't pass `created_at`. Works
fine at our current volume; will get slow once we have years of
partitions. **Recommendation:** pass `createdAt` through the URL
(it's on every list row already) and add it to the WHERE clause.

### 4.5 (MEDIUM) Email body is only stored as first 200 chars

`crm_message_log.body_preview` is 200 chars. For audit / "what did
we actually send to this person 3 months ago" you'd want either:
(a) full HTML in the row (huge), (b) reference to R2 with the
rendered body, or (c) re-render on demand from `template_id` +
captured player context.

Probably (c) is right for templated sends and (b) is right for one-off.
Right now neither is wired. **Worth a decision.**

### 4.6 (LOW) `apps/web/app/api/dev/seed-pending-bonuses/route.ts`

This is a dev-only fixture endpoint. Confirm we want it shipped
(it's gated by `requireAdminSession` so it can't be hit by players).
If yes, recommend prefixing the path with `/dev/` is fine but
adding an `assert(process.env.NODE_ENV !== 'production')` would be
better.

### 4.7 (LOW) Welcome packages

I made welcome packages first-purchase-only via `firstPurchaseOnly`
flag + server-side enforcement on `/api/player/purchase/start`.
The current rule is binary: "before first purchase → welcome only,
after first purchase → standard only". If operations ever wants
"second-purchase booster" or A/B different welcomes, we'd want this
to be cohort-based rather than a flag. Not a blocker.

### 4.8 (LOW) Tier reorder requires renumbering twice

The atomic-rewrite pattern (bump all to N+100, then re-assign 1..N)
works but is awkward. Postgres `DEFERRABLE INITIALLY DEFERRED` on
the unique constraint would be cleaner — a single `UPDATE ... CASE`
inside one transaction. **Worth a migration if reorder gets hot.**

---

## 5. Things that LOOK suspicious but are intentional

- `noopLogger` is imported from `@coinfrenzy/core` and used in some
  server pages where we don't want to bother wiring a full
  `consoleLogger`. It's a leaf utility from `core/logger.ts`.
- `apps/web/app/(admin)/admin/vips/page.tsx` (plural) lives alongside
  `/admin/vip` (singular) — the plural is the host-specific view and
  redirects master/manager to `/admin/vip/all-vips`. Intentional dual-route.
- The `email-center` detail dialog has a footnote explaining the
  body-preview is 200 chars — that's a real operational note, not
  filler text. See §4.5 for the fix path.
- Tiny markdown duplicated three places (§4.3 above) — comments
  flag the duplication explicitly.

---

## 6. Verification done

| Step                            | Status                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                | green                                                                                                           |
| `pnpm lint`                     | green (one pre-existing `no-console` warning in `core/adapters/sendgrid/client-real.ts`)                        |
| `pnpm -F @coinfrenzy/web build` | green                                                                                                           |
| Migration files lex-sort        | confirmed (0011→0016, custom runner picks them up automatically)                                                |
| New routes in build output      | confirmed (`/admin/{cms, packages, tiers, email-center, promo-codes, casino/...}`, `/p/[slug]`, all API mounts) |

## 7. Migrations to run on next deploy

```
0011_daily_bonus_and_pending_claims.sql
0012_casino_sub_categories.sql
0013_repair_subcat_backfill.sql
0014_redemption_rules.sql
0015_packages_overhaul.sql
0016_cms_pages_seed.sql
```

Apply in order via `pnpm -F @coinfrenzy/db db:migrate`. The runner is
idempotent (the `_app_migrations` table tracks applied names).

## 8. What I think we should pick up next

In rough priority:

1. **Notification Center** — wire it up the way Email Center now is
   (compose + filtered inbox + detail dialog) on the `notifications`
   table. Same playbook, ~2 hours.
2. **Suppression list management** at `/admin/email-center/suppression`
   so ops can view/remove entries (right now it's webhook-write only).
3. **Permissions consolidation** (§4.1).
4. **`getMessage` partition key fix** (§4.4).
5. **Body-content storage decision** (§4.5).

---

Composer signing off — happy to address any of the above on next
session. Code is committed and pushed to `origin/main`.
