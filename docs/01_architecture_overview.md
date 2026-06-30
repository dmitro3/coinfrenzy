# CoinFrenzy Platform Rebuild — Architecture Overview

**Document:** 01 of 13 — Top-Level Architecture
**Status:** Draft v2 — CM-approved direction, ready to build against
**Scope:** Full user-facing casino + admin backoffice + in-house CRM. Replaces Gamma.
**Migration:** Cold cutover. Tested import pipeline mandatory before Gamma notice.
**Quality bar:** Stake / Chumba / SpinQuest tier and better.

---

## 1. Read this first

This document is the system map. Every other doc in the set (02 through
13) conforms to the decisions made here. If a deep-dive proposes a pattern
that contradicts this overview, this overview wins until explicitly updated.

Three north stars govern every decision below:

1. **Tank-grade internals.** Five million signups, tens of thousands of
   concurrent players, every coin movement auditable to the millisecond.
   Performance budgets are explicit and enforced.

2. **Clean, opinionated admin.** Frenzy Creator's dashboard and card UX,
   applied at Gamma's scope. All the data, sorted by what actually
   matters, not a wall of equal-weight tiles.

3. **In-house CRM as a first-class system.** Replace Optimove. Segment
   players on any dimension (game, wager, deposit, recency, tier,
   geography), fire campaigns through SendGrid / Twilio, build automated
   flows. Eliminates a $60K+/year cost and gives us a competitive moat.

The architecture is grounded in three sources:

1. **Frenzy Creator codebase audit.** What you already built is a strong
   pattern library — HMAC sessions, RLS lockdown, the field-alias
   resolver in `ngrSchema.js`, the single-source-of-truth ledger module.
   We reuse the patterns. We do not reuse the deployment shape (inline
   JS in static HTML doesn't scale to the casino).

2. **Gamma admin walkthrough.** Twenty-one top-level sections. Their
   information architecture is the floor; we match it and improve every
   page's density, sortability, and visual hierarchy.

3. **Existing integration surface.** Alea (game launcher + RGS), Finix
   (payments, including Apple Pay), Footprint (KYC), Radar (geo),
   SendGrid (email), Twilio (SMS, when added), Intercom (support),
   Iconic 21 (live dealer, ship-ready, activate later).

---

## 2. Recommended stack — locked

| Layer            | Choice                                              | Why                                                                                                                  |
| ---------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Frontend         | Next.js 15 (App Router) + TypeScript strict         | SEO, server components, edge-friendly. One language across the stack means Cursor stays effective.                  |
| UI               | Tailwind + shadcn/ui + Radix primitives             | Fast, themeable, matches what Cursor generates well. Custom components only where shadcn falls short.               |
| Backend          | Next.js API routes (player API) + dedicated Node worker (Fly.io) | Co-located web logic, but webhook + reconciliation + CRM workers move to a long-lived process.                       |
| Database         | **Neon Postgres** (primary) + Redis (Upstash)       | Pure Postgres, point-in-time recovery, preview branching. Redis for sessions, rate limits, hot wallet cache.        |
| ORM              | Drizzle                                             | Type-safe, sane migrations, doesn't fight Postgres. We control the schema in plain SQL when needed.                |
| Auth (players)   | Better Auth on top of Postgres                      | Email/password + magic link + TOTP 2FA. Industry-standard. No vendor lock-in.                                       |
| Auth (staff)     | HMAC session pattern from Frenzy Creator + 2FA mandatory + revocable | Hardened version of `api/_lib/adminAuth.js`. Sessions table for revoke-on-demand.                    |
| Queue / Cron     | **Inngest**                                          | Webhook retries, cron, CRM campaign delivery, scheduled bonuses. Excellent observability, typed events.            |
| Real-time        | Supabase Realtime (used as a thin pub/sub, not a DB) OR Pusher | Player wallet updates, admin live counters, support presence. Pick after a spike in Doc 10.                |
| Object store     | Cloudflare R2                                        | Banner images, KYC documents (encrypted at rest), CRM exports. R2 = no egress fees, S3-compatible.                 |
| Hosting          | Vercel (web) + Fly.io (worker) + Neon (DB)           | Vercel handles the user-facing site. Fly.io runs the persistent worker. Neon hosts the database with branching.   |
| Observability    | Sentry (errors) + Axiom (logs) + Grafana Cloud (metrics) | Sentry for crashes. Axiom for queryable structured logs (required for any ledger dispute). Grafana for SLOs.   |
| Secrets          | Doppler                                              | Three environments × 50+ secrets. Doppler from day one, not later.                                                  |
| Email            | SendGrid                                             | Transactional + CRM campaigns. Already in use.                                                                       |
| SMS              | Twilio                                               | CRM SMS campaigns + 2FA backup. Add when first SMS campaign ships.                                                  |

**Frenzy Creator stays on its current Supabase + Vercel deployment.** No
changes there until casino v1 is stable and we plan a v1.1 absorption.

---

## 3. System topology

```
                              ┌────────────────────────────────────────┐
                              │              Public Internet           │
                              └────────────────────────────────────────┘
                                                │
            ┌───────────────────────────────────┼───────────────────────────────────┐
            │                                   │                                   │
            ▼                                   ▼                                   ▼
     ┌─────────────┐                    ┌───────────────┐                    ┌─────────────┐
     │  Players /  │                    │  Admin /      │                    │  3rd-party  │
     │  marketing  │                    │  Staff        │                    │  webhooks   │
     │ coinfrenzy  │                    │  admin.       │                    │  Alea       │
     │   .com      │                    │  coinfrenzy   │                    │  Finix      │
     │             │                    │   .com        │                    │  Footprint  │
     │             │                    │               │                    │  Radar      │
     └──────┬──────┘                    └───────┬───────┘                    └──────┬──────┘
            │ HTTPS                             │ HTTPS                             │ HTTPS
            │                                   │ HMAC session                      │ HMAC signature
            ▼                                   ▼                                   ▼
   ┌────────────────────────────────────────────────────────────────────────────────────────┐
   │                            Vercel — Next.js 15 (App Router)                            │
   │                                                                                        │
   │  ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────────────────────┐   │
   │  │  Player surface  │   │  Admin surface   │   │  Webhook receivers               │   │
   │  │  /(player)/...   │   │  /(admin)/...    │   │  /api/webhooks/{alea,finix,...}  │   │
   │  └──────────────────┘   └──────────────────┘   └──────────────────────────────────┘   │
   │             │                    │                            │                       │
   │             └────────────────────┴────────────────────────────┘                       │
   │                                  │                                                    │
   │                                  ▼                                                    │
   │  ┌──────────────────────────────────────────────────────────────────────────────┐    │
   │  │  CORE SERVICE LAYER  (packages/core — typed, shared)                         │    │
   │  │                                                                              │    │
   │  │  ledger · wallet · bonuses · playthrough · redemptions · purchases           │    │
   │  │  kyc · geo · games · packages · tiers · promo · affiliate                    │    │
   │  │  crm-events · crm-segments · crm-campaigns · audit · notifications           │    │
   │  │                                                                              │    │
   │  │  Every surface calls into this layer. Logic never duplicated.                │    │
   │  └──────────────────────────────────────────────────────────────────────────────┘    │
   │                                  │                                                    │
   └──────────────────────────────────┼────────────────────────────────────────────────────┘
                                      │
        ┌─────────────────────────────┼──────────────────────────────┐
        ▼                             ▼                              ▼
  ┌───────────────┐           ┌──────────────┐              ┌─────────────────┐
  │ Neon Postgres │           │   Inngest    │              │  Cloudflare R2  │
  │  (primary)    │           │  (queue+cron)│              │  (object store) │
  │               │           │              │              │                 │
  │ + Redis       │           │  webhook     │              │  banners        │
  │  (Upstash)    │           │  retries     │              │  KYC docs       │
  │  hot cache,   │           │  reconcile   │              │  exports        │
  │  rate limits, │           │  CRM batches │              │  game thumbs    │
  │  sessions     │           │  scheduled   │              │                 │
  │               │           │  bonuses     │              │                 │
  └───────┬───────┘           └──────┬───────┘              └─────────────────┘
          │                          │
          │                          ▼
          │               ┌────────────────────────────────────────────┐
          │               │  Worker (Fly.io)                           │
          │               │                                            │
          │               │  • nightly Alea ↔ ledger reconciliation    │
          │               │  • daily Gamma snapshot ingest             │
          │               │    (during migration only)                 │
          │               │  • scheduled bonus + campaign delivery     │
          │               │  • CRM segment materialization (hourly)    │
          │               │  • report snapshots (hourly + daily)       │
          │               │  • Alea outcome reconciliation             │
          │               └────────────────────────────────────────────┘
          │
          ▼
  ┌─────────────────────────────────────────────────────────────┐
  │  Observability                                              │
  │  Sentry (errors)  Axiom (logs)  Grafana Cloud (metrics)     │
  │  PagerDuty for SEV-1 (ledger drift, KYC outage, etc.)       │
  └─────────────────────────────────────────────────────────────┘
```

**One unbreakable rule:** all business logic lives in `packages/core`. The
webhook receivers, the admin UI mutations, the player API endpoints, the
worker jobs, the cron scripts — they all call the *same* `ledger.credit()`,
`wallet.move()`, `bonus.release()`, `crm.fireEvent()`. If a function is
called from two surfaces, it lives in core. Frenzy Creator's
`api/_lib/ledger.js` already understands this principle. We extend it to
the whole platform.

---

## 4. Top-level data model (~30 tables)

Full schema lives in Doc 03. The shape:

```
players ────┬── player_auth (1:1)        ← Better Auth tables
            ├── wallets (1:2: GC + SC)
            ├── kyc_status (1:1)
            ├── compliance_flags (1:N)   ← RG limits, exclusions
            ├── sessions (1:N)           ← Redis-backed, mirror in PG
            ├── geo_history (1:N)        ← every login location
            ├── game_sessions (1:N) ─────── game_rounds (1:N) ──┐
            ├── purchases (1:N) ──────────────────────────────────┼──→ ledger_entries
            ├── redemptions (1:N) ────────────────────────────────┘
            ├── bonuses_awarded (1:N) ── playthrough_progress (1:1)
            ├── tier_progress (1:1) ─── tier_history (1:N)
            ├── promo_redemptions (1:N)
            ├── affiliate_attribution (0:1) ← which affiliate referred them
            └── player_events (1:N) ←─── partitioned by month, drives CRM

ledger_entries  ← the immutable, double-entry transaction log.
                  Partitioned by month. Every coin movement
                  (bet, win, deposit, redemption, bonus, playthrough
                  release, admin adjustment) is two entries:
                  debit one account, credit another.
                  Source of truth for every balance, every report.

player_events   ← every meaningful player action emits one row.
                  Partitioned by month. Drives the in-house CRM.
                  Indexed for fast segment queries.

games ─── game_providers ─── aggregators (Alea, Iconic 21)
packages ─ package_bonuses
tiers ─── tier_benefits ─── tier_bonus_schedule

affiliates ─┬── affiliate_codes (1:N)
            ├── attributed_players (1:N)
            └── payouts (1:N)

promo_codes ─── promo_redemptions

admins ────┬── admin_sessions (revocable)
           ├── admin_roles ─── admin_permissions
           └── audit_log (every admin action, append-only)

site_content       ← CMS blocks (landing, terms, etc.)
banners            ← banner management
email_templates    ← Email Center
sms_templates      ← SMS templates
notifications      ← in-app notification center

crm_segments       ← saved segment definitions
crm_campaigns      ← scheduled / sent campaigns
crm_flows          ← automated flows (welcome series, etc.)
crm_flow_enrollments  ← who's in which flow, what step
crm_message_log    ← every email/SMS sent, for compliance

blocked_emails, blocked_domains, blocked_ips, blocked_promo_codes
                   ← from gamma's domain/promo blocking

integration_health ← row per provider, updated on each call,
                     drives admin Integrity tab

migration_imports  ← Gamma snapshot ingest tracking (migration only)
```

**Three tables that must scale to billions of rows:**

- `ledger_entries` — partitioned monthly, archived to cold storage after 13 months (kept queryable, just slower).
- `game_rounds` — partitioned monthly, same archive policy.
- `player_events` — partitioned monthly, archived after 25 months (CRM needs 2-year lookbacks for cohort analysis).

Partitioning strategy is in Doc 03. The point: at 5M users × 200 rounds
per active player per day, we're at ~100B rows in 5 years on game_rounds
alone. Partitioning is not optional.

**Three materialized rollups for CRM speed:**

- `player_lifetime_stats` — refreshed hourly per active player, refreshed nightly for everyone. One row per player: total wagered, total deposited, total redeemed, games played, last seen, etc.
- `player_30d_stats` — same shape, last 30 days, refreshed hourly.
- `player_game_stats` — one row per (player, game), refreshed hourly. Drives the "everyone who played Roulette last 7 days and wagered $250+" query you want.

These rollups make CRM segment queries return in milliseconds even at 5M
players. Without them, every segment query scans `player_events` and
times out.

---

## 5. CRM as a first-class system

Standalone section because this is half of why we're rebuilding.

**The data flow:**

```
player action (bet, deposit, login, etc.)
     │
     ▼
core/crm-events.emit({ type, player_id, payload })
     │
     ▼
INSERT into player_events  ────────────────────────────────────┐
     │                                                         │
     ▼                                                         │
Inngest event fired ── triggers any flow enrollments           │
                                                               │
                                                               ▼
                                          hourly worker refreshes
                                          player_lifetime_stats,
                                          player_30d_stats,
                                          player_game_stats
```

**Segment builder UI** (Admin → CRM → Segments):

A visual filter composer that lets you stack conditions:
- Played game = Roulette
- AND in last 7 days
- AND wagered ≥ $250
- AND tier ≤ Gold
- AND has email = true
- AND no email sent in last 3 days

Each condition compiles to SQL against the rollup tables. Results are
visible immediately ("8,432 players match"). Save the segment, name it
("Roulette mid-rollers — 7d"), reuse it in campaigns or flows.

**Campaign engine** (Admin → CRM → Campaigns):

Pick a segment, pick a template (email or SMS), pick a send time (now,
scheduled, or recurring), preview, send. Worker batches the actual send
through SendGrid / Twilio, writes every send to `crm_message_log` for
compliance and analytics.

**Automated flows** (Admin → CRM → Flows):

State-machine flows triggered by events:
- "Welcome series" — triggered on player signup → 5 emails over 14 days
- "Lapsed player reactivation" — triggered when player_30d_stats says no login in 14d → SMS + email + bonus
- "First deposit nudge" — triggered on signup → if no deposit in 48h, email
- "Big win celebration" — triggered when single win > $500 → email + push

Flows are just data — rows in `crm_flows` and `crm_flow_steps`. Built in
the admin UI. No code deploy to launch a new flow.

**This replaces Optimove. Saves $60K/year. And it's queryable from one
place.**

Full CRM spec in Doc 11.

---

## 6. Integration map

| External system | Direction              | Protocol           | Failure mode + mitigation                                                          |
| --------------- | ---------------------- | ------------------ | ----------------------------------------------------------------------------------- |
| Alea            | bidirectional          | REST + webhooks    | Outcomes drop → ledger drifts. Nightly reconciliation + alert if drift > $0.01.    |
| Finix           | bidirectional          | REST + webhooks    | Webhook drop → purchase stuck. Idempotent retry queue + 3DS liability shift.        |
| Footprint       | bidirectional          | REST + webhooks    | Status webhook drop → player can't redeem. Polling fallback every 5 min for pending.|
| Radar           | outbound + webhooks    | REST               | Query fails → deny by default for affected action. Cache last-known location 15min.|
| SendGrid        | outbound               | REST + webhooks    | Retry 3× via Inngest. Bounce/complaint webhooks write back to player record.       |
| Twilio          | outbound + inbound     | REST + webhooks    | Same pattern as SendGrid. Inbound SMS triggers `STOP` compliance flow.             |
| Intercom        | outbound + JS widget   | REST + JS          | Widget loss = degraded support. Identify calls retried.                            |
| Iconic 21       | bidirectional (later)  | REST + webhooks    | Treated identically to Alea once live. Adapter pattern ready from day one.         |

Every external system gets:
- A dedicated adapter in `packages/core/adapters/{provider}/`.
- A dedicated webhook endpoint at `/api/webhooks/{provider}` with HMAC signature verification + replay protection (5-minute timestamp window).
- An Inngest function for retried outbound calls.
- A row in `integration_health` updated on every call (success or failure).
- A dedicated deep-dive doc (Doc 05).

---

## 7. Security model

Five trust zones:

1. **Public.** Marketing, login, signup. No DB access. Aggressively rate-limited.
2. **Player (authenticated).** Better Auth session. Reads/writes only their own data, enforced by RLS policies that check `auth.user_id()` against `players.id` on every row.
3. **Staff (scoped admin).** HMAC session + mandatory TOTP 2FA. Per-role permissions:
   - **Support** — read players, read tickets, write notes, no financial actions
   - **KYC reviewer** — read Footprint queue, approve/reject KYC, write notes
   - **Cashier** — read redemption queue, approve/reject redemptions (≤ daily limit), write notes
   - **Marketing** — full CRM (segments, campaigns, flows), read player data
   - **Game ops** — manage games/providers/packages/tiers/bonuses/banners
   - **Reports** — read-only across everything
4. **Manager (combined scopes).** All of the above + can override cashier daily limits + can approve/deny large redemptions.
5. **Master admin.** Everything + admin coin adjustments + staff management + secrets visibility + export center. You and a small handful.
6. **System (service role).** Webhooks, worker, cron. Bypasses RLS. HMAC-authenticated from third parties + service-role DB key.

**Every staff/admin action writes to `audit_log`.** Append-only,
protected by a RULE that rejects UPDATE and DELETE. This is what saves
you in any state regulator conversation.

**Session model:** HMAC tokens stay (proven pattern from Frenzy Creator),
but with three upgrades:
1. Sessions stored in `admin_sessions` table so we can revoke on demand
2. `ADMIN_SESSION_SECRET` rotated quarterly with 7-day overlap
3. IP address bound to session — if IP changes, force re-auth (toggleable per role for traveling execs)

**RLS deny-by-default everywhere.** Frenzy Creator's
`20260322020000_rls_lockdown.sql` is the template — every table starts
with `for all to public using (false)` and we explicitly open paths.

Full security + compliance spec in Doc 09.

---

## 8. Performance budgets (the "tank" requirement)

| Operation                                | Target (p99) | Why                                                          |
| ---------------------------------------- | ------------ | ------------------------------------------------------------ |
| Player wallet balance read               | < 10ms       | Shown on every page load. Cached in Redis, invalidated on each ledger entry. |
| Ledger entry write (single transaction)  | < 50ms       | Hot path — every bet writes one. At 10k concurrent players × 1 bet/3s = 3k writes/s. |
| Game launch (token issue → Alea redirect)| < 300ms      | Anything slower and players bounce.                          |
| Webhook receipt → response               | < 200ms      | Alea retries aggressively if we're slow.                     |
| Webhook processing (async)               | < 5s p99     | After receipt, full processing in queue.                     |
| Player login (auth + session)            | < 500ms      | First impression.                                            |
| Admin player search (by email/username/ID)| < 200ms     | Support drowns if search is slow.                            |
| CRM segment count ("how many match?")    | < 1s         | Drives interactive segment builder.                          |
| CRM segment fetch (full list)            | < 5s for 100k matches | Acceptable for sends; uses streaming pagination.    |
| Daily Alea ↔ ledger reconciliation       | < 30 min     | Must finish before 7am ET so we have time to fix drift.      |
| Hourly CRM rollup refresh                | < 10 min     | So segments stay current.                                    |

These are budgets, not aspirations. Doc 04 specifies how the ledger
achieves its number (Postgres `INSERT` + Redis write-through cache + a
denormalized `wallets.current_balance` column updated in the same
transaction as the ledger entry, both inside a SERIALIZABLE transaction).

---

## 9. Deployment topology

Three environments, three databases, three sets of secrets. Never share.

- **Production:** `coinfrenzy.com` + `admin.coinfrenzy.com`. Vercel deploy, Fly.io worker, Neon prod branch.
- **Staging:** `staging.coinfrenzy.com` + `admin.staging.coinfrenzy.com`. Vercel deploy, Fly.io worker (smaller), Neon staging branch (free per-PR branching). All third-parties on sandbox credentials.
- **Dev:** Local Next.js + Docker Postgres + Neon dev branch optional. Webhooks via ngrok.

**Deploy pipeline:** GitHub → Vercel preview per PR (with a Neon branch) → merge to `main` deploys to staging automatically → manual promote to production after smoke test passes. No auto-promote to prod, ever.

**Database migrations** run via Drizzle migrate during deploy. Every
migration is forward-only + reversible. We test every migration on a
prod-data clone before staging deploy.

---

## 10. Migration plan — cold cutover with contingency

This section is hard requirements, not options. Pulled forward from
Doc 13 because the migration shape constrains the whole build.

**Pre-notice phase (we control, Gamma doesn't know):**

1. **Build the import pipeline as a P0 deliverable in week 2** — same urgency as the ledger. Not week 11. The import pipeline is a worker job that ingests Gamma's database export format (we'll need to inspect Gamma's data exports first — get one this week if possible) and writes to our schema. Idempotent. Resumable. Logs every row.

2. **Get daily Gamma snapshots starting now.** Whatever Gamma's export mechanism is — admin export, DB dump, API scrape — start pulling daily snapshots into our R2 bucket starting before any rebuild work. We need historical data flow established and tested before notice.

3. **Run the import pipeline on staging weekly** starting week 3. Every week, take that day's Gamma snapshot, ingest it into staging Neon, verify totals match (player counts, wallet totals, GGR for last 30 days). Fix divergences immediately. By week 8 we should have done this 5+ times with zero drift.

4. **Build the cutover script in week 9-10.** A single ordered runbook: pause Gamma writes (talk to them in advance about a maintenance window OR force it via DNS change), pull final snapshot, ingest, verify, flip DNS, smoke test, open to users. Practice 3+ times on staging with full data.

**Notice phase (we tell Gamma):**

5. **Before giving notice, have everything in step 4 working end-to-end on staging with the latest Gamma snapshot.** If we give notice and Gamma stops cooperating (cuts off exports, stops API access, deletes data), we still have last night's full snapshot already in R2 and a tested import pipeline. Worst case: we lose at most 24 hours of player activity, which we replay from our own webhook logs (Alea, Finix, Footprint webhooks come direct to us during overlap if we set them up that way — see step 6).

6. **30 days before cutover, switch third-party webhook destinations.** Alea, Finix, Footprint, Radar webhooks start firing to both Gamma AND CoinFrenzy. We don't act on them yet, but we capture them. This is our insurance against Gamma going dark.

7. **Cutover night:** Final Gamma snapshot → import → verify → DNS flip → open. Estimated 4-6 hour maintenance window. Communicated to players 2 weeks in advance.

**The contingency runbook (Gamma goes hostile):**

- If Gamma cuts off cooperation at any point after notice, we trigger Plan B immediately:
  - Last night's snapshot becomes the import base
  - 24 hours of webhook captures fill the gap
  - We forfeit any Gamma data we don't have a snapshot of (which should be near-zero if we've been pulling daily)
  - Cutover happens within 72 hours of going hostile, not the scheduled window

The whole point: **we are never in a position where Gamma's cooperation
is required for cutover to succeed.**

Full migration spec in Doc 13.

---

## 11. Build phases — the thirteen docs

| Doc | Title                                      | Priority | Build weeks |
| --- | ------------------------------------------ | -------- | ----------- |
| 01  | Architecture Overview (this doc)           | P0       | Done        |
| 02  | Core Service Layer + folder structure       | P0      | 1            |
| 03  | Data Model (full schema)                   | P0       | 1            |
| 04  | Ledger & Wallet (deepest spec)             | P0       | 2-3          |
| 05  | Webhook Architecture (Alea, Finix, Footprint, Radar) | P0 | 3-4 |
| 06  | Bonus Engine & Playthrough                 | P0       | 4-5          |
| 07  | Redemption Flow & KYC Gating               | P0       | 5            |
| 08  | Admin Panel — page-by-page                  | P1      | 5-7          |
| 09  | Security, Compliance & Audit               | P0       | continuous   |
| 10  | Frontend Architecture (player + admin)     | P1       | 6-8          |
| 11  | CRM — events, segments, campaigns, flows   | P1       | 7-9          |
| 12  | Reporting, Dashboards & Exports            | P2       | 9-10         |
| 13  | Migration from Gamma (cold cutover plan)    | P0      | 2 (build), 9-10 (execute) |

Total: 10-12 weeks to migration-ready. Migration import pipeline built
in week 2 alongside the ledger because they share the same schema.

---

## 12. Open items (post-Doc-03)

These don't block the next two docs but flag now for tracking:

1. **Cursor workspace structure** — Doc 02 will specify a monorepo with `apps/web`, `apps/worker`, `packages/core`, `packages/db`, `packages/ui`. Single repo, multiple packages, pnpm workspaces.
2. **Real-time picker** — Supabase Realtime vs Pusher vs Ably. Spike in Doc 10.
3. **Better Auth vs Clerk** — Better Auth recommended (self-hosted, no vendor lock-in, fits Neon). Clerk is fast to ship but charges per MAU at scale. Defer final pick until Doc 09.
4. **Game RNG audit** — Alea handles RNG for catalog games. For any CoinFrenzy Originals games, we either license a certified RNG (e.g. Iovation, GLI-certified) or use Alea's RNG-as-a-service. Doc 06 calls this out.
5. **State-by-state geo logic** — Radar handles detection. We codify the 10 blocked states + any per-state restrictions (e.g. Washington state's stricter sweepstakes rules) in `packages/core/compliance/jurisdictions.ts`.
