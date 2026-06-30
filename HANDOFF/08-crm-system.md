# 08 · CRM System

A full in-house CRM, comparable in surface area to Customer.io or
Klaviyo. Built in milestone M3. **No external CRM dependency** — every
piece (segments, campaigns, flows, suppression, A/B testing, dispatch)
runs on our own data store and our own workers.

The reason: tight loop between the casino activity stream and
marketing decisions; no PII leakage to a third party; no per-message
cost.

---

## Where the code lives

```
packages/core/src/crm/
├── attributes.ts       Attribute registry (50+ player attributes)
├── ab-stats.ts         A/B test statistical significance engine
├── campaigns.ts        Campaign CRUD + send orchestration
├── cohort.ts           Cohort analysis (retention heatmap)
├── compiler.ts         Filter tree → parameterised SQL compiler
├── dispatchers.ts      Channel dispatchers (email/sms/push/in-app)
├── eligibility.ts      Per-player eligibility (suppression, RG, etc.)
├── event-registry.ts   Triggerable + conversion event single source of truth
├── events-feed.ts      Real-time events feed
├── filter-tree.ts      Filter tree schema + helpers
├── flow-recipes.ts     Pre-built flow templates (welcome series, dormant winback, etc.)
├── flows.ts            Flow CRUD + step engine
├── insights.ts         Performance insights queries
├── preview.ts          Variable preview against real players
├── send-direct.ts      One-off send (used by Email Center)
├── segments.ts         Segment CRUD + sample + count
├── templates.ts        Template registry (email / sms / push / in-app)
└── test-send.ts        "Test send to me" infrastructure
```

Admin UI:

```
apps/web/app/(admin)/admin/crm/
├── page.tsx                 Index
├── _data.ts                 Shared fetchers
├── _template-shared.ts      Template UI helpers
├── campaigns/               Campaign wizard + list
├── cohorts/                 Cohort analysis
├── email-templates/         Email template editor (TipTap)
├── events/                  Real-time events feed
├── flows/                   Visual flow designer (xyflow)
├── library/                 Recipe gallery
├── message-log/             Cross-channel message log
├── performance/             Dashboards
├── segments/                Segment builder
├── sms-templates/           SMS template editor
└── suppression/             Suppression list management
```

API:

```
apps/web/app/api/admin/crm/   (CRM endpoints, ~20 routes)
```

Worker jobs:

```
apps/worker/src/jobs/
├── crm-campaign-sender.ts     Campaign dispatch + AB winner decider + conversion attribution
├── crm-flow-enroller.ts       Enroll players into flows on event match
├── crm-flow-runner.ts         Advance flow enrollments one step at a time
├── refresh-player-stats.ts    Hourly attribute cache refresh
└── refresh-player-stats-full.ts  Nightly full refresh
```

---

## Attribute registry

`packages/core/src/crm/attributes.ts` is the single source of truth for
every player attribute the segment builder, the variable engine, and
the compiler can address.

Each attribute declares:

- `key` (stable id) + `label` (human) + `category`.
- `valueType` (`number`, `string`, `date`, `boolean`, `enum`, `game`,
  `provider`, `category`, `tier`).
- Legal operators (`=`, `!=`, `>`, `<`, `between`, `in_list`,
  `contains`, `starts_with`, `is_set`, …).
- SQL source: how to express the attribute as a column, expression,
  correlated subquery, predicate, or parameterised predicate.

There are **90+ registered attributes** covering:

- Identity (email, username, country, state, dob, signup source).
- Engagement (lifetime sessions, last seen, days since last play).
- Money (lifetime purchase USD, lifetime SC won, lifetime redemption
  USD, last purchase amount, average purchase, package preference).
- Bonuses (active bonus count, playthrough state, total bonus awarded).
- VIP / Tier (current tier, days at tier, VIP status, host assigned).
- KYC / RG (KYC level, self-excluded, RG limits set).
- CRM (last email open, last SMS click, suppression status).
- Compliance (AML flag count, last AML review).

When you add a new attribute, extend the registry; the compiler picks
it up automatically. **Never let user input touch SQL fragments** —
the compiler uses positional `$N` placeholders and the registry's SQL
strings are static.

---

## Segment builder

`/admin/crm/segments`

- Visual filter tree builder (`filter-tree.ts` defines the schema).
- Live count + sample preview as you build (under 400 ms p95).
- "Smart suggestions" recommend operators based on attribute type.
- Saves to `crm_segments` (filter tree as JSONB).

Compiler (`compiler.ts`) turns the filter tree into a parameterised
SQL query with JOINs only for the attributes actually used.

### Editing a segment

1. Pick attributes from the registry.
2. Build the tree (AND/OR groups).
3. Hit "Preview" — see count + 50 sample players.
4. Save — segment is persisted.

Segments are used by campaigns + flows; deleting a referenced segment
soft-archives instead.

---

## Cohort analysis

`/admin/crm/cohorts`

- Retention heatmap: cohort by signup week × week-N retention rate.
- Filterable by signup source, package preference, state.
- Backed by `cohort.ts` queries.

---

## Campaigns

`/admin/crm/campaigns`

5-step wizard:

1. **Audience** — pick segment.
2. **Content** — pick template (email/sms/push/in-app), preview with
   variables substituted against real sample players.
3. **A/B split** — optional. Set % per variant; winner decider
   activates after the sample size threshold.
4. **Schedule** — send now / one-time future / recurring.
5. **Review** — confirm + launch.

Backed by `crm_campaigns` table. Sent messages logged in
`crm_message_log` (partitioned by created_at).

### A/B testing

`ab-stats.ts` implements two-sample tests for conversion rate
differences (Z-test with continuity correction). Once the
configured sample size + statistical significance threshold are met,
the winner is declared and the remaining audience is sent the winning
variant (`crmAbWinnerDecider` job).

### Quick actions

The campaign list (`_row-actions.tsx`) supports quick pause / resume /
archive without entering the campaign detail.

---

## Flows

`/admin/crm/flows`

Visual flow designer (`@xyflow/react`):

- **Trigger nodes** — entry conditions (e.g. "signup", "first
  redemption", "30 days dormant").
- **Action nodes** — send email/sms/push/in-app, wait, branch on
  condition, end.
- **Branch nodes** — conditional split based on attribute.
- **Wait nodes** — time-based delay.

State stored across `crm_flows`, `crm_flow_steps`, and
`crm_flow_enrollments`.

### Recipes

`flow-recipes.ts` + `/admin/crm/library` (`_recipe-gallery.tsx`)
provides pre-built flow templates:

- Welcome series (signup → day 1 / day 3 / day 7 nudges).
- Dormant winback (no play in 14 days → re-engagement).
- First-purchase booster (24h after signup, no purchase → discount
  reminder).
- Big-win celebration (win > $X → congratulations).
- Etc.

Operators clone a recipe and customise.

### Runner mechanics

- `crmFlowEnroller` — on every relevant event, evaluates which flows
  the player just became eligible for and enrolls them.
- `crmFlowRunner` — periodic; advances enrollments one step at a time,
  honouring wait nodes and re-evaluating branches.

---

## Events

`event-registry.ts` is the single source of truth for triggerable +
conversion events.

Triggerable events (drive flows + campaigns):

- `player.signup`, `player.first_login`, `player.login`,
  `player.kyc.verified`, `player.purchase.completed`,
  `player.purchase.first`, `player.bonus.awarded`,
  `player.bonus.claimed`, `player.redemption.created`,
  `player.redemption.paid`, `player.big_win`, `player.tier.up`,
  `player.dormant.30d`, `player.dormant.90d`, … etc.

Conversion events (used for A/B winners + flow stats):

- `player.purchase.completed`, `player.redemption.paid`, custom.

Real-time events feed at `/admin/crm/events` streams these as they
fire (driven by Pusher).

---

## Templates

Three template kinds (each with their own table):

- `email_templates` — TipTap editor; supports Handlebars-style
  variable substitution (`{{firstName}}`, `{{balance.sc}}`).
- `sms_templates` — short text; variable substitution.
- `notification_templates` — in-app notifications.

`templates.ts` exposes the variable registry + rendering. The variable
preview at edit time (`preview.ts`) renders against a real sample
player.

---

## Dispatchers

`dispatchers.ts` is the channel abstraction:

```ts
dispatchEmail(ctx, input)
dispatchSms(ctx, input)
dispatchPush(ctx, input)
dispatchInApp(ctx, input)
```

Each dispatcher:

1. Resolves the template + variables → final payload.
2. Checks suppression for that channel for that player.
3. Calls the relevant adapter (`adapters.sendgrid.send`,
   `adapters.twilio.send`, etc.).
4. Logs to `crm_message_log`.
5. Honours the player's `crm_daily_max` (default 3) — no more than N
   marketing messages per day.

---

## Suppression list

`/admin/crm/suppression`

- Add (anyone `manager+` via `canManageSuppression`).
- Remove (master only via `canDeleteSuppression`).
- Auto-add on hard bounce, unsubscribe webhook, manual report.
- Per-channel granular: suppression can apply to email only, sms only,
  or all.

The suppression check is honoured by every dispatcher unless a
`manager+` actively overrides on a one-off compose (audited).

---

## Test-send-to-me

Every template editor has a "Test send to me" button that
dispatches a single message to the admin's verified email/SMS using
their own player attributes (or a configured sample). Implemented in
`test-send.ts`.

---

## Performance dashboards

`/admin/crm/performance`

- Per-campaign open / click / conversion rate.
- Per-channel send volume, deliverability, complaints.
- Suppression list growth.

Data sourced from `crm_message_log` aggregations.

---

## Message log (cross-channel)

`/admin/crm/message-log`

A unified log of every message dispatched in the last 30 days,
filterable by recipient, template, channel, status. Each row links to
the full delivery timeline.

> **Open performance note** (report §4.4): `getMessage(id)` does
> `WHERE id = ?` against the partitioned `crm_message_log` table
> without `created_at`, so Postgres can't prune partitions. Works
> fine today; will get slow with years of partitions. Pass
> `createdAt` through the URL (it's on every list row) and add it to
> the WHERE.

---

## Compliance moat

The CRM enforces three things even an operator can't override casually:

1. **Suppression** — suppressed recipients are skipped unless `manager+`
   explicitly checks "ignore suppression" on a one-off (audited).
2. **Daily max** — `players.crm_daily_max` caps how many marketing
   messages reach a player per day.
3. **Compliance-mandated sends** — KYC outcome emails, AML notices,
   redemption confirmations, account closures bypass suppression and
   daily max with explicit `compliance: true` flag (also audited).

---

## How to add a new attribute

1. Edit `packages/core/src/crm/attributes.ts` — add to the registry
   with the right SQL source.
2. If the SQL needs a new JOIN, ensure the compiler knows how to add
   it (see `compiler.ts`).
3. If the attribute needs hourly refresh, add it to
   `refresh-player-stats.ts`.
4. Hit `/api/admin/crm/attributes` — it should appear in the segment
   builder immediately.
5. Write a compiler test in `packages/core/src/crm/__tests__/`.

---

## What to read next

- `06-admin-platform.md` — the Email Center + Notification Center
  surfaces.
- `11-integrations.md` — SendGrid + Twilio adapters.
- `docs/11_crm.md` — the original architecture doc.
