# 04 · Database

## Stack at a glance

- **Engine**: PostgreSQL 15+, hosted on **Neon**.
- **ORM**: **Drizzle ORM** (`drizzle-orm` + `drizzle-kit`). No Prisma, no
  raw query strings outside of migrations.
- **Schema location**: `packages/db/src/schema/` — one file per domain
  area, all re-exported from `schema/index.ts`.
- **Migrations**: hand-written SQL in `packages/db/src/migrations/`
  (numbered `0000_*.sql` through `0025_*.sql`).
- **Runner**: `packages/db/src/migrate.ts` — custom, idempotent, records
  in `_app_migrations` table. Forward-only.

---

## Connection model

We use **two** connection URLs and they are not interchangeable:

| Env var               | Use                                            | Notes                                                                                                                                       |
| --------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`        | App reads/writes (pooled via Neon's pgbouncer) | Used by every runtime in `apps/web` and `apps/worker`.                                                                                      |
| `DATABASE_URL_DIRECT` | Migration runner (un-pooled)                   | Required because the migration runner uses session-level features (`SET LOCAL`, prepared statements with state) that pgbouncer can't proxy. |

`packages/db/src/client.ts` constructs a `postgres-js` client; Drizzle
wraps it. Sessions inside a transaction call `set_config('app.actor_*', …)`
so that RLS policies can see who's acting.

---

## Migration commands

```bash
# Apply all pending migrations against the URL in apps/web/.env.local
pnpm -F @coinfrenzy/db db:migrate

# Same, but without loading .env.local (CI path)
pnpm -F @coinfrenzy/db db:migrate:ci

# List what's pending without applying
pnpm -F @coinfrenzy/db db:migrate:status

# Generate a new migration from schema diff (drizzle-kit)
pnpm -F @coinfrenzy/db db:generate

# Open Drizzle Studio
pnpm -F @coinfrenzy/db db:studio
```

Production migrations run via the **`.github/workflows/db-migrate.yml`**
manual workflow. Default is dry-run on (`inputs.dry_run = true`); flip
to false and re-run to apply.

---

## Migration history (chronological)

```
0000_init.sql                          Core tables, enums, base structures
0001_partitions.sql                    Range-partition ledger_entries, player_events, game_rounds by created_at
0002_seed.sql                          Bootstrap: house accounts, default tier ladder, etc.
0003_triggers_rules.sql                Immutability triggers for ledger + audit log; integrity rules
0004_cross_fks.sql                     FKs that span tables introduced in non-trivial order
0005_rls.sql                           RLS policies for every sensitive table
0006_better_auth.sql                   Better Auth tables (users, sessions, accounts, verification)
0007_two_factor.sql                    Admin TOTP secrets + backup codes
0008_bonus_seed.sql                    Default bonus templates
0009_crm_seed.sql                      Default CRM segments + suppression list seeds
0010_vip_hosts.sql                     VIP/Host tables + assigned_host_id FK on players
0011_daily_bonus_and_pending_claims.sql  Daily bonus drip + pending bonus claim flow
0012_casino_sub_categories.sql         casino_sub_categories + casino_sub_category_games
0013_repair_subcat_backfill.sql        Backfill subcategories from legacy JSONB
0014_redemption_rules.sql              redemption_rules table (auto-approve / hold engine)
0015_packages_overhaul.sql             Featured slot, bonus_sc_playthrough_multiplier, banner fields
0016_cms_pages_seed.sql                Seed Terms/Privacy/Cookies/Sweeps/RG/Bonus/Jackpot pages
0017_system_config.sql                 system_config key/value table (tier caps, ops-tunable knobs)
0018_message_body_storage.sql          Email body storage upgrade
0019_blocked_domains_seed.sql          Default blocked email domains
0020_settings_seed.sql                 Default operator settings
0021_migration_pipeline.sql            Gamma migration pipeline tables
0022_migration_column_mappings.sql     Column mapping registry for migration source files
0023_alea_reconciliation_findings.sql  Alea reconciliation results table
0024_admin_must_reset.sql              admins.must_reset_password flag
0025_terms_versions.sql                terms_versions table for versioned legal docs
```

All migrations are written to be **idempotent** (`IF NOT EXISTS`,
`ON CONFLICT DO NOTHING`, or guarded with `WHERE NOT EXISTS`) so re-running
the runner is safe.

---

## Key tables (the ones you'll touch most)

### Players & wallets

- `players` — one row per player. PII (`first_name`, `last_name`,
  `date_of_birth`, `address_*`) lives here. Soft delete via
  `deleted_at`. Status enum: `active`, `suspended`, `closed`,
  `self_excluded`, …
- `wallets` — one row per (player × currency). Currency is `'GC'` or
  `'SC'`. **Has a CHECK constraint** that `current_balance =
balance_purchased + balance_bonus + balance_promo + balance_earned`.
  If the assertion fails, the ledger write rolls back.
- `auth_users`, `auth_sessions`, `auth_accounts`, `auth_verifications`
  — Better Auth tables (introduced in `0006_better_auth.sql`).

### Money engine

- `ledger_entries` — partitioned by `created_at` (monthly range).
  Immutable (a trigger rejects `UPDATE`/`DELETE`). Each row has
  `(source, source_id)` which is `UNIQUE` per leg to enforce
  idempotency.
- `house_accounts` — one row per (kind × currency). Counterparty to
  every player wallet movement.
- `admin_adjustments` — when a manager grants SC manually, this is the
  reason row (linked to ledger entry by `source_id`).

### Bonus + playthrough

- `bonuses` — bonus templates (purchase, player_gift,
  promo_code_signup, promo_code_free).
- `bonuses_awarded` — per-player instances of a bonus, with
  `playthrough_required` and `playthrough_progress`.
- `daily_bonus_drips` — daily login bonus state.
- `pending_bonus_claims` — manual awards waiting for the player to
  claim.

### Promo codes

- `promo_codes` — active + archived codes.
- `blocked_promo_codes` — codes blacklisted from use.

### Casino + games

- `games` — game catalog (per provider).
- `game_providers` — Alea sub-providers.
- `game_aggregators` — top-level aggregators (Alea is one).
- `casino_categories` — slot category buckets.
- `casino_sub_categories` + `casino_sub_category_games` — operator-
  reorderable lobby rails.
- `game_sessions` — open Alea sessions.
- `game_rounds` — partitioned per-round detail.

### Redemption + KYC

- `redemptions` — state machine (pending → review → approved → submitted → paid).
- `redemption_rules` — auto-approve / hold thresholds.
- `payment_instruments` — saved cards/banks per player.
- `kyc_status` — Footprint integration state per player.
- `compliance_flags` — AML, RG, self-exclusion triggers.

### Admin + audit

- `admins` — admin user rows. `role` is the role slug; `totp_secret`,
  `must_reset_password` are flags. `admin_sessions` tracks open
  sessions for revocation.
- `audit_log` — every admin mutation. Append-only (trigger rejects
  `UPDATE`/`DELETE`).
- `integration_health` — per-vendor request/error/latency counters
  that drive the Integrity page.
- `pending_webhooks` — every webhook receipt, idempotent on `event_id`.

### CRM

- `crm_segments` — saved segments (filter trees serialised as JSONB).
- `crm_campaigns` — campaign rows + AB groups.
- `crm_flows`, `crm_flow_steps`, `crm_flow_enrollments` — visual flow
  designer state.
- `crm_message_log` — partitioned by created_at; one row per message
  dispatch. See report `2026-05-19 §4.4` for the partition-pruning
  note (`getMessage` should pass `createdAt`).
- `crm_suppression_list` — opt-outs and bounces (compliance-hard).
- `email_templates`, `sms_templates`, `notification_templates`.
- `player_events` — partitioned event stream that drives flows.
- `player_attributes_cache` — denormalised attribute store (refreshed
  by the worker) so segment compiler can JOIN once.

### VIP + Host

- `host_player_interactions` — log of every host↔player message,
  bonus award, note. **RLS-protected** so hosts can only see their own.
- VIP fields live on `players` (`vip_status`, `vip_qualified_at`,
  `assigned_host_id`, `host_assigned_at`).

### CMS + legal

- `site_content` — generic JSONB content store (CMS pages are stored
  here with `value_json.kind = 'page'`).
- `terms_versions` — versioned Terms / Privacy / etc.
- `banners` — player promotional banners.

### Reporting + exports

- `daily_operational_snapshots` — the Layer-3 rollup table that drives
  the dashboard.
- `report_subscriptions` — scheduled report cadence.
- `data_exports` — Export Center jobs.
- `download_links` — signed R2 URLs with expiry.

### Migration (from Gamma)

- `migration_runs` + `migration_records` + `migration_column_mappings`
  - `migration_player_id_map` — the full pipeline state.

---

## RLS (Row Level Security) model

RLS is **enabled by default** on every sensitive table. The pattern
(per `docs/09 §4`):

1. Each transaction sets three session vars via `set_config`:
   - `app.actor_id` (player id, admin id, or `system:<service>`).
   - `app.actor_kind` (`player`, `admin`, `system`).
   - `app.actor_role` (admin role slug, or null).
2. Policies are written against those settings. E.g. for
   `host_player_interactions`:

   ```sql
   create policy host_self_only on host_player_interactions
     for all
     using (
       current_setting('app.actor_role', true) = 'host'
       and host_admin_id = current_setting('app.actor_id', true)::uuid
     );
   ```

3. The bypass role (`postgres` or the migration role) is used by
   `migrate.ts` and the seed scripts. Runtime roles never bypass RLS.

`packages/core/src/ledger/write.ts` (and every other writer in `core`)
sets these settings as the first three statements inside the
transaction. The pattern is mandatory; without it RLS denies the
write.

---

## Idempotency

| Domain       | Key                                      |
| ------------ | ---------------------------------------- |
| Ledger       | `(source, source_id)` unique per leg     |
| Webhooks     | `event_id` unique on `pending_webhooks`  |
| Inngest jobs | Deterministic event id where it matters  |
| Bonus award  | `(player_id, bonus_id, idempotency_key)` |
| CRM dispatch | `(campaign_id, player_id)` per send      |

If you're writing a new mutation, ask: "what's the natural idempotency
key here?" before designing the table. Retries should always be safe.

---

## Money precision

- **Database column type**: `numeric(20, 4)`. We use a shared `money()`
  helper in `_shared.ts` to declare these columns.
- **App layer**: `bigint`. Minor units (1 USD = 10,000; 1 SC = 10,000;
  1 GC = 10,000). All arithmetic done in `bigint`.
- **NEVER `number` / `float` / `Decimal.js`**. Wrong precision class
  for financial work; subtle drift the property tests will catch
  eventually but the user will catch first.
- Conversion helpers live in `packages/core/src/ledger/money.ts`:
  `bigintToNumericString`, `numericStringToBigint`, `toBigintAmount`,
  `formatMoney`.

---

## Partitioned tables

Three tables are range-partitioned by `created_at` (declarative
partitioning, monthly partitions):

| Table             | Reason                                                       |
| ----------------- | ------------------------------------------------------------ |
| `ledger_entries`  | High insert rate, hot-read window is recent.                 |
| `player_events`   | CRM event stream, very high volume.                          |
| `game_rounds`     | One row per Alea round, also very high volume.               |
| `crm_message_log` | One row per dispatched message; partitioned by `created_at`. |

Partitions are pre-created for the next 12 months by the
`reconcile-wallets` job's monthly variant. If you ever see "no
partition for relation X" — that's the cron that hasn't fired; create
the partition manually (`CREATE TABLE ... PARTITION OF ...`).

Important: when querying these tables, **always include `created_at`
in the WHERE clause** so the planner can prune partitions. The
`crm.getMessage(id)` function currently does not — see
`reports/2026-05-19_admin_backoffice_pass.md` §4.4 for the fix.

---

## Seed scripts

```bash
pnpm -F @coinfrenzy/db db:seed-admin             # one master admin from env
pnpm -F @coinfrenzy/db seed:fake                 # ~20 fake players
pnpm -F @coinfrenzy/db seed:realistic            # ~200 players, 30 days of activity
pnpm -F @coinfrenzy/db seed:realistic:wipe       # nuke + reseed
pnpm -F @coinfrenzy/db seed:realistic:reconcile  # rebuild snapshots after seed
pnpm -F @coinfrenzy/db db:verify                 # schema lint (indexes, RLS)
pnpm -F @coinfrenzy/db db:smoketest              # quick "tables exist" check
```

The realistic seed is what the dashboard expects; if you run the fake
seed only, the dashboard will look empty until you add transactions.

---

## How to add a new table (safe path)

1. Update `docs/03_data_model_v3.md` first (the doc is the spec).
2. Create or modify a file in `packages/db/src/schema/`.
3. Add it to `schema/index.ts` re-exports.
4. Run `pnpm -F @coinfrenzy/db db:generate` to scaffold an SQL migration.
5. Edit the generated SQL to:
   - Add RLS policies (`alter table … enable row level security; create policy …`).
   - Set up any indexes the new table needs.
   - Make it idempotent (`IF NOT EXISTS`).
6. If the table is sensitive (audit, redemption, money), wire an
   immutability trigger.
7. Run `pnpm -F @coinfrenzy/db db:migrate` locally.
8. Add tests in `packages/core/src/<domain>/__tests__/` for any new
   writer.

The `.cursorrules` mandates step 1 (doc before schema). Please keep
that habit.

---

## What to read next

- `10-ledger-and-money.md` — what the ledger actually does.
- `15-security-and-compliance.md` — RLS in practice + audit log.
- `architecture-diagrams/data-model.md` — visual ERD.
