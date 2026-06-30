# 06 · Admin Platform

The admin / operator back-office. Built across milestones M1 (visual
system), M2 (all stub pages built), M3 (CRM, see `08-crm-system.md`),
M4 (VIP/Host, see `09-vip-host-system.md`), with a final hardening pass
on 2026-05-18/19 (`reports/2026-05-19_admin_backoffice_pass.md` —
required reading if you're going to touch any of these pages).

---

## How to get in

1. Visit `/admin/login`.
2. Email + password.
3. TOTP 6-digit code (or first-login enrollment).
4. You land on `/admin`.

Hosts get the same login but a completely different post-login
experience (`HostShell` instead of `AdminShell`); see
`09-vip-host-system.md`.

---

## Where the code lives

```
apps/web/app/(admin)/admin/
├── layout.tsx              Picks <AdminShell> or <HostShell>
├── page.tsx                Dashboard
├── admin-shell.tsx         Full chrome (sidebar + topbar) for non-host roles
├── host-shell.tsx          Restricted chrome for host role
├── _host-dashboard.tsx     Host-only dashboard
├── _providers.tsx          TanStack Query + theme
├── _realtime.tsx           Pusher subscription
├── account/                Admin's own settings
├── admin-added-coins/      Manual SC/GC adjustments
├── audit/                  Audit log viewer
├── banners/                Player banners
├── bonus/                  Bonus templates, awards, playthrough
├── cashier/                Redemption review queue
├── casino/                 Providers, games, lobby editor, aggregators, sub-categories
├── cms/                    Dynamic CMS pages
├── crm/                    Segments, campaigns, flows (see 08-crm-system.md)
├── dashboard-client.tsx    Dashboard client component
├── dashboard-data.ts       Dashboard server data fetchers
├── domain-blocking/        Blocked email domains
├── email-center/           One-off email compose + inbox
├── exports/                Export Center + scheduled reports
├── integrity/              Vendor health + reconciliation status
├── messages/               Admin inbox (host channels)
├── migration/              Gamma migration runs
├── notifications/          In-app notification compose + log
├── packages/               Coin packages
├── players/                Player list + detail
├── promo-codes/            Active / archived / bonus / restrictions
├── promocode-blocking/     Blocked promo codes
├── reports/                Many report sub-pages
├── settings/               Operator settings; safety caps; terms
├── staff/                  Admin user CRUD (master only)
├── tiers/                  Loyalty tiers
├── transactions/           Purchases, redemptions, bonus awards, casino
├── vip/                    Master/manager VIP view (see 09-vip-host-system.md)
└── vips/                   Host VIP queue (see 09-vip-host-system.md)
```

The standard shape per section is `page.tsx` (RSC) + `_panel.tsx`
(client) + `_data.ts` (server fetchers + types) + `_form.tsx` for CRUD
(used by `new/page.tsx` and `[id]/page.tsx`).

---

## Visual system

Design language: dark theme, **Linear / Stripe-quality** density and
clarity. Not flashy; we want operator ergonomics. Tokens live in
`apps/web/app/globals.css` and `packages/ui/src/styles/`.

Shared admin components in `packages/ui/src/admin/`:

| Component       | Where                       | What                                             |
| --------------- | --------------------------- | ------------------------------------------------ |
| `PageHeader`    | `layout/PageHeader.tsx`     | Title + breadcrumb + actions slot.               |
| `ListPageShell` | `layout/ListPageShell.tsx`  | Filter bar + table + pagination shell.           |
| `DataTable`     | `data/DataTable.tsx`        | TanStack Table wrapper with our column patterns. |
| `FilterBar`     | `interactive/FilterBar.tsx` | Quick-preset date chips + search.                |
| `StatusPill`    | `display/StatusPill.tsx`    | Color-coded status.                              |
| Various forms   | `forms/*`                   | RHF + Zod form helpers.                          |
| Host UI         | `host/*`                    | Host-portal-only components.                     |

---

## Sections in detail

### Dashboard (`/admin`)

- `page.tsx` resolves the date range from the URL, fetches:
  - `fetchSliceForRange` (current + previous period)
  - `fetchSparklineSnapshots` (sparkline)
  - `fetchRecentSnapshots` (30-day series)
  - `fetchBonusBreakdown`
  - `fetchIntegrationHealth`
- `dashboard-client.tsx` renders the tiles.
- Real-time counters come via Pusher (`_realtime.tsx`).
- Hosts get `_host-dashboard.tsx` instead — focused on their VIP roster.

### Players (`/admin/players`)

- `page.tsx` + `players-list-client.tsx` — searchable, filterable list.
- `[id]/page.tsx` — full player detail with action dialogs
  (`_action-dialogs.tsx`).
- Action endpoints under `/api/admin/players/[id]/{kyc-level,
password-reset, profile, stealth-lock, wipe}`. All audit-logged.

### Cashier (`/admin/cashier`)

- Split-view UI (`_split-view.tsx`): list on the left, action panel on
  the right.
- Sub-routes: `pending`, `approved`, `cancelled`, `aml-hold`,
  `redeem-rules`.
- KPI banner at the top of the action panel: NGR (color-coded), rolling
  30-day amount, redemption amount, last redeem date.
- **Cancel auto-credits the SC back** via the ledger
  (`/api/admin/redemptions/[id]/cancel/route.ts` →
  `buildRedemptionRejected`).
- Redeem Rules engine (`/admin/cashier/redeem-rules`) backed by
  `packages/core/src/cashier/redemption-rules.ts` and the
  `redemption_rules` table.

### Casino Management (`/admin/casino`)

- `providers/` — provider list with GGR %, top-3 rank, date sort.
- `games/` — game catalog with Total Hold widget; drag reorder via
  `/admin/casino/games/reorder` (`reorder-client.tsx`).
- `lobby/` — live-preview WYSIWYG editor (`lobby-editor-client.tsx`)
  with section + per-section game ordering; saves to
  `PUT /api/admin/casino/lobby/layout`.
- `aggregators/` — aggregator catalogue (Alea sits here) with provider
  counts, latency/uptime widgets.
- `sub-categories/` — dedicated table-backed sub-categories with bulk-
  add by provider and drag reorder.

### Reports (`/admin/reports`)

Sub-pages: `affiliate`, `bonus`, `custom-query`, `daily-kpis`,
`playthrough`, `purchase`, `redeem-rate`, `tax`, `users-daily`.

Every report uses `_filters.tsx` (shared filter bar with quick-preset
date chips) and has a CSV export
(`/api/admin/reports/<name>/export/route.ts`). Each has a summary
metric tile row at the top.

The `custom-query` workbench lets manager+ run a constrained SQL query
against a read replica view — the column list is whitelisted; no
arbitrary tables.

### Transactions (`/admin/transactions`)

Sub-pages: `purchases`, `redemptions`, `bonus-awards`, `casino`,
`banking`, `redeem-requests`. Each uses shared
`_advanced-filters.tsx` and `_export-button.tsx`. CSV exports live at
`/api/admin/transactions/*/export/`.

The `casino` sub-page (per-round) has heavy pagination, sort, and
search; it was the operator's biggest historical pain point.

### Bonus (`/admin/bonus`)

Templates simplified to four categories: `purchase`, `player_gift`,
`promo_code_signup`, `promo_code_free`.

Sub-pages: `active`, `manual-award`, `playthrough`, `templates`.

- `manual-award/` — picker uses `/api/admin/players/search`; mirrors
  the in-player-card "Send bonus" UX.
- Pending bonus claim flow:
  `/api/player/bonus/pending/[awardId]/claim/route.ts` +
  `core.bonus.claimPending` and `core.bonus.listPending`.

### Promo Codes (`/admin/promo-codes`)

Sub-pages: `active`, `archived`, `bonus`, `restrictions`. Shared
`_promo-dialog.tsx`. Backed by `promo_codes` and `blocked_promo_codes`
tables.

Categories include free SC/GC on signup, on any purchase, and the
"lightning-bolt" code redemption.

### Packages (`/admin/packages`)

Standard `page.tsx` + `_panel.tsx` + `new/page.tsx` + `[id]/page.tsx`
with `_form.tsx`. Backed by `packages/core/src/packages/admin.ts`
which enforces hard caps, featured-slot uniqueness, and welcome-
package first-purchase rules.

Migration `0015_packages_overhaul.sql` added
`bonus_sc_playthrough_multiplier`, `featured_slot` (partial unique
index on active+non-archived), banner fields, badge color.

### Tiers (`/admin/tiers`)

CRUD + reorder. **Hard safety caps** (`TIER_CAPS` in
`packages/core/src/tiers/admin.ts`):

```
weeklyScMax:    5,000 SC
monthlyScMax:  25,000 SC
loginMultMax:    3.0×
cashbackPctMax: 25 %
maxTierCount:   8
```

Form shows "Heads-up" warnings near caps. Edit page shows current
player count + estimated weekly/monthly payout. Delete is blocked if
players or packages reference the tier (soft-delete via archive
instead).

Reorder uses an atomic two-step renumber to escape the unique-level
constraint (planned improvement: `DEFERRABLE INITIALLY DEFERRED` — see
report §4.8).

### CMS (`/admin/cms`)

CRUD on `site_content` rows where `value_json.kind = 'page'`. No new
tables.

- `page.tsx` + `_panel.tsx` — list.
- `new/page.tsx` + `[id]/page.tsx` — editor with split-pane live
  preview via `_form.tsx` and `_renderer.tsx`.
- Public route `/p/[slug]` renders the same content with
  `_public-renderer.tsx`.
- Migration `0016_cms_pages_seed.sql` seeded Terms, Privacy, Cookies,
  Sweepstakes Rules, Responsible Gaming, Bonus Terms, Jackpot
  (idempotent inserts).

**Tiny in-house markdown dialect**: `## heading`, blank-line paragraphs,
`-` lists, `**bold**`, `_italic_`, `[label](url)`. No
`dangerouslySetInnerHTML`. Parser duplicated three places (admin form,
public route, core canonical) with comments noting the duplication —
see report §4.3 for the future cleanup option.

### Email Center (`/admin/email-center`)

`packages/core/src/email/center.ts`:

- `sendOneOffEmail(ctx, input)` — honours suppression by default;
  `manager+` can override with `ignoredSuppression: true` (audited).
- `listInbox(ctx, filter)` — filtered inbox.
- `getMessage(ctx, id, createdAt)` — message detail.

Compose dialog (`_client.tsx`): recipient picker (email or player
search), template loader from `email_templates`, HTML body editor with
safe text-preview toggle.

Detail dialog: full delivery timeline (queued → sent → delivered →
opened → clicked), provider links, error block, body preview.

Eight widgets: Sent today, Open rate, Click rate, Bounce rate, Bounces,
Failed, Sending now, Sent 7d (tone-coded against thresholds).

CSV export of the filtered inbox.

> **Open item from report §4.5**: body is currently stored as a 200-char
> preview only. A decision is pending on whether to store full HTML, R2-
> reference it, or re-render on demand. Don't write an Email-Center-
> dependent feature that needs the full body until this is resolved.

### Notification Center (`/admin/notifications`)

Same playbook as Email Center but for in-app notifications. Recently
hardened in the back-office pass. Backed by `notifications` table +
`notification_templates`.

### Banners (`/admin/banners`)

Player-facing banner CRUD. Standard shape.

### Exports + Scheduled Reports (`/admin/exports`)

- Export Center: enqueue exports of any of the report kinds. Worker
  job `generate-export.ts` does the actual generation and uploads to
  R2. Download links expire in 24h via `expireDownloadLinks`.
- Scheduled reports: subscriptions to any report kind, on a cadence
  (`daily`, `weekly`, `monthly`). Worker job `send-scheduled-reports.ts`
  honours the cadence.

### Integrity (`/admin/integrity`)

Vendor health page. Shows each vendor's:

- Mock-mode badge (when `USE_MOCK_*` is on).
- Last-hour request count + error count + p95 latency.
- Last reconciliation result (where applicable).

Data sourced from `integration_health` table (refreshed by
`reset-integration-health-counters.ts`).

Sub-page `/admin/integrity/alea` shows the latest Alea reconciliation
findings.

### Settings (`/admin/settings`)

Operator-wide settings, terms versions, safety caps.

- `safety-caps/` — `manager+` can adjust TIER_CAPS values within hard
  limits.
- `terms/` — Terms / Privacy / etc. versioning UI. `terms_versions`
  table.

### Staff (`/admin/staff`)

`master` only. Create / edit / deactivate admins. New admins are sent
their temp password by email; `must_reset_password = true` forces a
reset on first login.

### Audit (`/admin/audit`)

Read-only audit log viewer. `manager+`.

### Migration (`/admin/migration`)

UI for the Gamma migration pipeline (docs/13). Lists runs, lets you
kick off a new one, shows record-level results. Worker job
`gamma-import.ts` does the heavy lifting.

### Domain & Promo Code Blocking

Two simple list pages backed by `blocked_email_domains` and
`blocked_promo_codes` respectively. `manager+` to add; `master` to
remove.

### Admin Added Coins (`/admin/admin-added-coins`)

The manual adjustments audit trail. Every manual SC/GC grant or
removal shows here with the reason, actor, and ledger entry id.

### Messages (`/admin/messages`)

Admin-side inbox. Hosts use this heavily (the host portal renames the
nav label to "Messages"). Channels: WhatsApp, Telegram, phone, email
in-line. Backed by `host_player_interactions` for the host case.

### Account (`/admin/account`)

Admin's own profile, password change, 2FA management (disable +
re-enroll), API key issuance (planned).

---

## API surface (admin REST)

Under `apps/web/app/api/admin/`. 28 sub-areas mirroring the page
folders. Patterns:

- `GET /api/admin/X` — list (paginated).
- `GET /api/admin/X/[id]` — detail.
- `POST /api/admin/X` — create.
- `PUT /api/admin/X/[id]` — update.
- `DELETE /api/admin/X/[id]` — archive (soft delete).
- `GET /api/admin/X/export` — CSV export.

Every handler:

1. `requireAdminSession()` — verifies the HMAC + 2FA.
2. Calls the named permission helper (e.g. `canEditPackages(role)`).
3. Parses input with Zod.
4. Builds a `Context` and calls into `packages/core`.
5. Returns JSON with `Cache-Control: no-store`.

---

## Adding a new admin page

The playbook (~30 minutes for a simple CRUD):

1. **Decide the section**: existing folder or new top-level folder?
2. Create `app/(admin)/admin/<section>/page.tsx` (RSC).
3. Create `_data.ts` with fetchers + types.
4. Create `_panel.tsx` (client) for the table + dialogs.
5. (CRUD) Create `_form.tsx`, `new/page.tsx`, `[id]/page.tsx`.
6. Create matching API routes under `app/api/admin/<section>/`.
7. Add the menu entry in `admin-shell.tsx`.
8. Add named permission helper(s) in `packages/core/src/auth/permissions.ts`.
9. Wire RLS policy if the underlying table needs one.
10. Write tests for the core function(s).
11. Update this doc.

The hardening pass report (`reports/2026-05-19_admin_backoffice_pass.md`)
walks through this for ~12 sections in detail; that's the best
template.

---

## What to read next

- `09-vip-host-system.md` — the dedicated host portal.
- `08-crm-system.md` — the CRM sub-section in depth.
- `17-conventions.md` — code style + patterns we lock in.
