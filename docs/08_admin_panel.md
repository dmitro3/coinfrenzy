# CoinFrenzy Platform — Admin Panel (Page-by-Page)

**Document:** 08 of 13
**Reads:** Doc 01-03, Doc 09 (roles), all other docs (references domains)
**Read alongside:** Doc 10 (Frontend Architecture)
**Purpose:** Page-by-page spec of the admin backoffice. The blueprint Cursor builds against.

---

## 0. The design north star

This is the section every Cursor session reads first when building
admin pages. It is the single most important page-design rule in the
entire spec.

**The admin is Frenzy Creator's dashboard aesthetics applied at Gamma's
scope.** That means:

1. **Clean over comprehensive.** Show what matters at-a-glance, hide the rest behind drill-downs. Gamma shows everything always; the result is visual noise. We show the top 3-5 numbers prominently, the next tier in a secondary row, and the rest one click away.

2. **Information hierarchy by importance.** The number a master admin checks first (today's net SC position, redemption queue depth) is biggest and topmost. Drill-down details are smaller and further down. This is the Frenzy Creator pattern that worked.

3. **Player cards over player rows.** When you open a single player, you get a card-style layout with their stats grouped visually (Identity | Money | Activity | Compliance), not a wall of fields. Click any group to see detail. Gamma's player detail page is a wall of fields; we do better.

4. **Density inside cards is fine.** Once a user has chosen to drill in, density is welcome. The discipline is in the entry point.

5. **Tables are dense but sortable, filterable, and savable.** Every table view supports: column show/hide, multi-column sort, saved filter presets per admin user, CSV export of the current view. These are Gamma's missing features.

6. **Real-time where it matters.** Online players counter, redemption queue depth, today's GGR — these update in real-time without a page reload. Static data (player history) doesn't.

7. **Keyboard navigation.** Power users live in keyboard. Shortcuts: `/` to focus search, `g p` to go to players, `g r` to go to redemptions, `g d` for dashboard. Documented at Help → Shortcuts.

8. **Dark mode is the default.** Gamma's UI is dark. We keep it. Casino operators work nights.

9. **No dead clicks.** Every clickable region either navigates, opens a drawer, or shows a tooltip. If something looks clickable but isn't, fix the look.

10. **Loading states are not blank screens.** Skeleton loaders for tables, shimmer placeholders for cards, optimistic updates for mutations.

---

## 1. Navigation structure

Top-level nav (left sidebar, in this order):

```
DASHBOARD          (default landing for every role)
PLAYERS            (the most-used section)

CASINO MANAGEMENT
├─ Provider Dashboard
├─ Game Dashboard
├─ Game Lobby
├─ Aggregators
├─ Providers
├─ Sub Categories
├─ Games
└─ Jackpot

REPORTS
├─ Daily KPIs (replaces MERV)
├─ Purchase Report
├─ Bonus Report
├─ Users Daily Report
├─ Redeem Rate Report
├─ Playthrough Report
├─ Affiliate Report
└─ Custom Query

TRANSACTIONS
├─ Casino Transactions
├─ Transactions Banking
└─ Redeem Requests

CASHIER MANAGEMENT
├─ Pending Redemptions
├─ Approved Redemptions
└─ Cancelled Redemptions

BONUS
├─ Active Bonuses
├─ Bonus Templates
├─ Playthrough Tracking
└─ Manual Award

PROMO CODES
├─ Active
├─ Archived
└─ Block List

CRM PROMOTION  (replaces Optimove — see Doc 11)
├─ Segments
├─ Campaigns
├─ Flows
├─ Templates (Email)
├─ Templates (SMS)
└─ Message Log

PACKAGES
TIERS
CMS
EMAIL CENTER       (transactional templates, separate from CRM)
BANNER MANAGEMENT
NOTIFICATION CENTER
EXPORT CENTER
DOMAIN BLOCKING
PROMOCODE BLOCKING
ADMIN ADDED COINS
INTEGRITY          (NEW — Frenzy Creator pattern)

STAFF              (manager+ only)
AUDIT LOG          (manager+ only)
SETTINGS           (master only)
```

Sub-sections collapse/expand. Selected page is highlighted. Mobile/narrow
view collapses sidebar to icon-only with hover labels.

---

## 2. The Dashboard page

Default landing for every role. Each role sees a different curated set
of tiles.

### 2.1 Master / Manager dashboard

Top row — **The Money** (8 tiles, large, real-time):
- Today's SC Staked
- Today's GGR (SC)
- Today's NGR (SC)
- SC Awarded (Bonus + Welcome + Daily + etc combined)
- Net SC Position (cumulative)
- Today's Deposits ($)
- Pending Redemptions (count + amount)
- Online Players (real-time)

Second row — **Engagement** (5 smaller tiles):
- DAU
- New Signups Today
- First-Time Purchasers Today
- 7-Day Active
- Unique Logins Today

Third row — **Operational** (4 mid-size cards with mini-charts):
- 7-Day GGR trend (sparkline)
- 7-Day SC Staked trend
- 7-Day Net Deposit trend
- Bonus award breakdown (last 7d, stacked bar by bonus type)

Fourth row — **Drill-downs** (2 wide cards):
- "Today's bonus breakdown" — the 14-type table from MERV with Today/Yesterday/MTD columns. Sortable.
- "Login & Customer data" — the 6-metric × 6-time-window matrix.

Fifth row — **Health** (single card with all integrations):
- Alea: green/yellow/red, last seen, error count 1h
- Finix: same
- Footprint: same
- Radar: same
- Inngest: same

Date range selector at top right (default: today). Player type filter
(default: real players — excludes internal accounts). "Refresh now" button.

### 2.2 Support / KYC / Cashier dashboards

Heavily customized per role. For cashier role:

Top row — **Queue Status** (real-time):
- Pending Redemptions count + total $
- Average processing time (1h trailing avg)
- Cancelled today
- Approved today

Middle — **Pending Queue Preview** (5 oldest pending redemptions).

Bottom — **My Activity** (this admin's actions today).

For support role: top row is open tickets, KYC pending, player-flagged-
for-review, etc.

Roles see only their own dashboards by default; Manager+ can switch
view to any other role's dashboard for context.

### 2.3 Customization

**Each admin can rearrange their dashboard tiles** by drag-and-drop.
Saved per admin in `admin_dashboard_layouts` (new table, see §15).
Cursor builds this with `react-grid-layout` or similar. Default
layout per role from §2.1/§2.2; admin can deviate.

---

## 3. Players section

The most-used page. Has to be excellent.

### 3.1 Players list view

Full-width data table. Columns (configurable, default shown):
- ID (player_id, truncated to 6 chars, hover for full)
- Email
- Username (or "—" if null)
- Registered (date, sortable)
- Status (badge: green/yellow/red/gray)
- Tier (badge with icon)
- SC Balance (right-aligned, formatted)
- Last Login (relative + absolute on hover)
- Actions (eye to view, edit pencil, suspend/restrict icon)

Filters (top of table, collapsible):
- Status (multi-select)
- Tier (multi-select)
- State (multi-select with US state list)
- Registered between (date range)
- Last login between (date range)
- SC balance range
- Lifetime spend range
- KYC level
- Has affiliate (yes/no/specific affiliate)
- Internal account (yes/no/all — default no for masters, hidden for support)
- Self-excluded (yes/no)

Search bar above filters: searches email, username, display_name, player_id,
phone, gamma_user_id. Hit `/` to focus from anywhere.

Saved filter presets (per admin):
- "VIPs to watch" (Manager preset: Tier ≥ Gold AND last_login > 7d ago)
- "Cashier queue" (preset: status = Active AND pending_redemption > 0)
- (Each admin builds their own)

Bulk actions (with confirmation):
- Send email to selected (opens CRM campaign with these as segment)
- Add note to selected
- Tag with custom flag
- Export selected to CSV

Performance: 6,000 player list loads in < 200ms with cursor pagination.
At 5M players, load is the same — `players` table is indexed on the
filter columns.

### 3.2 Single player view — the card layout

The Frenzy Creator inspiration. Player page has 6 cards visible at
once on a wide screen:

```
┌──────────────────────────┬──────────────────────────┬──────────────────────────┐
│ IDENTITY                  │ MONEY                    │ ENGAGEMENT               │
│                           │                          │                          │
│ avatar+name+email         │ SC balance (sub-buckets) │ Last seen + IP + geo    │
│ phone, DOB, address       │ GC balance               │ Sessions in last 7d      │
│ KYC level + badges        │ Lifetime deposited       │ Games played + favorite  │
│ Tier + XP progress bar    │ Lifetime redeemed        │ Avg session length       │
│ Member since              │ Net position             │ Last 5 logins            │
│                           │ Outstanding playthrough  │                          │
│ [Edit Identity]           │ [View Ledger]            │ [View Activity]          │
└──────────────────────────┴──────────────────────────┴──────────────────────────┘
┌──────────────────────────┬──────────────────────────┬──────────────────────────┐
│ COMPLIANCE                │ MARKETING                │ NOTES                    │
│                           │                          │                          │
│ Status + flag chips       │ Email/SMS consent        │ Pinned note (most recent)│
│ Active RG flags           │ In segments              │ Last 3 admin notes       │
│ Self-exclusion history    │ Last campaign received   │                          │
│ KYC review history        │ Open rate, click rate    │                          │
│                           │                          │                          │
│ [Manage RG] [Review KYC]  │ [Add to Segment]         │ [+ Add Note]             │
└──────────────────────────┴──────────────────────────┴──────────────────────────┘
```

Below the 6 cards: tabbed sub-views for the detail layers.

Tabs (along the top of the lower section):
- **Transactions** (purchases, redemptions, refunds, admin adjustments)
- **Game Activity** (sessions + rounds, paginated)
- **Bonuses** (active + completed + expired, with playthrough state)
- **Ledger** (full ledger entries — for forensic / dispute investigation)
- **Audit** (every admin action on this player)
- **Notes** (full notes thread)
- **Communications** (every email/SMS this player received from CRM)

### 3.3 Player edit drawer

Opens as a side drawer (not a separate page) for fast actions:
- Edit identity fields (email, phone, address, DOB)
- Update status (active/suspended/restricted/closed)
- Set RG limits (deposit, session)
- Add compliance flag
- Trigger 2FA reset
- Force logout (revoke all sessions)
- Issue admin adjustment (opens adjustment form)

All actions require confirmation. All write to audit_log.

---

## 4. Casino Management

### 4.1 Provider Dashboard

Per-provider stats:
- Today's NGR by provider (sortable)
- Today's player count by provider
- 7d trend per provider
- Top 5 games per provider (by NGR)
- Provider status (active / disabled)

Card view: one card per provider with logo, status pill, today's
numbers, mini-chart. Click to drill into that provider's full page.

### 4.2 Game Dashboard

Per-game stats:
- Today's NGR per game (sortable, default sort)
- Today's player count
- 7d trend
- Average bet size
- RTP (set vs. realized — divergence flag if > 2%)
- Status (active / disabled / customer-facing)
- Quick toggle: customer-facing on/off

Table view with thumbnail, name, provider, category, RTP, today's NGR,
status, actions.

### 4.3 Game Lobby

The lobby configuration: which games appear in which category, in
what order, in which sub-categories. Drag-to-reorder within categories.
Saved as `game_lobby_config` (JSON in `site_content` table). Preview
button shows the player-facing lobby with current config.

### 4.4 Aggregators, Providers, Sub Categories, Games

CRUD pages. Standard table + edit drawer. The edit drawer for Games
includes the playthrough_weight setting per Doc 03 v2 §4 — by default
slots are 1.0, table games 0.25, live dealer 0.10.

### 4.5 Jackpot

Configuration for progressive jackpots:
- Pool current value
- Seed amount
- Increment per bet (percentage)
- Last won date + amount
- Winner history

---

## 5. Reports section

### 5.1 Daily KPIs (replaces MERV)

The 57-column daily snapshot from `daily_operational_snapshots`.
Default view: last 30 days, one row per day, all columns visible.

Top of page: 7-day and 30-day moving averages on key metrics (DAU,
GGR, NGR, deposits, bonus awarded).

Each column header sortable, hideable. Saved column views per admin.
Export CSV button.

### 5.2 Purchase Report

The 21-column per-player lifetime view from `player_lifetime_stats`.
Filterable by: date range (which lifetime stats are bounded by),
affiliate, tier, state, balance range. Same density as Gamma but with:
- Drill-into-player on any row click
- Column hiding
- Saved views
- Bulk export

### 5.3 Bonus Report

Per-bonus-type breakdown:
- Total awarded by type (the 14 types)
- Per-day timeline
- Playthrough completion rate by bonus type
- Forfeit rate by bonus type
- Drill into any bonus type to see which players received it when

This is the kind of analytics Gamma doesn't expose well. We do.

### 5.4 Users Daily Report

Per-day per-cohort breakdown of new users, returning users, churned users.
Cohort by signup-date-week. Powers "is the platform growing or shrinking"
questions.

### 5.5 Redeem Rate Report

Daily redemption rate (USD redeemed / USD deposited) over time. With:
- Per-state breakdown
- Per-tier breakdown
- Anomaly detection (any day where rate is > 2 stddev from 30-day mean is flagged)

### 5.6 Playthrough Report

Per-bonus playthrough velocity:
- Average rounds to complete playthrough by bonus type
- Completion rate by bonus type
- Expiry rate by bonus type
- Forfeit reasons distribution

### 5.7 Affiliate Report

Per-affiliate breakdown:
- Active campaigns
- Total signups attributed
- Active players from attribution
- Lifetime NGR from attributed players
- Outstanding payout balance
- Last payout date

Click an affiliate to see their attributed players, their attribution
history, their payout history.

### 5.8 Custom Query (NEW — Master+ only)

A SQL-like (but constrained) query builder. Pick a base table, add
filters, group by, aggregate, save as report. Internally compiles to
parameterized SQL against read replicas. Heavy guardrails:
- Read-only (no INSERT/UPDATE/DELETE)
- Query timeout 30 seconds
- Result limit 10,000 rows (for safety)
- Logged to audit_log

This is the escape hatch when the prebuilt reports don't answer
something specific.

---

## 6. Transactions section

### 6.1 Casino Transactions

Per-game-round detail (from `game_rounds`). Filterable by player,
game, date range, bet/win range. Drill into individual round to see
the raw outcome JSON.

### 6.2 Transactions Banking

Per-purchase detail (from `purchases`). Filterable by player, status,
date range, amount range, payment method (card brand, last 4),
Finix transfer ID. Drill into row to see the full Finix transfer
object + 3DS result + AVS result.

### 6.3 Redeem Requests

Per-redemption detail (from `redemptions`). Same density as Gamma's
current view but with:
- Drill-into-Finix-transfer details on click
- Status-change history visible
- Reviewer history visible
- Quick action buttons (approve, reject, escalate to manager)

---

## 7. Cashier Management section

### 7.1 Pending Redemptions

The redemption review queue. This is where cashiers live.

Layout: split view.
- Left pane: list of pending redemptions, sortable by created_at, amount, player tier
- Right pane: selected redemption's full context

Right pane shows:
- Player profile summary (with link to full profile)
- Player's purchase history (last 10)
- Player's redemption history (all)
- KYC status detail
- Geo / IP / VPN status for this request
- Recent compliance flags
- Action buttons: Approve | Reject | Escalate to Manager | Add Note

Approve writes the `redemption_paid` ledger entries (per Doc 04 §3.8)
once Finix returns confirmation.

Reject prompts for reason category + freetext, writes
`redemption_rejected` entries (Doc 04 §3.9), returns SC to player.

Escalate moves to a queue visible only to Manager+ role.

Bulk approve: select multiple low-risk redemptions (low amount, KYC
verified, no flags), approve all at once. Each becomes its own
transaction; failures don't roll back the others.

SLA timer visible: time since requested. Color-codes if approaching
the SLA target (default: 4 hour).

### 7.2 Approved Redemptions

Recent approvals (last 7 days default), filterable. Mostly read-only
for auditing.

### 7.3 Cancelled Redemptions

Cancelled by player or rejected by admin. Useful for support
when a player asks "what happened to my redemption?"

---

## 8. Bonus section

### 8.1 Active Bonuses

Live bonuses currently awarded to any player. Filterable by bonus
type, player, expiry date, playthrough completion status.

This is where you spot "9,431 players have an active welcome bonus
with $2,300 outstanding playthrough" at a glance.

### 8.2 Bonus Templates

CRUD for `bonuses` rows. The edit form for a bonus template includes:
- Display name + slug
- Bonus type (the 14 types)
- GC + SC amounts (fixed or formula)
- **Playthrough multiplier (this is the "Gamma can't do this" feature)**
- Playthrough window in hours
- Game weight overrides (slots %, table %, live %, originals %)
- Min bet for contribution
- Max bet during playthrough
- Min tier eligibility
- Max awards per player lifetime
- Cooldown between awards
- Stackability
- Validity window
- Description + terms

Every change is versioned; old bonuses_awarded carry their snapshot
config. Changing a template doesn't affect already-awarded bonuses.

### 8.3 Playthrough Tracking

Per-player view of playthrough state across all their active bonuses.
Useful for:
- Support questions ("why can't I redeem yet?")
- Identifying players close to playthrough completion (CRM trigger)
- Spotting playthrough abuse (someone always playing exactly the min bet)

### 8.4 Manual Award

The form for granting a bonus manually. Pick player(s) (single or
bulk), pick bonus template, override award amount if needed, write
a reason. Manager+ for any amount; below threshold for support+
(threshold configurable per Doc 09 §3).

Writes a `bonuses_awarded` row + corresponding ledger entries (Doc 04
§3.4) + audit_log entry.

---

## 9. Promo Codes section

### 9.1 Active

The current list. CRUD via standard table + edit drawer.

Promo code edit drawer includes the variable-playthrough fields per
Doc 03 v2 §5.

### 9.2 Archived

Expired or manually archived codes. Read-only.

### 9.3 Block List

Domain-, IP-, and code-blocking. Three sub-tabs. Standard CRUD.

---

## 10. CRM Promotion section

This is the big-new-thing. Full spec in Doc 11. From an admin-UI
perspective:

### 10.1 Segments

List view of saved segments with:
- Name
- Estimated player count (cached, refreshed when opened)
- Last computed
- Created by
- Actions: Edit | Duplicate | Delete | Export | Use in Campaign | Use in Flow

Edit view: a visual segment builder. Drag-and-drop conditions:
- Demographic (tier, state, age range)
- Behavioral (played game X, wagered Y in window Z, last login in window W)
- Financial (lifetime deposit range, balance range, redemption count)
- CRM (in segment X, received campaign Y, opened email Z)
- Compound (AND/OR groups, nested)

Live count updates as you build ("8,432 players match" with a refresh
button).

### 10.2 Campaigns

List + new campaign wizard. Wizard:
1. Pick channel (email / SMS / in-app)
2. Pick segment
3. Pick template
4. Schedule (now / scheduled / recurring)
5. Preview (first 5 recipient previews with template variables rendered)
6. Send

Once sent: stats page with open rate, click rate, unsubscribe rate,
bounce rate, conversion rate (if conversion event is configured).

### 10.3 Flows

Visual state-machine builder. Trigger event → wait → condition →
action → repeat. Builder is a node-based UI (similar to Zapier/n8n
for the visual). Compiles to `crm_flows` + `crm_flow_steps` rows.

Active flows show how many players are currently enrolled, completed,
in-flight at each step.

### 10.4 Templates (Email + SMS, two separate sub-sections)

CRUD for email and SMS templates. Email templates have a WYSIWYG
editor with template variable insertion. SMS templates are plaintext
with the 160-character indicator.

Preview with sample player data.

### 10.5 Message Log

Every email/SMS sent (from `crm_message_log`). Searchable by player,
campaign, date, channel, status. Useful for support when a player
asks "did I get the welcome email?"

---

## 11. Packages, Tiers, CMS, Email Center, Banners, Notifications, Domain Blocking, Promocode Blocking

Standard CRUD per Doc 03 v2. Listed for completeness:

- **Packages**: list + edit + reorder + archive
- **Tiers**: list + edit (10 tiers default; can add more)
- **CMS**: site_content key-value editor with preview
- **Email Center**: transactional email templates (separate from CRM marketing — these are receipts, password resets, etc.)
- **Banner Management**: image upload + scheduling + per-page targeting
- **Notification Center**: send in-app notifications to player(s)
- **Domain Blocking**: blocked email domains list
- **Promocode Blocking**: codes that should never work

All follow the same pattern: table list, search, filters, edit drawer,
audit_log on every change.

---

## 12. Export Center

Centralized exports. Two types:

**Pre-built exports** (one click): Players, Purchases, Redemptions,
Bonuses, Daily KPIs, Affiliates, Audit Log. Each with date range +
filter UI.

**Custom exports**: Master admin can save a custom query (from §5.8)
as a recurring export. Exports generate as CSV/JSON, stored in R2,
delivered via email link with 24-hour expiry.

Export queue visible: which exports are running, queued, completed.
Each export's status, size, and download link.

---

## 13. Integrity section (NEW)

The Frenzy Creator pattern that Gamma lacks. One page showing the
real-time health of every external dependency and internal system.

Tiles per provider/system:
- Alea: status, last seen, error count 1h, p99 latency 1h
- Finix: same
- Footprint: same
- Radar: same
- SendGrid: same
- Twilio: same
- Inngest: same (queue depth visible)
- Redis: ping latency, hit rate
- Neon: connection count, slowest query 5min, replication lag if any
- Ledger reconciliation: last successful run, drift status

Click any tile to drill into recent error log + manual retry buttons
where applicable.

Refresh every 30 seconds (server-sent events, not polling).

This is where you go when something feels off. It tells you what's
broken before a player calls support.

---

## 14. Staff, Audit Log, Settings

### 14.1 Staff

Master-only page. List of admin users. CRUD for staff:
- Add new staff (email, name, initial role, send invite)
- Edit roles
- Force password reset
- Force 2FA reset
- Revoke all sessions
- Suspend account
- Terminate account (soft delete; audit retained)

Audit log entries per staff member visible.

### 14.2 Audit Log

Manager+ page. Append-only audit feed (the `audit_log` table).

Filters: actor, resource type, action, date range. Most-used view:
"What did admin X do in the last 24 hours."

Each entry shows: who, when, what action, what resource, before/after
diff, reason if provided. Click to expand for full JSON.

### 14.3 Settings (master-only)

- Site-wide config (under maintenance mode, signup open, etc.)
- Default RG limits (new players get these)
- Approval thresholds (cashier max, adjustment max, etc.)
- Integration credentials (read-only display of which secrets are set; values themselves come from Doppler)
- Backup / export controls

---

## 15. Schema patches required for admin functionality

Add to Doc 03 v2 in a future minor revision:

```sql
create table admin_dashboard_layouts (
  admin_id     uuid not null references admins(id) on delete cascade,
  layout       jsonb not null,
  updated_at   timestamptz not null default now(),
  primary key (admin_id)
);

create table admin_saved_views (
  id           uuid primary key default gen_random_uuid(),
  admin_id     uuid not null references admins(id) on delete cascade,
  scope        text not null,    -- 'players' | 'transactions' | 'redemptions' | etc
  name         text not null,
  filter_config jsonb not null,
  column_config jsonb,
  is_shared    boolean not null default false,
  created_at   timestamptz not null default now()
);

create index admin_saved_views_scope_idx on admin_saved_views(scope, admin_id);

create table admin_notes (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references players(id) on delete cascade,
  admin_id     uuid not null references admins(id),
  note         text not null,
  pinned       boolean not null default false,
  created_at   timestamptz not null default now()
);

create index admin_notes_player_idx on admin_notes(player_id, created_at desc);
create index admin_notes_pinned_idx on admin_notes(player_id) where pinned = true;

create table custom_query_definitions (
  id           uuid primary key default gen_random_uuid(),
  admin_id     uuid not null references admins(id),
  name         text not null,
  description  text,
  query_config jsonb not null,    -- the structured query, not raw SQL
  schedule     text,              -- cron-style; null = manual run only
  last_run_at  timestamptz,
  created_at   timestamptz not null default now()
);
```

---

## 16. Performance targets for admin pages

| Page                          | Target load | Notes                                                  |
| ----------------------------- | ----------- | ------------------------------------------------------ |
| Dashboard (default)           | < 800ms     | All tiles, real-time counters                          |
| Players list (filtered)       | < 200ms     | With pagination cursor                                 |
| Single player view            | < 300ms     | Includes all 6 cards (parallel queries)                |
| Single player ledger          | < 500ms     | Up to 1000 entries paginated                           |
| Reports (Daily KPIs, 30d)     | < 300ms     | Pre-aggregated in snapshots table                      |
| Reports (Custom Query)        | < 30s       | Hard timeout; warn if running > 5s                     |
| Redemption queue              | < 200ms     | Always shows pending; sorted; small dataset            |
| CRM segment builder count     | < 1s        | Against rollup tables                                  |
| CRM segment full fetch        | < 5s        | Streaming for > 100k results                           |
| Audit log (filtered, 1d)      | < 200ms     | Indexed on (actor_id, occurred_at) and similar         |

These are budgets. Doc 12 (Reporting) and Doc 10 (Frontend) collaborate
to hit them.

---

## 17. The visual style guide (one paragraph)

Color: dark theme primary, with a constrained accent palette
(green for positive, red for negative, yellow for warning, blue for
informational, purple for premium/VIP). Avoid rainbow dashboards —
Gamma's tile colors are too varied. Pick 4-5 status colors and stick
with them.

Typography: one sans-serif for UI text, one monospace for IDs and
financial numbers. Numbers always right-aligned in tables; always
monospace.

Spacing: 8px grid. Cards get 24px internal padding. Tables get 12px
row height. Big numbers on dashboard tiles get extra breathing room.

Iconography: lucide-react. Consistent stroke weight. Don't mix icon
sets.

Interactive states: hover, focus, active, disabled all defined. Focus
rings always visible (accessibility).

Cursor builds this against shadcn/ui as the base, with theme tokens
in Tailwind config. The frontend-design skill in `/mnt/skills/public/`
handles the design language details.

---

## 18. What's next

Doc 10 (Frontend Architecture) covers how this admin UI is actually
implemented — the component hierarchy, the routing model, the state
management, the real-time wiring. Doc 11 (CRM) covers the CRM section
in depth. Doc 12 (Reporting) covers the Reports section in depth.

Once API docs land, Docs 05/06/07 fill in the parts where admin pages
trigger external integrations.
