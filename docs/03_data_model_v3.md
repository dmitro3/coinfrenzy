# CoinFrenzy Platform — Data Model (v3)

**Document:** 03 of 13 — v3, self-contained (supersedes v2 which was a patch doc)
**Reads:** Doc 01 (Architecture), Doc 02 (Core Service Layer)
**Read before:** Doc 04 (Ledger), Doc 05 (Webhooks), Doc 06-13
**Purpose:** Complete database schema. Every table fully defined. Drizzle/PostgreSQL DDL. This document is fully self-contained — it does not reference any earlier version.

---

## 0. Reading guide

The schema is presented following the migration order (§17). Each table has:

- Full DDL with all columns, types, constraints, indexes
- RLS policy pattern reference (§16)
- Any partitioning specifics
- Notes on Drizzle implementation

For background on WHY the schema looks this way, see the relevant domain doc (Doc 04 for ledger, Doc 06 for bonuses, Doc 11 for CRM, etc.).

---

## 1. Conventions

**Identifiers.** Every table has `id` as `uuid` primary key from `gen_random_uuid()`. External IDs (Finix transfer ID, Footprint fp_id, Alea round ID, Gamma user ID) go in dedicated columns with their own indexes.

**Timestamps.** Every mutable table has `created_at` and `updated_at` as `timestamptz` with `default now()`. The `updated_at` column is maintained by a trigger (see §16).

**Money.** Coins and USD stored as `numeric(20,4)`. App layer reads into `bigint`. NEVER `number`/`float`. Currencies are explicit (`GC`, `SC`, `USD`).

**Soft delete** (`deleted_at timestamptz`) on tables where the deletion event has audit value (players, packages, bonuses, games). Hard delete is allowed only on transient data (admin sessions).

**Foreign keys** always declared. `on delete cascade` for parent-child where child is meaningless without parent (e.g. wallets → players, compliance_flags → players). `on delete restrict` for financial references (e.g. ledger_entries → players). `on delete set null` for optional relationships.

**Partitioning** by month for high-volume tables: `ledger_entries`, `game_rounds`, `player_events`, `crm_message_log`. Partitions named `{table}_y{year}m{month}`. Created 3 months ahead by monthly cron. Detached at 13 months and archived to cold storage but remain queryable.

**Indexes.** Every FK indexed. Every WHERE-clause column indexed. Compound indexes for common multi-column queries. Partial indexes where filtering helps.

**RLS** on every table. Default `for all to public using (false)`. Specific policies open paths via `current_setting('app.actor_id')` and `current_setting('app.actor_kind')` set per-request.

**Naming.**

- Tables: plural, snake_case (`players`, `ledger_entries`)
- Columns: snake_case (`created_at`, `total_deposited_usd`)
- Indexes: `{table}_{cols}_idx` (`players_email_idx`)
- Constraints: `{table}_{cols}_{kind}` (`players_email_unique`)

**Drizzle.** Schema files under `packages/db/src/schema/` mirror this doc's sections:

- `players.ts`, `wallets.ts`, `kyc.ts`, `compliance.ts`, `geo.ts`
- `auth.ts` (Better Auth player session tables + RG limit-change queue, see §2.6)
- `house-accounts.ts`, `ledger.ts`, `admin-adjustments.ts`
- `games.ts`, `game-sessions.ts`, `game-rounds.ts`
- `packages.ts`, `tiers.ts`, `bonuses.ts`, `bonuses-awarded.ts`, `promo-codes.ts`, `promo-redemptions.ts`
- `affiliates.ts`, `affiliate-codes.ts`, `affiliate-attribution.ts`, `affiliate-payouts.ts`
- `purchases.ts`, `redemptions.ts`, `redemption-rules.ts`, `payment-instruments.ts`
- `events.ts`, `stats.ts`
- `crm.ts` (segments, campaigns, flows, message log, suppression)
- `admin.ts` (admins, roles, sessions)
- `audit.ts`
- `cms.ts` (site_content, banners, templates, notifications)
- `blocklists.ts`, `integration-health.ts`, `webhooks.ts`
- `snapshots.ts`, `exports.ts`
- `migration.ts`, `tax.ts`

---

## 2. Players, Wallets, KYC, Compliance, Geo

### 2.1 `players`

```sql
create type player_status as enum (
  'active', 'suspended', 'self_excluded', 'closed', 'internal', 'restricted'
);

create table players (
  id                      uuid primary key default gen_random_uuid(),

  -- Identity
  email                   text not null unique,
  username                text unique,
  display_name            text,
  phone                   text,
  date_of_birth           date,
  first_name              text,
  last_name               text,

  -- Address
  address_line1           text,
  address_line2           text,
  city                    text,
  state                   text,
  postal_code             text,
  country                 text not null default 'US',

  -- Status
  status                  player_status not null default 'active',
  status_reason           text,
  is_internal_account     boolean not null default false,

  -- KYC summary (denormalized; source of truth in kyc_status)
  kyc_level               int not null default 0 check (kyc_level >= 0 and kyc_level <= 3),
  kyc_verified_at         timestamptz,

  -- Engagement
  first_seen_at           timestamptz not null default now(),
  last_seen_at            timestamptz,
  last_login_at           timestamptz,
  signup_ip               inet,
  signup_country          text,
  signup_state            text,

  -- Affiliate attribution
  attributed_affiliate_id uuid,  -- FK added in step 24 (after affiliates exists)
  attributed_promo_code   text,
  attributed_at           timestamptz,

  -- Responsible gaming
  rg_self_excluded_until    timestamptz,
  rg_deposit_limit_daily    numeric(20,4),
  rg_deposit_limit_weekly   numeric(20,4),
  rg_deposit_limit_monthly  numeric(20,4),
  rg_session_limit_min      int,
  rg_pending_limit_changes  jsonb,

  -- Marketing
  email_consent           boolean not null default true,
  sms_consent             boolean not null default false,
  marketing_consent_at    timestamptz,
  crm_daily_max           int not null default 3,

  -- Migration
  gamma_user_id           text unique,

  -- Meta
  signup_source           text,
  metadata                jsonb not null default '{}'::jsonb,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  deleted_at              timestamptz
);

create index players_email_idx on players(lower(email));
create index players_username_idx on players(lower(username)) where username is not null;
create index players_status_idx on players(status) where deleted_at is null;
create index players_kyc_level_idx on players(kyc_level);
create index players_attributed_affiliate_idx on players(attributed_affiliate_id) where attributed_affiliate_id is not null;
create index players_last_seen_idx on players(last_seen_at desc) where deleted_at is null;
create index players_last_login_idx on players(last_login_at desc) where deleted_at is null;
create index players_state_idx on players(state, status);
create index players_gamma_id_idx on players(gamma_user_id) where gamma_user_id is not null;
create index players_real_users_idx on players(id) where is_internal_account = false and deleted_at is null;
create index players_phone_idx on players(phone) where phone is not null;

alter table players enable row level security;
```

### 2.2 `wallets`

```sql
create table wallets (
  id                    uuid primary key default gen_random_uuid(),
  player_id             uuid not null references players(id) on delete restrict,
  currency              text not null check (currency in ('GC', 'SC')),

  current_balance       numeric(20,4) not null default 0,

  -- Sub-bucket breakdown (sum to current_balance)
  balance_purchased     numeric(20,4) not null default 0,
  balance_bonus         numeric(20,4) not null default 0,
  balance_promo         numeric(20,4) not null default 0,
  balance_earned        numeric(20,4) not null default 0,

  -- Playthrough rollup
  playthrough_required  numeric(20,4) not null default 0,
  playthrough_progress  numeric(20,4) not null default 0,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  unique (player_id, currency),
  check (current_balance = balance_purchased + balance_bonus + balance_promo + balance_earned)
);

create index wallets_player_idx on wallets(player_id);

alter table wallets enable row level security;
```

### 2.3 `kyc_status`

```sql
create table kyc_status (
  id                              uuid primary key default gen_random_uuid(),
  player_id                       uuid not null unique references players(id) on delete restrict,

  footprint_user_id               text unique,
  footprint_status                text,
  footprint_manual_review_status  text,
  footprint_completed_at          timestamptz,
  footprint_status_last_synced    timestamptz,

  watchlist_last_check_at         timestamptz,
  watchlist_last_status           text,

  documents_uploaded              jsonb,

  manual_decision_by              uuid,  -- FK to admins added in step 24
  manual_decision_at              timestamptz,
  manual_decision_reason          text,

  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

create index kyc_status_footprint_id_idx on kyc_status(footprint_user_id) where footprint_user_id is not null;
create index kyc_status_status_idx on kyc_status(footprint_status);
create index kyc_status_watchlist_idx on kyc_status(watchlist_last_status, watchlist_last_check_at desc);

alter table kyc_status enable row level security;
```

### 2.4 `compliance_flags`

```sql
create table compliance_flags (
  id                  uuid primary key default gen_random_uuid(),
  player_id           uuid not null references players(id) on delete cascade,

  flag_type           text not null,
  -- 'self_exclusion' | 'rg_time_break' | 'rg_deposit_limit' | 'geo_block'
  -- | 'fraud' | 'admin_suspend' | 'kyc_failed' | 'aml_watchlist' | 'dispute' | 'unknown'

  severity            text not null check (severity in ('info', 'warn', 'block')),
  reason              text not null,

  expires_at          timestamptz,
  cleared_at          timestamptz,
  cleared_by          uuid,  -- FK to admins added in step 24
  cleared_reason      text,

  imported_from       text,
  imported_source_text text,

  metadata            jsonb not null default '{}'::jsonb,

  created_at          timestamptz not null default now(),
  created_by          uuid  -- FK to admins added in step 24
);

create index compliance_flags_player_idx on compliance_flags(player_id, created_at desc);
create index compliance_flags_active_idx on compliance_flags(player_id, flag_type)
  where cleared_at is null and (expires_at is null or expires_at > now());
create index compliance_flags_type_idx on compliance_flags(flag_type, severity) where cleared_at is null;

alter table compliance_flags enable row level security;
```

### 2.5 `geo_history`

```sql
create table geo_history (
  id              uuid primary key default gen_random_uuid(),
  player_id       uuid not null references players(id) on delete cascade,

  action          text not null,
  resource_id     uuid,

  ip              inet not null,
  country         text,
  state           text,
  city            text,
  postal_code     text,

  is_proxy        boolean default false,
  is_mocked       boolean default false,
  is_compromised  boolean default false,
  is_jumped       boolean default false,
  is_inaccurate   boolean default false,

  user_agent      text,
  device_id       text,

  radar_response  jsonb,

  created_at      timestamptz not null default now()
);

create index geo_history_player_idx on geo_history(player_id, created_at desc);
create index geo_history_action_idx on geo_history(action, created_at desc);
create index geo_history_ip_idx on geo_history(ip);
create index geo_history_state_idx on geo_history(state, created_at desc);

alter table geo_history enable row level security;
```

---

### 2.6 Player auth (Better Auth) + RG limit-change queue

Added in prompt 05. The auth tables back Better Auth's drizzle adapter (docs/09 §5.1); `player_limit_changes` backs the 24h delay on RG deposit-limit increases (docs/09 §7.2).

```sql
-- auth_user: long-lived credential record. id is shared with players.id.
create table auth_user (
  id             text primary key,
  email          text not null unique,
  email_verified boolean not null default false,
  name           text,
  image          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index auth_user_email_idx on auth_user (lower(email));

-- auth_session: per-device session, 14-day expiry (refreshed on activity).
create table auth_session (
  id          text primary key,
  user_id     text not null references auth_user(id) on delete cascade,
  token       text not null unique,
  expires_at  timestamptz not null,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index auth_session_user_idx on auth_session (user_id);
create index auth_session_expires_idx on auth_session (expires_at);

-- auth_account: credential rows (email/password, magic-link, future OAuth).
create table auth_account (
  id                        text primary key,
  user_id                   text not null references auth_user(id) on delete cascade,
  account_id                text not null,
  provider_id               text not null,
  password                  text,
  access_token              text,
  refresh_token             text,
  id_token                  text,
  access_token_expires_at   timestamptz,
  refresh_token_expires_at  timestamptz,
  scope                     text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index auth_account_user_idx on auth_account (user_id);
create index auth_account_provider_idx on auth_account (provider_id, account_id);

-- auth_verification: email-verify tokens, magic-link tokens, password-reset.
create table auth_verification (
  id          text primary key,
  identifier  text not null,
  value       text not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index auth_verification_identifier_idx on auth_verification (identifier);

-- player_limit_changes: 24h-delayed RG limit increases (docs/09 §7.2).
create table player_limit_changes (
  id              uuid primary key default gen_random_uuid(),
  player_id       uuid not null references players(id) on delete cascade,
  limit_kind      text not null,         -- 'deposit_daily' | 'deposit_weekly' | 'deposit_monthly' | 'session'
  previous_value  text,                  -- stringified for cross-type storage
  next_value      text not null,
  direction       text not null check (direction in ('increase', 'decrease')),
  requested_at    timestamptz not null default now(),
  apply_at        timestamptz not null,  -- requested_at + 24h for increases
  applied_at      timestamptz,
  cancelled_at    timestamptz,
  updated_at      timestamptz not null default now()
);
create index player_limit_changes_player_idx on player_limit_changes (player_id, requested_at desc);
create index player_limit_changes_pending_idx on player_limit_changes (apply_at)
  where applied_at is null and cancelled_at is null;
```

**Identity sharing.** `auth_user.id` and `players.id` carry the same string value. Better Auth generates the id during signup; the `before-create` hook captures it and the post-create hook inserts the `players` row with the same id. This lets every other table keep using `uuid` references to `players.id` while Better Auth's `text` ids work for the auth tables.

**Migration:** `0006_better_auth.sql`.

---

## 3. House Accounts, Ledger, Admin Adjustments

### 3.1 `house_accounts`

```sql
create table house_accounts (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null,
  currency        text not null check (currency in ('GC', 'SC', 'USD')),

  display_name    text not null,
  description     text,

  current_balance numeric(20,4) not null default 0,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (kind, currency)
);

-- Seed (run in migration):
insert into house_accounts (kind, currency, display_name, description) values
  ('house_bank',               'USD', 'House USD bank',         'Settled cash from purchases and source for payouts'),
  ('house_winnings_gc',        'GC',  'House GC winnings',      'GC won by the house from player losses'),
  ('house_winnings_sc',        'SC',  'House SC winnings',      'SC won by the house from player losses'),
  ('bonus_pool_gc',            'GC',  'Bonus pool GC',          'Reserved GC for bonus awards'),
  ('bonus_pool_sc',            'SC',  'Bonus pool SC',          'Reserved SC for bonus awards'),
  ('amoe_pool_sc',             'SC',  'AMOE pool SC',           'Reserved SC for EasyScam mail-in entries'),
  ('affiliate_payable_sc',     'SC',  'Affiliate payable',      'SC owed to affiliates pending payout'),
  ('internal_account_sink_gc', 'GC',  'Internal GC sink',       'GC routed to comp/test accounts'),
  ('internal_account_sink_sc', 'SC',  'Internal SC sink',       'SC routed to comp/test accounts'),
  ('external',                 'USD', 'External USD',           'Cash flowing in/out of the system'),
  ('external',                 'GC',  'External GC',            'Synthetic for external GC flows'),
  ('external',                 'SC',  'External SC',            'Synthetic for external SC flows');

alter table house_accounts enable row level security;
```

### 3.2 `ledger_entries` (partitioned)

The most important table in the platform. Immutable. See Doc 04 for usage.

```sql
create type ledger_leg as enum ('debit', 'credit');

create type ledger_source as enum (
  'purchase', 'bet', 'win', 'bonus_award', 'playthrough_release',
  'redemption_request', 'redemption_paid', 'redemption_rejected',
  'purchase_refund', 'admin_adjustment', 'affiliate_payout',
  'bonus_expired', 'migration'
);

create type ledger_account_kind as enum (
  'player_wallet', 'pending_purchase', 'pending_redemption',
  'house_bank', 'house_winnings_gc', 'house_winnings_sc',
  'bonus_pool_gc', 'bonus_pool_sc', 'amoe_pool_sc',
  'affiliate_payable', 'internal_account_sink', 'external'
);

create table ledger_entries (
  id              uuid not null default gen_random_uuid(),

  -- Idempotency
  source          ledger_source not null,
  source_id       text not null,
  idempotency_key text,

  -- Pair grouping
  pair_id         uuid not null,
  leg             ledger_leg not null,

  -- Account
  account_kind    ledger_account_kind not null,
  account_id      uuid not null,

  -- Money
  amount          numeric(20,4) not null check (amount > 0),
  currency        text not null check (currency in ('GC', 'SC', 'USD')),

  -- Sub-bucket (player_wallet only)
  sub_bucket      text check (sub_bucket in ('purchased', 'bonus', 'promo', 'earned')),

  -- Denormalized player ref
  player_id       uuid,

  -- Balance snapshot
  balance_after   numeric(20,4),

  metadata        jsonb not null default '{}'::jsonb,

  created_at      timestamptz not null default now(),

  primary key (id, created_at)
) partition by range (created_at);

create unique index ledger_entries_source_dedup_idx
  on ledger_entries(source, source_id, account_kind, account_id, leg, sub_bucket, created_at);

create index ledger_entries_account_idx on ledger_entries(account_id, currency, created_at desc);
create index ledger_entries_player_idx on ledger_entries(player_id, created_at desc) where player_id is not null;
create index ledger_entries_pair_idx on ledger_entries(pair_id);
create index ledger_entries_source_idx on ledger_entries(source, source_id);

-- Initial 3 partitions (current + 2 ahead). Cron creates future ones.
create table ledger_entries_y2026m05 partition of ledger_entries for values from ('2026-05-01') to ('2026-06-01');
create table ledger_entries_y2026m06 partition of ledger_entries for values from ('2026-06-01') to ('2026-07-01');
create table ledger_entries_y2026m07 partition of ledger_entries for values from ('2026-07-01') to ('2026-08-01');

-- IMMUTABILITY: see §16 for trigger and rule.

alter table ledger_entries enable row level security;
```

### 3.3 `admin_adjustments`

```sql
create table admin_adjustments (
  id                       uuid primary key default gen_random_uuid(),
  player_id                uuid not null references players(id),
  admin_id                 uuid not null,  -- FK added in step 24

  amount                   numeric(20,4) not null,
  currency                 text not null check (currency in ('GC', 'SC')),
  sub_bucket               text check (sub_bucket in ('purchased', 'bonus', 'promo', 'earned')),
  direction                text not null check (direction in ('credit', 'debit')),

  reason                   text not null,
  reason_category          text not null,

  requires_approval        boolean not null default false,
  approved_by              uuid,  -- FK added in step 24
  approved_at              timestamptz,
  approval_threshold_usd   numeric(20,4),

  ledger_pair_id           uuid,

  created_at               timestamptz not null default now()
);

create index admin_adjustments_player_idx on admin_adjustments(player_id, created_at desc);
create index admin_adjustments_admin_idx on admin_adjustments(admin_id, created_at desc);
create index admin_adjustments_pending_idx on admin_adjustments(created_at)
  where requires_approval = true and approved_at is null;

alter table admin_adjustments enable row level security;
```

---

## 4. Games

### 4.1 `aggregators`

Patch from migration 0012 adds the integration-wiring columns so the
senior dev has a place to land AleaPlay / Marbles / future aggregator
configs without rolling another schema change. `webhook_secret_ref`
stores the Doppler key name only — the secret itself never lives in
this database (per `.cursorrules`).

```sql
create table aggregators (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text not null unique,
  display_name         text not null,
  api_base_url         text,
  callback_url         text,
  webhook_secret_ref   text,                           -- Doppler key name, NOT the secret
  status               text not null default 'active' check (status in ('active', 'inactive')),
  config               jsonb not null default '{}'::jsonb,
  features             jsonb not null default '{}'::jsonb,  -- feature flags (live_tokens, free_spins, jackpots, demo)
  version              text,
  last_seen_at         timestamptz,
  error_count_1h       integer not null default 0,
  contact_email        text,
  notes                text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

insert into aggregators (slug, display_name) values ('alea', 'AleaPlay');

alter table aggregators enable row level security;
```

### 4.2 `game_providers`

```sql
create table game_providers (
  id              uuid primary key default gen_random_uuid(),
  aggregator_id   uuid not null references aggregators(id),
  slug            text not null,
  display_name    text not null,
  logo_url        text,
  status          text not null default 'active' check (status in ('active', 'inactive', 'maintenance')),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (aggregator_id, slug)
);

create index game_providers_aggregator_idx on game_providers(aggregator_id, status);

alter table game_providers enable row level security;
```

### 4.3 `games`

```sql
create table games (
  id                       uuid primary key default gen_random_uuid(),
  provider_id              uuid not null references game_providers(id),

  slug                     text not null unique,
  external_id              text not null,
  display_name             text not null,

  category                 text not null,
  sub_category             text,

  thumbnail_url            text,
  banner_url               text,

  rtp                      numeric(5,4),
  volatility               text,
  min_bet_sc               numeric(20,4),
  max_bet_sc               numeric(20,4),

  playthrough_weight       numeric(5,4) not null default 1.0,

  status                   text not null default 'active' check (status in ('active', 'inactive', 'maintenance')),
  customer_facing          boolean not null default true,
  available_in_gc          boolean not null default true,
  available_in_sc          boolean not null default true,

  lobby_order              int default 0,
  is_featured              boolean not null default false,
  is_new                   boolean not null default false,

  metadata                 jsonb not null default '{}'::jsonb,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  deleted_at               timestamptz
);

create index games_provider_idx on games(provider_id);
create index games_category_idx on games(category, status) where deleted_at is null;
create index games_status_idx on games(status, customer_facing) where deleted_at is null;
create index games_lobby_idx on games(lobby_order) where customer_facing = true and status = 'active';
create index games_featured_idx on games(is_featured) where is_featured = true;

alter table games enable row level security;
```

### 4.4 `game_sessions`

```sql
create table game_sessions (
  id                  uuid primary key default gen_random_uuid(),
  player_id           uuid not null references players(id) on delete restrict,
  game_id             uuid not null references games(id),

  currency            text not null check (currency in ('GC', 'SC')),

  alea_session_token  text,
  alea_play_url       text,

  total_bet           numeric(20,4) not null default 0,
  total_win           numeric(20,4) not null default 0,
  round_count         int not null default 0,

  status              text not null default 'active' check (status in ('active', 'closed', 'abandoned')),

  launch_ip           inet,
  launch_state        text,

  started_at          timestamptz not null default now(),
  ended_at            timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index game_sessions_player_idx on game_sessions(player_id, started_at desc);
create index game_sessions_game_idx on game_sessions(game_id, started_at desc);
create index game_sessions_status_idx on game_sessions(status, started_at desc) where status = 'active';

alter table game_sessions enable row level security;
```

### 4.5 `game_rounds` (partitioned)

```sql
create table game_rounds (
  id                  uuid not null default gen_random_uuid(),
  session_id          uuid not null,
  player_id           uuid not null,
  game_id             uuid not null,

  external_round_id   text not null,

  bet_amount          numeric(20,4) not null,
  win_amount          numeric(20,4) not null default 0,
  currency            text not null check (currency in ('GC', 'SC')),

  status              text not null check (status in ('bet_placed', 'resolved', 'refunded')),

  outcome             jsonb,

  bet_at              timestamptz not null,
  won_at              timestamptz,

  created_at          timestamptz not null default now(),

  primary key (id, created_at)
) partition by range (created_at);

create unique index game_rounds_external_idx on game_rounds(external_round_id, created_at);
create index game_rounds_player_idx on game_rounds(player_id, created_at desc);
create index game_rounds_session_idx on game_rounds(session_id, created_at desc);
create index game_rounds_game_idx on game_rounds(game_id, created_at desc);

create table game_rounds_y2026m05 partition of game_rounds for values from ('2026-05-01') to ('2026-06-01');
create table game_rounds_y2026m06 partition of game_rounds for values from ('2026-06-01') to ('2026-07-01');
create table game_rounds_y2026m07 partition of game_rounds for values from ('2026-07-01') to ('2026-08-01');

alter table game_rounds enable row level security;
```

### 4.6 `casino_sub_categories` (migration 0012)

Replaces the JSONB-in-`site_content` hack that was in place during M3.
Each row is one section of the player lobby (Originals, Slots, Live
Dealers, Game Shows, Live Games, or any new section). `ordering`
controls the section's place in the lobby; `in_lobby = false` hides
the section from the player site but keeps it editable in admin.

Powers both the admin Game Lobby WYSIWYG editor (docs/08 §4.3) and
the player lobby. They read from the same tables so what an admin
arranges is exactly what players see.

```sql
create table casino_sub_categories (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  display_name    text not null,
  type            text not null default 'slots',
  thumbnail_url   text,
  ordering        integer not null default 0,
  status          text not null default 'active' check (status in ('active', 'inactive')),
  in_lobby        boolean not null default true,
  is_featured     boolean not null default false,
  metadata        jsonb not null default '{}'::jsonb,
  updated_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index casino_sub_categories_ordering_idx
  on casino_sub_categories(ordering) where status = 'active';
create index casino_sub_categories_lobby_idx
  on casino_sub_categories(ordering) where in_lobby = true and status = 'active';

alter table casino_sub_categories enable row level security;
```

### 4.7 `casino_sub_category_games` (migration 0012)

Join table — one row per (section, game) with per-section ordering.
A single game can live in many sections (e.g. a slot in both "Slots"
and a curated "Hot Games").

```sql
create table casino_sub_category_games (
  sub_category_id  uuid not null references casino_sub_categories(id) on delete cascade,
  game_id          uuid not null references games(id) on delete cascade,
  ordering         integer not null default 0,
  added_by         uuid,
  added_at         timestamptz not null default now(),
  primary key (sub_category_id, game_id)
);

create index casino_sub_category_games_section_idx
  on casino_sub_category_games(sub_category_id, ordering);
create index casino_sub_category_games_game_idx
  on casino_sub_category_games(game_id);

alter table casino_sub_category_games enable row level security;
```

---

## 5. Tiers, Packages, Bonuses, Promo Codes

### 5.1 `tiers`

```sql
create table tiers (
  id                       uuid primary key default gen_random_uuid(),
  slug                     text not null unique,
  display_name             text not null,
  level                    int not null unique,

  xp_required              numeric(20,4) not null default 0,

  weekly_sc_bonus          numeric(20,4) not null default 0,
  monthly_sc_bonus         numeric(20,4) not null default 0,
  daily_login_bonus_mult   numeric(5,2) not null default 1.0,
  cashback_pct             numeric(5,4) default 0,

  icon_url                 text,
  badge_color              text,
  description              text,

  status                   text not null default 'active' check (status in ('active', 'inactive')),

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

insert into tiers (slug, display_name, level, xp_required, weekly_sc_bonus, monthly_sc_bonus) values
  ('rookie',   'Rookie',   1, 0,        0,    0),
  ('bronze',   'Bronze',   2, 1000,     1,    5),
  ('silver',   'Silver',   3, 10000,    5,    25),
  ('gold',     'Gold',     4, 50000,    25,   100),
  ('platinum', 'Platinum', 5, 200000,   100,  500),
  ('diamond',  'Diamond',  6, 1000000,  500,  2500);

alter table tiers enable row level security;
```

### 5.2 `tier_progress`

```sql
create table tier_progress (
  player_id              uuid primary key references players(id) on delete cascade,
  current_tier_id        uuid not null references tiers(id),
  current_tier_level     int not null default 1,

  current_xp             numeric(20,4) not null default 0,
  xp_for_next_tier       numeric(20,4),

  tier_reached_at        timestamptz not null default now(),
  last_weekly_bonus_at   timestamptz,
  last_monthly_bonus_at  timestamptz,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index tier_progress_tier_idx on tier_progress(current_tier_id, current_xp desc);
create index tier_progress_level_idx on tier_progress(current_tier_level desc);

alter table tier_progress enable row level security;
```

### 5.3 `tier_history`

```sql
create table tier_history (
  id              uuid primary key default gen_random_uuid(),
  player_id       uuid not null references players(id) on delete cascade,

  from_tier_id    uuid references tiers(id),
  to_tier_id      uuid not null references tiers(id),

  reason          text not null,
  xp_at_change    numeric(20,4),

  created_at      timestamptz not null default now()
);

create index tier_history_player_idx on tier_history(player_id, created_at desc);

alter table tier_history enable row level security;
```

### 5.4 `packages`

```sql
create table packages (
  id                       uuid primary key default gen_random_uuid(),
  slug                     text not null unique,
  display_name             text not null,

  price_usd                numeric(20,4) not null,

  base_gc                  numeric(20,4) not null,
  base_sc                  numeric(20,4) not null default 0,
  bonus_gc                 numeric(20,4) not null default 0,
  bonus_sc                 numeric(20,4) not null default 0,

  playthrough_multiplier   numeric(5,2) not null default 1.0,

  bonus_id                 uuid,  -- FK added in step 24

  promotional_label        text,
  display_image_url        text,
  description              text,
  sort_order               int not null default 0,

  status                   text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  valid_from               timestamptz,
  valid_until              timestamptz,

  first_purchase_only      boolean not null default false,
  min_tier_id              uuid references tiers(id),
  max_per_player           int,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  deleted_at               timestamptz
);

create index packages_status_idx on packages(status, sort_order) where deleted_at is null;
create index packages_first_purchase_idx on packages(first_purchase_only) where first_purchase_only = true;

alter table packages enable row level security;
```

### 5.5 `bonuses`

```sql
create type bonus_type as enum (
  'welcome', 'tier_up', 'weekly_tier', 'monthly_tier', 'package', 'daily',
  'jackpot', 'referral', 'affiliate', 'promotion', 'amoe', 'admin_added_sc',
  'crm_promocode', 'purchase_promocode'
);

create table bonuses (
  id                          uuid primary key default gen_random_uuid(),
  slug                        text not null unique,
  display_name                text not null,

  bonus_type                  bonus_type not null,

  award_gc                    numeric(20,4) not null default 0,
  award_sc                    numeric(20,4) not null default 0,
  award_formula               jsonb,

  playthrough_multiplier      numeric(5,2) not null default 3.0,
  playthrough_window_hours    int,
  game_weight_overrides       jsonb,
  min_bet_for_contribution    numeric(20,4),
  max_bet_during_playthrough  numeric(20,4),

  min_tier_id                 uuid references tiers(id),
  max_per_player              int,
  cooldown_hours              int,
  stackable                   boolean not null default false,

  status                      text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  valid_from                  timestamptz,
  valid_until                 timestamptz,

  description                 text,
  terms                       text,
  display_image_url           text,

  awarded_count_lifetime      int not null default 0,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index bonuses_type_idx on bonuses(bonus_type, status);
create index bonuses_active_idx on bonuses(status, valid_from, valid_until) where status = 'active';

alter table bonuses enable row level security;
```

### 5.6 `bonuses_awarded`

```sql
create table bonuses_awarded (
  id                                       uuid primary key default gen_random_uuid(),
  player_id                                uuid not null references players(id) on delete restrict,
  bonus_id                                 uuid not null references bonuses(id) on delete restrict,

  gc_amount                                numeric(20,4) not null default 0,
  sc_amount                                numeric(20,4) not null default 0,

  -- Config snapshots (locked at award time)
  playthrough_multiplier_snapshot          numeric(5,2) not null,
  playthrough_required                     numeric(20,4) not null default 0,
  playthrough_progress                     numeric(20,4) not null default 0,
  playthrough_complete                     boolean not null default false,

  game_weight_overrides_snapshot           jsonb,
  min_bet_for_contribution_snapshot        numeric(20,4),
  max_bet_during_playthrough_snapshot      numeric(20,4),

  expires_at                               timestamptz,

  status                                   text not null default 'active'
    check (status in ('active', 'completed', 'expired', 'forfeited', 'reversed')),

  source_kind                              text,
  source_id                                text,

  awarded_by_admin                         uuid,  -- FK added in step 24
  award_reason                             text,

  award_pair_id                            uuid,
  release_pair_id                          uuid,

  created_at                               timestamptz not null default now(),
  completed_at                             timestamptz,

  unique (source_kind, source_id) deferrable initially deferred
);

create index bonuses_awarded_player_idx on bonuses_awarded(player_id, created_at desc);
create index bonuses_awarded_active_idx on bonuses_awarded(player_id, status) where status = 'active';
create index bonuses_awarded_bonus_idx on bonuses_awarded(bonus_id);
create index bonuses_awarded_expiring_idx on bonuses_awarded(expires_at)
  where status = 'active' and expires_at is not null;

alter table bonuses_awarded enable row level security;
```

### 5.7 `promo_codes`

```sql
create table promo_codes (
  id                       uuid primary key default gen_random_uuid(),
  code                     text not null unique,
  description              text,

  bonus_id                 uuid not null references bonuses(id) on delete restrict,

  playthrough_multiplier   numeric(5,2),
  playthrough_window_hours int,
  game_weight_overrides    jsonb,

  required_context         text check (required_context in ('signup', 'purchase', 'standalone')),
  min_tier_id              uuid references tiers(id),
  max_per_player           int default 1,
  max_total_uses           int,
  uses_count               int not null default 0,

  status                   text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  valid_from               timestamptz,
  valid_until              timestamptz,

  blocked_email_domains    text[],

  created_by               uuid,  -- FK added in step 24
  campaign_id              uuid,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index promo_codes_code_idx on promo_codes(code) where status = 'active';
create index promo_codes_bonus_idx on promo_codes(bonus_id);

alter table promo_codes enable row level security;
```

### 5.8 `promo_redemptions`

```sql
create table promo_redemptions (
  id                  uuid primary key default gen_random_uuid(),
  promo_code_id       uuid not null references promo_codes(id) on delete restrict,
  player_id           uuid not null references players(id) on delete restrict,

  bonus_award_id      uuid references bonuses_awarded(id),

  context             text,

  redeemed_at         timestamptz not null default now(),

  unique (promo_code_id, player_id)
);

create index promo_redemptions_player_idx on promo_redemptions(player_id, redeemed_at desc);
create index promo_redemptions_code_idx on promo_redemptions(promo_code_id, redeemed_at desc);

alter table promo_redemptions enable row level security;
```

---

## 6. Affiliates

```sql
create table affiliates (
  id                       uuid primary key default gen_random_uuid(),

  username                 text not null unique,
  email                    text not null unique,
  display_name             text,
  first_name               text,
  last_name                text,

  player_id                uuid references players(id),

  frenzy_creator_id        text,

  revenue_share_pct        numeric(5,4) not null default 0,
  base_cpa_usd             numeric(20,4) default 0,

  status                   text not null default 'active' check (status in ('active', 'inactive', 'banned')),

  total_signups_attributed         int not null default 0,
  total_active_attributed          int not null default 0,
  total_ngr_attributed_sc          numeric(20,4) not null default 0,
  total_payouts_sc                 numeric(20,4) not null default 0,
  pending_payout_sc                numeric(20,4) not null default 0,

  gamma_affiliate_id       text unique,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index affiliates_status_idx on affiliates(status, total_ngr_attributed_sc desc);
create index affiliates_player_idx on affiliates(player_id) where player_id is not null;

create table affiliate_codes (
  id              uuid primary key default gen_random_uuid(),
  affiliate_id    uuid not null references affiliates(id) on delete cascade,

  code            text not null unique,
  campaign_name   text,

  signups_count   int not null default 0,

  status          text not null default 'active' check (status in ('active', 'inactive')),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index affiliate_codes_affiliate_idx on affiliate_codes(affiliate_id);

create table affiliate_attribution (
  id                      uuid primary key default gen_random_uuid(),
  player_id               uuid not null unique references players(id) on delete cascade,
  affiliate_id            uuid not null references affiliates(id),

  source                  text not null check (source in (
    'PROMO_CODE', 'LINK', 'MANUAL', 'FRENZY_CREATOR_PORTAL'
  )),

  source_detail           text,
  campaign_name           text,

  attributed_at           timestamptz not null default now(),

  click_ip                inet,
  click_user_agent        text,
  click_referrer          text
);

create index affiliate_attribution_affiliate_idx on affiliate_attribution(affiliate_id);
create index affiliate_attribution_player_idx on affiliate_attribution(player_id);

create table affiliate_payouts (
  id              uuid primary key default gen_random_uuid(),
  affiliate_id    uuid not null references affiliates(id) on delete restrict,

  period_label    text not null,
  period_start    timestamptz,
  period_end      timestamptz,

  amount_sc       numeric(20,4) not null,

  status          text not null default 'pending' check (status in (
    'pending', 'approved', 'paid', 'cancelled'
  )),

  approved_by     uuid,  -- FK added in step 24
  approved_at     timestamptz,

  paid_at         timestamptz,
  ledger_pair_id  uuid,

  notes           text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index affiliate_payouts_affiliate_idx on affiliate_payouts(affiliate_id, created_at desc);
create index affiliate_payouts_status_idx on affiliate_payouts(status, created_at);

alter table affiliates enable row level security;
alter table affiliate_codes enable row level security;
alter table affiliate_attribution enable row level security;
alter table affiliate_payouts enable row level security;
```

---

## 7. Purchases, Redemptions, Payment Instruments

### 7.1 `purchases`

```sql
create table purchases (
  id                       uuid primary key default gen_random_uuid(),
  player_id                uuid not null references players(id) on delete restrict,

  package_id               uuid references packages(id),

  amount_usd               numeric(20,4) not null,
  amount_cents             bigint not null,

  base_gc                  numeric(20,4) not null default 0,
  base_sc                  numeric(20,4) not null default 0,
  bonus_gc                 numeric(20,4) not null default 0,
  bonus_sc                 numeric(20,4) not null default 0,

  promo_code               text,

  finix_transfer_id        text unique,
  finix_payment_instrument_id text,
  finix_3ds_result         text,
  finix_3ds_eci            text,
  finix_avs_result         text,
  finix_cvv_result         text,
  finix_card_last4         text,
  finix_card_brand         text,

  status                   text not null default 'pending'
    check (status in ('pending', 'completed', 'failed', 'cancelled', 'refunded', 'disputed')),

  failure_reason           text,
  failure_message          text,

  attempts_count           int not null default 1,
  abandonment_step         text,

  ledger_pair_id           uuid,

  ip_at_purchase           inet,
  state_at_purchase        text,

  gamma_transaction_id     text unique,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  completed_at             timestamptz
);

create index purchases_player_idx on purchases(player_id, created_at desc);
create index purchases_status_idx on purchases(status, created_at desc);
create index purchases_finix_idx on purchases(finix_transfer_id) where finix_transfer_id is not null;
create index purchases_pending_idx on purchases(created_at) where status = 'pending';

alter table purchases enable row level security;
```

### 7.2 `payment_instruments`

```sql
create table payment_instruments (
  id                          uuid primary key default gen_random_uuid(),
  player_id                   uuid not null references players(id) on delete cascade,

  type                        text not null check (type in ('bank_account', 'debit_card')),

  display_name                text,

  finix_payment_instrument_id text,

  bank_name                   text,
  account_last4               text,
  routing_last4               text,

  plaid_account_id            text,
  plaid_validation_status     text,
  plaid_validation_at         timestamptz,

  apt_card_token              text,
  card_brand                  text,
  card_last4                  text,

  status                      text not null default 'active' check (status in ('active', 'disabled')),
  disabled_at                 timestamptz,
  disabled_reason             text,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index payment_instruments_player_idx on payment_instruments(player_id, status);

alter table payment_instruments enable row level security;
```

### 7.3 `redemptions`

```sql
create table redemptions (
  id                       uuid primary key default gen_random_uuid(),
  player_id                uuid not null references players(id) on delete restrict,

  amount_sc                numeric(20,4) not null,
  amount_usd               numeric(20,4) not null,

  method                   text not null check (method in ('finix_ach', 'apt_debit')),
  payment_instrument_id    uuid references payment_instruments(id),

  drain_plan               jsonb not null,

  status                   text not null default 'requested' check (status in (
    'requested', 'pending_review', 'kyc_pending', 'approved', 'submitted',
    'awaiting_webhook', 'paid', 'failed', 'rejected', 'cancelled', 'aml_hold'
  )),

  approved_by              uuid,  -- FK added in step 24
  approved_at              timestamptz,
  approval_reason          text,
  rejected_by              uuid,  -- FK added in step 24
  rejected_at              timestamptz,
  rejection_reason         text,
  rejection_category       text,

  finix_transfer_id        text unique,
  apt_transfer_id          text unique,

  failure_reason           text,

  ledger_pair_id           uuid,

  ip_at_request            inet,
  state_at_request         text,

  submitted_to_finix_at    timestamptz,
  paid_at                  timestamptz,

  gamma_redemption_id      text unique,

  fraud_signals_snapshot   jsonb,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  requested_at             timestamptz not null default now()
);

create index redemptions_player_idx on redemptions(player_id, created_at desc);
create index redemptions_status_idx on redemptions(status, created_at);
create index redemptions_pending_review_idx on redemptions(created_at)
  where status in ('pending_review', 'kyc_pending', 'aml_hold');
create index redemptions_awaiting_webhook_idx on redemptions(submitted_to_finix_at)
  where status = 'awaiting_webhook';

alter table redemptions enable row level security;
```

### 7.4 `redemption_rules` (migration 0014)

Operator-tunable auto-approval policy for incoming redemptions. Each row is
one named rule. The cashier engine evaluates active, non-archived rules in
priority order (lower = earlier); the first rule whose conditions all match
decides the outcome (`auto_approve` or `route_to_review`). If no rule
matches the request falls through to `pending_review` so a human signs off.

Replaces the hard-coded `AUTO_APPROVE_THRESHOLD_USD` constant. The constant
remains as a defense-in-depth fallback when the table is empty (no rule
configured = no auto-approve above the historical $50 ceiling).

```sql
create table redemption_rules (
  id                              uuid primary key default gen_random_uuid(),
  title                           text not null,
  description                     text,
  priority                        integer not null default 100,
  is_active                       boolean not null default true,
  action                          text not null default 'auto_approve'
    check (action in ('auto_approve', 'route_to_review')),

  -- conditions (all nullable / empty = no constraint)
  max_amount_usd                  numeric(20, 4),
  min_amount_usd                  numeric(20, 4),
  required_kyc_levels             jsonb not null default '[]'::jsonb,
  blocked_states                  jsonb not null default '[]'::jsonb,
  require_prior_paid_redemption   boolean not null default false,
  completion_hours                integer not null default 0,

  created_by                      uuid,
  updated_by                      uuid,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  archived_at                     timestamptz
);

create index redemption_rules_priority_idx
  on redemption_rules(priority)
  where is_active = true and archived_at is null;

alter table redemption_rules enable row level security;
-- Reads open to admin/player/system (rule eval runs in player context);
-- non-admins only see active, non-archived rules. Writes admin-only;
-- application layer further gates to manager+ at the API.
```

Audited admin actions: `redemption_rule.created`, `redemption_rule.updated`,
`redemption_rule.enabled`, `redemption_rule.disabled`,
`redemption_rule.archived`.

---

## 8. Player Events & Stats

### 8.1 `player_events` (partitioned)

```sql
create table player_events (
  id              uuid not null default gen_random_uuid(),
  player_id       uuid not null,

  event_name      text not null,
  event_category  text not null,

  payload         jsonb not null default '{}'::jsonb,

  game_id         uuid,
  amount          numeric(20,4),
  currency        text,

  created_at      timestamptz not null default now(),

  primary key (id, created_at)
) partition by range (created_at);

create index player_events_player_idx on player_events(player_id, created_at desc);
create index player_events_name_idx on player_events(event_name, created_at desc);
create index player_events_category_idx on player_events(event_category, created_at desc);
create index player_events_game_idx on player_events(game_id, created_at desc) where game_id is not null;

create table player_events_y2026m05 partition of player_events for values from ('2026-05-01') to ('2026-06-01');
create table player_events_y2026m06 partition of player_events for values from ('2026-06-01') to ('2026-07-01');
create table player_events_y2026m07 partition of player_events for values from ('2026-07-01') to ('2026-08-01');

alter table player_events enable row level security;
```

### 8.2 `player_lifetime_stats`

```sql
create table player_lifetime_stats (
  player_id                uuid primary key references players(id) on delete cascade,

  total_deposited_usd      numeric(20,4) not null default 0,
  total_redeemed_usd       numeric(20,4) not null default 0,
  net_position_usd         numeric(20,4) not null default 0,
  purchase_count           int not null default 0,
  redemption_count         int not null default 0,
  pending_redemption_count int not null default 0,

  total_wagered_gc         numeric(20,4) not null default 0,
  total_wagered_sc         numeric(20,4) not null default 0,
  total_won_gc             numeric(20,4) not null default 0,
  total_won_sc             numeric(20,4) not null default 0,
  ggr_sc                   numeric(20,4) not null default 0,
  ngr_sc                   numeric(20,4) not null default 0,
  session_count            int not null default 0,
  round_count              int not null default 0,
  days_active              int not null default 0,

  first_purchase_at        timestamptz,
  last_purchase_at         timestamptz,
  first_session_at         timestamptz,
  last_session_at          timestamptz,

  emails_received_lifetime int not null default 0,
  emails_opened_lifetime   int not null default 0,
  emails_clicked_lifetime  int not null default 0,

  computed_at              timestamptz not null default now()
);

create index player_lifetime_stats_deposited_idx on player_lifetime_stats(total_deposited_usd desc);
create index player_lifetime_stats_ngr_idx on player_lifetime_stats(ngr_sc desc);
create index player_lifetime_stats_last_purchase_idx on player_lifetime_stats(last_purchase_at desc);

alter table player_lifetime_stats enable row level security;
```

### 8.3 `player_30d_stats`

```sql
create table player_30d_stats (
  player_id                uuid primary key references players(id) on delete cascade,

  deposited_usd_30d        numeric(20,4) not null default 0,
  redeemed_usd_30d         numeric(20,4) not null default 0,
  wagered_sc_30d           numeric(20,4) not null default 0,
  ngr_sc_30d               numeric(20,4) not null default 0,
  session_count_30d        int not null default 0,
  days_active_30d          int not null default 0,

  last_purchase_at         timestamptz,
  last_session_at          timestamptz,
  last_login_at            timestamptz,

  computed_at              timestamptz not null default now()
);

create index player_30d_stats_active_idx on player_30d_stats(last_login_at desc);
create index player_30d_stats_wagered_idx on player_30d_stats(wagered_sc_30d desc);

alter table player_30d_stats enable row level security;
```

### 8.4 `player_game_stats`

```sql
create table player_game_stats (
  player_id           uuid not null references players(id) on delete cascade,
  game_id             uuid not null references games(id),

  total_bet_sc        numeric(20,4) not null default 0,
  total_win_sc        numeric(20,4) not null default 0,
  round_count         int not null default 0,
  first_played_at     timestamptz not null,
  last_played_at      timestamptz not null,

  last_7d_wagered_sc  numeric(20,4) not null default 0,
  last_7d_rounds      int not null default 0,

  last_30d_wagered_sc numeric(20,4) not null default 0,
  last_30d_rounds     int not null default 0,

  computed_at         timestamptz not null default now(),

  primary key (player_id, game_id)
);

create index player_game_stats_player_idx on player_game_stats(player_id, total_bet_sc desc);
create index player_game_stats_game_idx on player_game_stats(game_id, total_bet_sc desc);
create index player_game_stats_recent_idx on player_game_stats(game_id, last_7d_wagered_sc desc) where last_7d_wagered_sc > 0;

alter table player_game_stats enable row level security;
```

### 8.5 `player_favorites`

Per-player game bookmarks. The lobby tile star (hover-reveal, top-right)
and the `/favorites` page read from this table; the immersive game-launch
footer writes through `core.favorites.set()` so the same surface state
follows the player from any tile click into the game and back.

```sql
create table player_favorites (
  player_id    uuid not null references players(id) on delete cascade,
  game_id      uuid not null references games(id) on delete cascade,
  favorited_at timestamptz not null default now(),

  primary key (player_id, game_id)
);

create index player_favorites_player_idx
  on player_favorites(player_id, favorited_at desc);
create index player_favorites_game_idx
  on player_favorites(game_id);

alter table player_favorites enable row level security;
```

**Write path.** `core.favorites.set(ctx, { playerId, gameId, favorite })`
is the only writer. Idempotent: `set(favorite=true)` upserts, `set(favorite=false)`
deletes and tolerates the no-op. Both branches are safe to retry. Returns
`{ favorite: boolean }` so the API can echo the resulting state back to
the optimistic client.

**RLS.**

- Player can `SELECT`, `INSERT`, `DELETE` rows where `player_id` matches
  `app.actor_id` (no other table grants players an INSERT/DELETE; this
  one does because the favorite list is fully owned by them).
- Admin can `SELECT` all (for the player-detail "Games played + favorite"
  cell — docs/08).

**No audit / no CRM event.** Favoriting is a low-stakes preference, not
a money or compliance action. We deliberately skip both the `audit_log`
row and a `player.game.*` event taxonomy entry to avoid spamming. If
marketing later wants "favorited a game" as a CRM signal we'll add a
typed `player.game.favorited` event in docs/11 §1 (see "Open
questions" in the prompt-09 PR).

---

## 9. CRM

### 9.1 `crm_segments`

```sql
create table crm_segments (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null unique,
  description         text,

  filter_tree         jsonb not null,

  compiled_sql        text,
  compiled_at         timestamptz,
  compilation_version int default 1,

  cached_count        int,
  count_updated_at    timestamptz,

  status              text not null default 'active' check (status in ('active', 'archived')),

  created_by          uuid,  -- FK added in step 24

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index crm_segments_status_idx on crm_segments(status, name);

alter table crm_segments enable row level security;
```

### 9.2 `crm_campaigns`

```sql
create table crm_campaigns (
  id                              uuid primary key default gen_random_uuid(),
  name                            text not null,
  description                     text,

  segment_id                      uuid references crm_segments(id),

  channel                         text not null check (channel in ('email', 'sms', 'in_app')),

  template_id                     uuid,

  ab_variant_a_template_id        uuid,
  ab_variant_b_template_id        uuid,
  ab_split_pct                    int,
  ab_winner_metric                text,
  ab_winning_variant              text,
  ab_decided_at                   timestamptz,

  scheduled_for                   timestamptz,

  conversion_event                text,
  conversion_window_hours         int default 168,

  status                          text not null default 'draft' check (status in (
    'draft', 'scheduled', 'sending', 'sent', 'cancelled', 'paused'
  )),

  segment_snapshot_count          int,
  eligible_count                  int,
  recipients_count                int default 0,
  sent_count                      int default 0,
  delivered_count                 int default 0,
  opened_count                    int default 0,
  clicked_count                   int default 0,
  bounced_count                   int default 0,
  unsubscribed_count              int default 0,
  conversion_count                int default 0,

  created_by                      uuid,  -- FK added in step 24

  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  sent_started_at                 timestamptz,
  sent_completed_at               timestamptz
);

create index crm_campaigns_status_idx on crm_campaigns(status, created_at desc);
create index crm_campaigns_segment_idx on crm_campaigns(segment_id);
create index crm_campaigns_scheduled_idx on crm_campaigns(scheduled_for) where status = 'scheduled';

alter table crm_campaigns enable row level security;
```

### 9.3 `crm_flows`, `crm_flow_steps`, `crm_flow_enrollments`

```sql
create table crm_flows (
  id                              uuid primary key default gen_random_uuid(),
  name                            text not null,
  description                     text,

  trigger_event                   text not null,
  trigger_filter                  jsonb,

  max_enrollments_per_player      int default 1,
  cooldown_hours_between_enrollments int,

  status                          text not null default 'active' check (status in ('active', 'paused', 'archived')),

  conversion_event                text,

  enrollments_count_lifetime      int not null default 0,

  created_by                      uuid,  -- FK added in step 24

  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

create index crm_flows_trigger_idx on crm_flows(trigger_event, status) where status = 'active';

create table crm_flow_steps (
  id              uuid primary key default gen_random_uuid(),
  flow_id         uuid not null references crm_flows(id) on delete cascade,

  step_number     int not null,

  action_type     text not null check (action_type in (
    'send_email', 'send_sms', 'wait', 'condition',
    'award_bonus', 'add_to_segment', 'remove_from_segment', 'end'
  )),

  config          jsonb not null default '{}'::jsonb,

  wait_duration_seconds int,

  created_at      timestamptz not null default now(),

  unique (flow_id, step_number)
);

create index crm_flow_steps_flow_idx on crm_flow_steps(flow_id, step_number);

create table crm_flow_enrollments (
  id              uuid primary key default gen_random_uuid(),
  flow_id         uuid not null references crm_flows(id) on delete cascade,
  player_id       uuid not null references players(id) on delete cascade,

  current_step    int not null default 1,
  next_action_at  timestamptz not null default now(),

  status          text not null default 'active' check (status in (
    'active', 'completed', 'cancelled', 'errored'
  )),

  enrolled_at     timestamptz not null default now(),
  completed_at    timestamptz,
  last_step_at    timestamptz,
  error_message   text
);

create index crm_flow_enrollments_player_idx on crm_flow_enrollments(player_id, flow_id);
create index crm_flow_enrollments_pending_idx on crm_flow_enrollments(next_action_at) where status = 'active';

alter table crm_flows enable row level security;
alter table crm_flow_steps enable row level security;
alter table crm_flow_enrollments enable row level security;
```

### 9.4 `crm_message_log` (partitioned)

```sql
create table crm_message_log (
  id                  uuid not null default gen_random_uuid(),
  player_id           uuid not null,

  campaign_id         uuid,
  flow_enrollment_id  uuid,
  template_id         uuid,

  channel             text not null check (channel in ('email', 'sms', 'in_app')),
  recipient           text not null,

  subject             text,
  body_preview        text,
  ab_variant          text,

  status              text not null check (status in (
    'queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced',
    'spam', 'unsubscribed', 'failed'
  )),

  sendgrid_message_id text,
  twilio_message_sid  text,

  conversion_event_id uuid,
  conversion_at       timestamptz,

  queued_at           timestamptz,
  sent_at             timestamptz,
  delivered_at        timestamptz,
  opened_at           timestamptz,
  clicked_at          timestamptz,

  error_code          text,
  error_message       text,

  created_at          timestamptz not null default now(),

  primary key (id, created_at)
) partition by range (created_at);

create index crm_message_log_player_idx on crm_message_log(player_id, created_at desc);
create index crm_message_log_campaign_idx on crm_message_log(campaign_id, created_at desc);
create index crm_message_log_status_idx on crm_message_log(status, created_at desc);

create table crm_message_log_y2026m05 partition of crm_message_log for values from ('2026-05-01') to ('2026-06-01');
create table crm_message_log_y2026m06 partition of crm_message_log for values from ('2026-06-01') to ('2026-07-01');
create table crm_message_log_y2026m07 partition of crm_message_log for values from ('2026-07-01') to ('2026-08-01');

alter table crm_message_log enable row level security;
```

### 9.5 `crm_suppression`

```sql
create table crm_suppression (
  email_or_phone  text primary key,
  reason          text not null,
  source          text not null check (source in (
    'bounce', 'complaint', 'manual', 'unsubscribe', 'tcpa_stop'
  )),
  added_at        timestamptz not null default now()
);

alter table crm_suppression enable row level security;
```

---

## 10. Admin, Sessions, Audit

### 10.1 `admin_roles`

```sql
create table admin_roles (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  display_name    text not null,
  description     text,
  level           int not null,

  permissions     jsonb not null default '[]'::jsonb,

  redemption_approve_max_usd  bigint,
  adjustment_max_usd          bigint,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

insert into admin_roles (slug, display_name, level, redemption_approve_max_usd, adjustment_max_usd) values
  ('support',       'Support',        10, 0,        0),
  ('kyc_reviewer',  'KYC Reviewer',   20, 0,        0),
  ('cashier',       'Cashier',        30, 100000,   0),
  ('cashier_lead',  'Cashier Lead',   40, 1000000,  0),
  ('marketing',     'Marketing',      50, 0,        0),
  ('game_ops',      'Game Ops',       60, 0,        0),
  ('manager',       'Manager',        80, 5000000,  100000),
  ('master',        'Master',         100, null,    null);

alter table admin_roles enable row level security;
```

### 10.2 `admins`

```sql
create table admins (
  id              uuid primary key default gen_random_uuid(),

  email           text not null unique,
  display_name    text not null,

  password_hash   text not null,
  password_set_at timestamptz not null default now(),

  totp_secret     text,
  totp_enabled    boolean not null default false,
  totp_enabled_at timestamptz,
  backup_codes    text,

  status          text not null default 'active' check (status in ('active', 'suspended', 'terminated')),
  status_reason   text,

  last_login_at   timestamptz,
  last_login_ip   inet,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index admins_email_idx on admins(lower(email));
create index admins_status_idx on admins(status) where deleted_at is null;

alter table admins enable row level security;
```

### 10.3 `admin_role_assignments`

```sql
create table admin_role_assignments (
  admin_id        uuid not null references admins(id) on delete cascade,
  role_id         uuid not null references admin_roles(id) on delete restrict,

  granted_at      timestamptz not null default now(),
  granted_by      uuid references admins(id),

  primary key (admin_id, role_id)
);

create index admin_role_assignments_admin_idx on admin_role_assignments(admin_id);
create index admin_role_assignments_role_idx on admin_role_assignments(role_id);

alter table admin_role_assignments enable row level security;
```

### 10.4 `admin_permissions`

```sql
create table admin_permissions (
  id              uuid primary key default gen_random_uuid(),
  admin_id        uuid not null references admins(id) on delete cascade,
  resource        text not null,
  action          text not null,

  scope           jsonb,

  granted_at      timestamptz not null default now(),
  granted_by      uuid references admins(id),
  expires_at      timestamptz,
  revoked_at      timestamptz,

  unique (admin_id, resource, action)
);

create index admin_permissions_admin_idx on admin_permissions(admin_id) where revoked_at is null;

alter table admin_permissions enable row level security;
```

### 10.5 `admin_sessions`

```sql
create table admin_sessions (
  id              uuid primary key default gen_random_uuid(),
  admin_id        uuid not null references admins(id) on delete cascade,

  bind_ip         inet,
  bind_ua_hash    text,

  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  last_active_at  timestamptz not null default now(),

  revoked_at      timestamptz,
  revoked_reason  text,
  revoked_by      uuid references admins(id)
);

create index admin_sessions_admin_idx on admin_sessions(admin_id, created_at desc);
create index admin_sessions_active_idx on admin_sessions(expires_at) where revoked_at is null;

alter table admin_sessions enable row level security;
```

### 10.6 `audit_log`

```sql
create table audit_log (
  id              uuid primary key default gen_random_uuid(),

  actor_kind      text not null check (actor_kind in ('admin', 'player', 'system')),
  actor_id        uuid,
  actor_role      text,

  action          text not null,
  resource_kind   text,
  resource_id     uuid,

  before          jsonb,
  after           jsonb,

  reason          text,
  ip              inet,
  user_agent      text,
  request_id      text,

  metadata        jsonb not null default '{}'::jsonb,

  occurred_at     timestamptz not null default now()
);

create index audit_log_actor_idx on audit_log(actor_id, occurred_at desc) where actor_id is not null;
create index audit_log_action_idx on audit_log(action, occurred_at desc);
create index audit_log_resource_idx on audit_log(resource_kind, resource_id, occurred_at desc);
create index audit_log_occurred_idx on audit_log(occurred_at desc);

-- IMMUTABILITY: see §16.

alter table audit_log enable row level security;
```

### 10.7 Admin UX tables

```sql
create table admin_dashboard_layouts (
  admin_id     uuid not null references admins(id) on delete cascade,
  layout       jsonb not null,
  updated_at   timestamptz not null default now(),
  primary key (admin_id)
);

create table admin_saved_views (
  id            uuid primary key default gen_random_uuid(),
  admin_id      uuid not null references admins(id) on delete cascade,
  scope         text not null,
  name          text not null,
  filter_config jsonb not null,
  column_config jsonb,
  is_shared     boolean not null default false,
  created_at    timestamptz not null default now()
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
  query_config jsonb not null,
  schedule     text,
  last_run_at  timestamptz,
  created_at   timestamptz not null default now()
);

alter table admin_dashboard_layouts enable row level security;
alter table admin_saved_views enable row level security;
alter table admin_notes enable row level security;
alter table custom_query_definitions enable row level security;
```

---

## 11. CMS, Templates, Notifications

```sql
create table site_content (
  id              uuid primary key default gen_random_uuid(),
  key             text not null unique,

  value           text,
  value_json      jsonb,

  version         int not null default 1,

  audience        text,

  updated_by      uuid,  -- FK to admins added in step 24

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index site_content_key_idx on site_content(key);

create table banners (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,

  title           text,
  body            text,
  cta_label       text,
  cta_url         text,
  image_url       text,

  audience_segment_id uuid references crm_segments(id),
  pages           text[],

  starts_at       timestamptz,
  ends_at         timestamptz,

  sort_order      int not null default 0,
  status          text not null default 'active' check (status in ('active', 'inactive')),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index banners_status_idx on banners(status, sort_order) where status = 'active';
create index banners_schedule_idx on banners(starts_at, ends_at) where status = 'active';

create table email_templates (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,

  display_name    text not null,

  version         int not null default 1,
  parent_id       uuid references email_templates(id),
  is_current      boolean not null default true,

  subject_template    text not null,
  body_html_template  text not null,
  body_text_template  text,

  from_email      text,
  reply_to        text,
  category        text,

  created_by      uuid,  -- FK to admins added in step 24

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index email_templates_slug_idx on email_templates(slug) where is_current = true;

create table sms_templates (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,

  display_name    text not null,
  version         int not null default 1,
  parent_id       uuid references sms_templates(id),
  is_current      boolean not null default true,

  body_template   text not null check (length(body_template) <= 320),

  category        text,

  created_by      uuid,  -- FK to admins added in step 24
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table notifications (
  id              uuid primary key default gen_random_uuid(),
  player_id       uuid not null references players(id) on delete cascade,

  title           text not null,
  body            text,
  cta_url         text,

  category        text,
  priority        text not null default 'normal' check (priority in ('low', 'normal', 'high')),

  read_at         timestamptz,

  source_kind     text,
  source_id       text,

  created_at      timestamptz not null default now(),
  expires_at      timestamptz
);

create index notifications_player_idx on notifications(player_id, created_at desc);
create index notifications_unread_idx on notifications(player_id) where read_at is null;

alter table site_content enable row level security;
alter table banners enable row level security;
alter table email_templates enable row level security;
alter table sms_templates enable row level security;
alter table notifications enable row level security;
```

---

## 12. Blocklists

```sql
create table blocked_emails (
  email           text primary key,
  reason          text not null,
  added_by        uuid,  -- FK to admins added in step 24
  added_at        timestamptz not null default now()
);

create table blocked_domains (
  domain          text primary key,
  reason          text not null,
  added_by        uuid,  -- FK to admins added in step 24
  added_at        timestamptz not null default now()
);

create table blocked_ips (
  ip              inet primary key,
  reason          text not null,
  added_by        uuid,  -- FK to admins added in step 24
  added_at        timestamptz not null default now(),
  expires_at      timestamptz
);

create index blocked_ips_active_idx on blocked_ips(ip) where expires_at is null or expires_at > now();

create table blocked_promo_codes (
  code            text primary key,
  reason          text not null,
  added_by        uuid,  -- FK to admins added in step 24
  added_at        timestamptz not null default now()
);

alter table blocked_emails enable row level security;
alter table blocked_domains enable row level security;
alter table blocked_ips enable row level security;
alter table blocked_promo_codes enable row level security;
```

---

## 13. Integration Health, Webhooks, AML Queue

```sql
create table integration_health (
  provider                  text primary key,

  status                    text not null default 'green' check (status in ('green', 'yellow', 'red')),

  last_seen_at              timestamptz,
  last_success_at           timestamptz,
  last_failure_at           timestamptz,

  error_count_1h            int not null default 0,
  success_count_1h          int not null default 0,
  p99_latency_ms_1h         int,
  duplicate_count_1h        int not null default 0,
  consecutive_failures      int not null default 0,

  updated_at                timestamptz not null default now()
);

insert into integration_health (provider) values
  ('finix'), ('alea'), ('footprint'), ('radar'),
  ('sendgrid'), ('twilio'), ('easyscam'), ('pusher'), ('inngest');

create table pending_webhooks (
  id              uuid primary key default gen_random_uuid(),
  provider        text not null,
  idempotency_key text not null,
  event_type      text not null,

  raw_body        text not null,
  raw_headers     jsonb not null,

  received_at     timestamptz not null default now(),

  status          text not null default 'received' check (status in (
    'received', 'processing', 'completed', 'failed', 'replayed_for_migration'
  )),

  processing_attempts int not null default 0,
  last_attempt_at timestamptz,
  last_error      text,

  processed_at    timestamptz,

  unique (provider, idempotency_key)
);

create index pending_webhooks_status_idx on pending_webhooks(status, received_at)
  where status in ('received', 'processing', 'failed');
create index pending_webhooks_provider_idx on pending_webhooks(provider, received_at desc);
create index pending_webhooks_event_idx on pending_webhooks(event_type, received_at desc);

create table aml_review_queue (
  id                     uuid primary key default gen_random_uuid(),
  player_id              uuid not null references players(id) on delete cascade,
  footprint_event_id     text,

  status                 text not null default 'open' check (status in (
    'open', 'cleared', 'hold_confirmed', 'escalated_legal'
  )),

  resolved_at            timestamptz,
  resolved_by            uuid,  -- FK to admins added in step 24
  resolution_notes       text,

  created_at             timestamptz not null default now()
);

create index aml_review_queue_open_idx on aml_review_queue(created_at) where status = 'open';
create index aml_review_queue_player_idx on aml_review_queue(player_id);

alter table integration_health enable row level security;
alter table pending_webhooks enable row level security;
alter table aml_review_queue enable row level security;
```

---

## 14. Reporting Snapshots, Exports

### 14.1 `daily_operational_snapshots`

```sql
create table daily_operational_snapshots (
  date                          date primary key,
  day_of_week                   text not null,

  dau                           int not null default 0,
  unique_logins                 int not null default 0,
  new_registered_players        int not null default 0,

  total_sc_staked               numeric(20,4) not null default 0,
  total_sc_won                  numeric(20,4) not null default 0,
  total_ggr_sc                  numeric(20,4) not null default 0,
  total_ngr_sc                  numeric(20,4) not null default 0,
  total_gc_staked               numeric(20,4) not null default 0,

  total_deposits_usd            numeric(20,4) not null default 0,
  depositors_count              int not null default 0,
  first_time_purchasers         int not null default 0,
  withdrawals_requested_sc      numeric(20,4) not null default 0,
  withdrawals_completed_sc      numeric(20,4) not null default 0,
  withdrawals_completed_usd     numeric(20,4) not null default 0,

  bonus_amoe                    numeric(20,4) not null default 0,
  bonus_tier                    numeric(20,4) not null default 0,
  bonus_daily                   numeric(20,4) not null default 0,
  bonus_package                 numeric(20,4) not null default 0,
  bonus_welcome                 numeric(20,4) not null default 0,
  bonus_jackpot                 numeric(20,4) not null default 0,
  bonus_referral                numeric(20,4) not null default 0,
  bonus_affiliate               numeric(20,4) not null default 0,
  bonus_promotion               numeric(20,4) not null default 0,
  bonus_weekly_tier             numeric(20,4) not null default 0,
  bonus_monthly_tier            numeric(20,4) not null default 0,
  bonus_admin_added_sc          numeric(20,4) not null default 0,
  bonus_crm_promocode           numeric(20,4) not null default 0,
  bonus_purchase_promocode      numeric(20,4) not null default 0,
  bonus_total                   numeric(20,4) not null default 0,

  abp_per_dau                   numeric(10,2),
  aggr_per_dau                  numeric(10,2),
  angr_per_dau                  numeric(10,2),

  generated_at                  timestamptz not null default now(),
  generation_duration_ms        int,
  source_hash                   text
);

create index daily_snapshots_date_idx on daily_operational_snapshots(date desc);

alter table daily_operational_snapshots enable row level security;
```

### 14.2 Specialized snapshots

```sql
create table daily_per_state_snapshot (
  date            date not null,
  state           text not null,

  dau             int not null default 0,
  new_signups     int not null default 0,
  total_deposited_usd numeric(20,4) not null default 0,
  total_redeemed_usd  numeric(20,4) not null default 0,
  total_staked_sc     numeric(20,4) not null default 0,
  total_ggr_sc        numeric(20,4) not null default 0,

  primary key (date, state)
);

create table daily_per_game_snapshot (
  date          date not null,
  game_id       uuid not null references games(id),

  unique_players int not null default 0,
  total_rounds   int not null default 0,
  total_bet_sc   numeric(20,4) not null default 0,
  total_win_sc   numeric(20,4) not null default 0,
  ggr_sc         numeric(20,4) not null default 0,

  rtp_realized  numeric(5,4),
  rtp_expected  numeric(5,4),

  primary key (date, game_id)
);

create index daily_per_game_date_idx on daily_per_game_snapshot(date desc);

create table daily_per_affiliate_snapshot (
  date            date not null,
  affiliate_id    uuid not null references affiliates(id),

  attributed_signups int not null default 0,
  attributed_active_players int not null default 0,
  attributed_deposits_usd numeric(20,4) not null default 0,
  attributed_ngr_sc numeric(20,4) not null default 0,
  payout_owed_sc  numeric(20,4) not null default 0,

  primary key (date, affiliate_id)
);

create table daily_redemption_rate_snapshot (
  date                       date primary key,
  revenue_usd                numeric(20,4) not null default 0,
  redemptions_usd            numeric(20,4) not null default 0,
  pending_usd                numeric(20,4) not null default 0,
  cumulative_revenue_usd     numeric(20,4) not null default 0,
  cumulative_redemptions_usd numeric(20,4) not null default 0,
  daily_redemption_rate      numeric(5,4),
  lifetime_redemption_rate   numeric(5,4),
  per_state                  jsonb
);

alter table daily_per_state_snapshot enable row level security;
alter table daily_per_game_snapshot enable row level security;
alter table daily_per_affiliate_snapshot enable row level security;
alter table daily_redemption_rate_snapshot enable row level security;
```

### 14.3 Exports & subscriptions

```sql
create table exports (
  id              uuid primary key default gen_random_uuid(),
  admin_id        uuid not null references admins(id),

  export_type     text not null,
  query_spec      jsonb,

  status          text not null default 'pending' check (status in (
    'pending', 'running', 'complete', 'failed', 'expired'
  )),

  row_count       int,
  size_bytes      bigint,
  r2_key          text,
  download_url    text,
  expires_at      timestamptz,

  requires_review boolean not null default false,
  reviewed_by     uuid references admins(id),
  reviewed_at     timestamptz,

  reason          text,

  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now()
);

create index exports_admin_idx on exports(admin_id, created_at desc);
create index exports_status_idx on exports(status, created_at) where status in ('pending', 'running');
create index exports_review_idx on exports(created_at) where requires_review = true and reviewed_at is null;

create table report_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  admin_id        uuid not null references admins(id) on delete cascade,

  report_kind     text not null,
  query_spec      jsonb,

  schedule        text not null,
  email_to        text[] not null,
  email_subject   text,

  enabled         boolean not null default true,
  last_sent_at    timestamptz,
  next_due_at     timestamptz,

  created_at      timestamptz not null default now()
);

create index report_subscriptions_due_idx on report_subscriptions(next_due_at) where enabled = true;

alter table exports enable row level security;
alter table report_subscriptions enable row level security;
```

---

## 15. Migration Tracking, Tax Reports

```sql
create table migration_imports (
  id              uuid primary key default gen_random_uuid(),
  snapshot_date   date not null,
  source          text not null,

  table_name      text not null,
  rows_in_source  int not null,
  rows_imported   int not null,
  rows_skipped    int not null,
  rows_failed     int not null,

  status          text not null,
  error_summary   text,

  mapping_config  jsonb,

  started_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create table migration_id_map (
  source_table    text not null,
  gamma_id        text not null,
  casino_id       uuid not null,
  imported_at     timestamptz not null default now(),

  primary key (source_table, gamma_id)
);

create index migration_id_map_casino_idx on migration_id_map(casino_id);

create table migration_column_mappings (
  id              uuid primary key default gen_random_uuid(),
  source_file     text not null,
  source_column   text not null,
  target_table    text not null,
  target_column   text not null,

  transform       text,
  transform_expression text,

  notes           text,

  unique (source_file, source_column, target_table, target_column)
);

-- Seed (selection of key mappings; full set in Doc 13):
insert into migration_column_mappings (source_file, source_column, target_table, target_column, transform, notes) values
  ('players_data.csv', 'User Id',                'players', 'gamma_user_id',  'as-is',            'Preserve original Gamma ID'),
  ('players_data.csv', 'User email',             'players', 'email',          'lower',            null),
  ('players_data.csv', 'Username',               'players', 'username',       'dash_to_null',     'Gamma uses "-" for missing'),
  ('players_data.csv', 'Name',                   'players', 'display_name',   'dash_to_null',     null),
  ('players_data.csv', 'Registration Date',      'players', 'first_seen_at',  'parse_datetime',   'MM/DD/YYYY'),
  ('players_data.csv', 'Last Login',             'players', 'last_login_at',  'dash_to_null',     null),
  ('players_data.csv', 'rsg',                    'compliance_flags', null,    'parse_freetext',   'See parse_rsg_freetext() in Doc 13'),
  ('players_data.csv', 'Status',                 'players', 'status',         'parse_status',     null),
  ('purchase_report.csv', 'Total Reedemption Amount', 'player_lifetime_stats', 'total_redeemed_usd', 'as-is', 'Gamma typo "Reedemption"'),
  ('redeem_requests_data.csv', 'Payment Provider', 'redemptions', 'method',   'parse_method',     'BANK_ACCOUNT_FINIX → finix_ach'),
  ('redeem_requests_data.csv', 'Transaction Id',   'redemptions', 'finix_transfer_id', 'as-is',   null);

create table tax_reports (
  id                  uuid primary key default gen_random_uuid(),
  player_id           uuid not null references players(id) on delete restrict,

  tax_year            int not null,
  form_type           text not null,

  total_amount_usd    numeric(20,4) not null,
  redemption_count    int not null,

  status              text not null default 'pending_generation' check (status in (
    'pending_generation', 'generated', 'delivered', 'filed', 'cancelled'
  )),

  generated_at        timestamptz,
  delivered_at        timestamptz,
  filed_at            timestamptz,

  delivery_method     text,

  created_at          timestamptz not null default now(),

  unique (player_id, tax_year, form_type)
);

create index tax_reports_year_idx on tax_reports(tax_year, status);

alter table migration_imports enable row level security;
alter table migration_id_map enable row level security;
alter table migration_column_mappings enable row level security;
alter table tax_reports enable row level security;
```

---

## 16. Triggers, Rules, RLS Patterns

### 16.1 `updated_at` trigger

```sql
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Apply to every table with an updated_at column. Example:
create trigger players_updated_at before update on players
  for each row execute function set_updated_at();
-- Repeat for: wallets, kyc_status, packages, bonuses, promo_codes, tiers,
-- tier_progress, games, game_providers, aggregators, game_sessions,
-- email_templates, sms_templates, banners, site_content, affiliates,
-- affiliate_codes, affiliate_payouts, admin_roles, admins, house_accounts,
-- daily_operational_snapshots, exports, integration_health, bonuses_awarded,
-- promo_codes, purchases, redemptions, payment_instruments, crm_segments,
-- crm_campaigns, crm_flows
```

### 16.2 `ledger_entries` immutability

```sql
create rule ledger_entries_no_delete as on delete to ledger_entries do instead nothing;

create or replace function ledger_entries_update_guard() returns trigger as $$
begin
  if new.source            is distinct from old.source            or
     new.source_id         is distinct from old.source_id         or
     new.pair_id           is distinct from old.pair_id           or
     new.leg               is distinct from old.leg               or
     new.amount            is distinct from old.amount            or
     new.currency          is distinct from old.currency          or
     new.account_id        is distinct from old.account_id        or
     new.account_kind      is distinct from old.account_kind      or
     new.created_at        is distinct from old.created_at        or
     new.player_id         is distinct from old.player_id         or
     new.metadata::text    is distinct from old.metadata::text    or
     new.sub_bucket        is distinct from old.sub_bucket        or
     new.idempotency_key   is distinct from old.idempotency_key then
    raise exception 'Ledger entries are immutable except for balance_after';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger ledger_entries_immutable_guard
  before update on ledger_entries
  for each row execute function ledger_entries_update_guard();
```

### 16.3 `audit_log` immutability

```sql
create rule audit_log_no_update as on update to audit_log do instead nothing;
create rule audit_log_no_delete as on delete to audit_log do instead nothing;
```

### 16.4 Partition management

```sql
create or replace function create_monthly_partition(
  parent_table text,
  partition_date date
) returns void as $$
declare
  partition_name text;
  range_start date;
  range_end date;
begin
  range_start := date_trunc('month', partition_date)::date;
  range_end := (range_start + interval '1 month')::date;
  partition_name := parent_table || '_y' ||
    extract(year from range_start)::text || 'm' ||
    lpad(extract(month from range_start)::text, 2, '0');

  execute format(
    'create table if not exists %I partition of %I for values from (%L) to (%L)',
    partition_name, parent_table, range_start, range_end
  );
end;
$$ language plpgsql;

-- Worker job calls this monthly for: ledger_entries, game_rounds,
-- player_events, crm_message_log (3 months ahead).
```

### 16.5 RLS patterns

Apply across the schema. See Doc 09 §4 for full reasoning.

```sql
-- Pattern 1: Player-owned data (wallets, purchases, redemptions, etc.)
create policy {table}_player_read on {table} for select
  using (
    current_setting('app.actor_kind', true) = 'player'
    and player_id = current_setting('app.actor_id', true)::uuid
  );

create policy {table}_admin_read on {table} for select
  using (current_setting('app.actor_kind', true) = 'admin');

-- Pattern 2: Admin-only tables (audit_log, house_accounts, admins, etc.)
create policy {table}_admin_read on {table} for select
  using (current_setting('app.actor_kind', true) = 'admin');

-- Pattern 3: Ledger entries (player sees own wallet entries only)
create policy ledger_entries_player_read on ledger_entries for select
  using (
    current_setting('app.actor_kind', true) = 'player'
    and player_id = current_setting('app.actor_id', true)::uuid
    and account_kind = 'player_wallet'
  );

create policy ledger_entries_admin_read on ledger_entries for select
  using (current_setting('app.actor_kind', true) = 'admin');

-- Pattern 4: Public-read tables (games, packages, tiers — for lobby)
create policy {table}_public_read on {table} for select
  using (status = 'active');
```

Drizzle implementation: each schema file declares `pgPolicy()` definitions. Drizzle migration runner emits them.

---

## 17. Migration Order

Order in which Drizzle migrations should create tables. FKs spanning ordering boundaries are created in step 24 via ALTER TABLE ADD CONSTRAINT.

```
1.  Enums:
    player_status, bonus_type, ledger_leg, ledger_source, ledger_account_kind

2.  admins, admin_roles (seed 8 roles), admin_role_assignments,
    admin_permissions, admin_sessions

3.  house_accounts (seed 12 rows)

4.  aggregators (seed: alea), game_providers, games

5.  tiers (seed 6 default tiers)

6.  players (without attributed_affiliate_id FK)
    kyc_status (without manual_decision_by FK)
    tier_progress

7.  Player-referencing:
    compliance_flags (without admin FKs)
    geo_history

8.  packages (without bonus_id FK)
    bonuses
    bonuses_awarded (without awarded_by_admin FK)
    promo_codes (without created_by FK)

9.  affiliates, affiliate_codes, affiliate_attribution
    affiliate_payouts (without approved_by FK)

10. purchases (no admin FKs needed)
    payment_instruments
    redemptions (without admin FKs)
    promo_redemptions

11. game_sessions
    game_rounds (partitioned; create 3 initial partitions)

12. ledger_entries (partitioned; create 3 initial partitions)
    admin_adjustments (without admin FKs)

13. player_events (partitioned; create 3 initial partitions)
    player_lifetime_stats, player_30d_stats, player_game_stats,
    player_favorites

14. crm_segments (without created_by FK)
    crm_campaigns (without created_by FK)
    crm_flows (without created_by FK)
    crm_flow_steps, crm_flow_enrollments
    crm_message_log (partitioned; create 3 initial partitions)
    crm_suppression

15. Snapshots:
    daily_operational_snapshots, daily_per_state_snapshot,
    daily_per_game_snapshot, daily_per_affiliate_snapshot,
    daily_redemption_rate_snapshot

16. site_content (without updated_by FK)
    banners
    email_templates (without created_by FK)
    sms_templates (without created_by FK)
    notifications

17. blocked_emails, blocked_domains, blocked_ips, blocked_promo_codes
    (without added_by FKs)

18. integration_health (seed 9 rows), pending_webhooks, aml_review_queue

19. exports, report_subscriptions

20. tier_history

21. migration_imports, migration_id_map,
    migration_column_mappings (seed mappings)
    tax_reports

22. audit_log

23. admin_dashboard_layouts, admin_saved_views, admin_notes,
    custom_query_definitions

24. ALTER TABLE ADD CONSTRAINT migrations (run AFTER all tables exist):
    players.attributed_affiliate_id → affiliates(id)
    kyc_status.manual_decision_by → admins(id)
    compliance_flags.created_by → admins(id)
    compliance_flags.cleared_by → admins(id)
    packages.bonus_id → bonuses(id)
    bonuses_awarded.awarded_by_admin → admins(id)
    promo_codes.created_by → admins(id)
    affiliate_payouts.approved_by → admins(id)
    admin_adjustments.admin_id → admins(id)
    admin_adjustments.approved_by → admins(id)
    redemptions.approved_by → admins(id)
    redemptions.rejected_by → admins(id)
    site_content.updated_by → admins(id)
    email_templates.created_by → admins(id)
    sms_templates.created_by → admins(id)
    blocked_emails.added_by → admins(id)
    blocked_domains.added_by → admins(id)
    blocked_ips.added_by → admins(id)
    blocked_promo_codes.added_by → admins(id)
    crm_segments.created_by → admins(id)
    crm_campaigns.created_by → admins(id)
    crm_flows.created_by → admins(id)
    aml_review_queue.resolved_by → admins(id)

25. Apply all triggers from §16.1, §16.2, §16.3, §16.4

26. Apply all RLS policies using patterns from §16.5

27. Seed the bootstrap master admin user
    (Email + bcrypt password hash provided at migration time)
```

---

## 18. Size Projections (5M signups, 5-year horizon)

| Table                         | Rows/month | Year 1 storage | Year 5 storage |
| ----------------------------- | ---------- | -------------- | -------------- |
| players                       | ~100k      | 200MB          | 6GB            |
| wallets                       | ~200k      | 100MB          | 1GB            |
| purchases                     | ~500k      | 1GB            | 30GB           |
| redemptions                   | ~200k      | 500MB          | 15GB           |
| bonuses_awarded               | ~5M        | 5GB            | 150GB          |
| ledger_entries (partitioned)  | ~100M      | 100GB          | 6TB            |
| game_rounds (partitioned)     | ~30M       | 30GB           | 1.8TB          |
| player_events (partitioned)   | ~200M      | 150GB          | 9TB            |
| crm_message_log (partitioned) | ~100M      | 80GB           | 5TB            |
| audit_log                     | ~5M        | 10GB           | 300GB          |
| geo_history                   | ~5M        | 4GB            | 120GB          |
| daily_operational_snapshots   | 30         | 200KB          | 50MB           |

**Year 1 total:** ~380GB
**Year 5 total:** ~22TB

Neon Scale autoscales. Partition detachment at 13 months keeps hot data under 5TB indefinitely.

---

## 19. Drizzle Implementation Notes

1. **Use `pg-core`** — never mysql-core.

2. **bigint mode for money columns:**

   ```typescript
   amount: numeric('amount', { precision: 20, scale: 4 }).$type<bigint>().notNull()
   ```

3. **Partition tables** — Drizzle doesn't natively support PARTITION BY syntax. Use raw SQL migrations for partition creation. Drizzle types for queries.

4. **RLS policies** — use `pgPolicy()` helper, or emit raw SQL in migrations.

5. **Composite primary keys** (partitioned tables):

   ```typescript
   primaryKey({ columns: [table.id, table.createdAt] })
   ```

6. **Connection client** at `packages/db/src/client.ts`:

   ```typescript
   import { drizzle } from 'drizzle-orm/postgres-js'
   import postgres from 'postgres'

   // Pooled (for app runtime)
   const pool = postgres(env.DATABASE_URL, { max: 20 })
   export const db = drizzle(pool, { schema })

   // Direct (for migrations; Drizzle Kit can't use pooler)
   // Used by drizzle-kit migrate via env.DATABASE_URL_DIRECT
   ```

7. **The `withActor` helper:**

   ```typescript
   export async function withActor<T>(
     actorId: string,
     actorKind: 'player' | 'admin' | 'system',
     actorRole: string | null,
     fn: (tx: typeof db) => Promise<T>,
   ): Promise<T> {
     return db.transaction(async (tx) => {
       await tx.execute(sql`SET LOCAL app.actor_id = ${actorId}`)
       await tx.execute(sql`SET LOCAL app.actor_kind = ${actorKind}`)
       if (actorRole) await tx.execute(sql`SET LOCAL app.actor_role = ${actorRole}`)
       return fn(tx)
     })
   }
   ```

8. **Migration commands:**
   ```bash
   pnpm db:generate    # drizzle-kit generate
   pnpm db:migrate     # apply migrations to DATABASE_URL_DIRECT
   pnpm db:studio      # open Drizzle Studio
   ```

---

## 20. What's Deferred to Domain Docs

- Ledger write algorithm — Doc 04 §4
- Webhook event handlers — Doc 05
- Bonus engine logic — Doc 06 §4
- Redemption state machine — Doc 07 §2
- RLS policy reasoning — Doc 09 §4
- Performance tuning — Doc 04 §8, Doc 12 §11
- Migration column transforms — Doc 13 §3

This document is the schema. Domain docs are the behavior.
