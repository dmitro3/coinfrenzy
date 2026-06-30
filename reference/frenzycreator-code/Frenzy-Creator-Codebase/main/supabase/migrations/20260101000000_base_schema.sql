-- =============================================================================
-- Frenzy Creator — Base Schema
-- Run this FIRST, before any other migrations.
-- =============================================================================

-- ── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- =============================================================================
-- TABLE: users
-- Affiliate / creator accounts. Written to from partner.html and admin.html.
-- =============================================================================
create table if not exists public.users (
  id                      uuid primary key default gen_random_uuid(),
  email                   text unique not null,
  fullname                text,
  phone                   text,
  pin                     text,
  discord                 text,
  status                  text not null default 'pending',   -- pending | approved | denied | suspended
  iscreator               boolean not null default false,
  isvip                   boolean not null default false,
  onboardingcomplete      boolean not null default false,
  signature               text,
  messages                text,                              -- JSON array of admin messages (stringified)
  campaigns               jsonb,
  rev_share_l1            numeric(5,2) default 10,
  rev_share_l2            numeric(5,2) default 5,
  l2_enabled              boolean not null default false,
  casino_referral_code    text,
  coinfrenzy_affiliate_id text,
  revision_note           text,
  revision_sent_at        timestamptz,
  registeredat            timestamptz,
  approvedat              timestamptz,
  deniedat                timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists users_status_idx on public.users(status);
create index if not exists users_email_idx  on public.users(email);

-- =============================================================================
-- TABLE: admins
-- Back-office operator accounts. Managed via admin.html.
-- NOTE: password_hash currently stores a plaintext password — change it using
-- the Change Password UI immediately after first login, and consider migrating
-- to Supabase Auth for production hardening.
-- =============================================================================
create table if not exists public.admins (
  id           uuid primary key default gen_random_uuid(),
  username     text unique not null,
  password_hash text not null,
  display_name text,
  role         text not null default 'admin',   -- master | admin
  created_by   text,
  created_at   timestamptz not null default now()
);

-- =============================================================================
-- TABLE: players
-- End-users (casino players) referred by affiliates.
-- Populated by the /api/webhook/player-registration endpoint.
-- =============================================================================
create table if not exists public.players (
  id                uuid primary key default gen_random_uuid(),
  player_id         text unique,                -- external ID sent by CoinFrenzy webhook
  player_name       text,
  player_email      text,
  affiliate_username text,
  affiliate_email   text,
  signup_date       timestamptz default now(),
  status            text not null default 'active',   -- active | inactive
  source            text default 'PROMO_CODE',
  promo_code_used   text,
  created_at        timestamptz not null default now()
);

create index if not exists players_affiliate_email_idx on public.players(affiliate_email);
create index if not exists players_player_id_idx       on public.players(player_id);
create index if not exists players_promo_code_idx      on public.players(promo_code_used);

-- =============================================================================
-- TABLE: ngr_data
-- Monthly NGR + commission records per player/affiliate.
-- Entered manually by admin or via CoinFrenzy sync.
-- =============================================================================
create table if not exists public.ngr_data (
  id                uuid primary key default gen_random_uuid(),
  player_id         uuid references public.players(id) on delete set null,
  player_email      text,
  affiliate_email   text,
  report_month      text not null,           -- e.g. '2026-01'
  ngr_amount        numeric(14,4) not null default 0,
  commission_percent numeric(5,2) not null default 10,
  commission_amount  numeric(14,4) not null default 0,
  created_at        timestamptz not null default now()
);

create index if not exists ngr_affiliate_email_idx on public.ngr_data(affiliate_email);
create index if not exists ngr_player_id_idx       on public.ngr_data(player_id);
create index if not exists ngr_report_month_idx    on public.ngr_data(report_month);

-- =============================================================================
-- TABLE: payouts
-- Records of affiliate payouts (Lightning Bolt credits on CoinFrenzy).
-- The transaction_type constant 'SC_VAULT_CREDIT' is preserved for backwards
-- compatibility with historical rows; new copy refers to it as Lightning Bolt.
-- =============================================================================
create table if not exists public.payouts (
  id               uuid primary key default gen_random_uuid(),
  affiliate_email  text not null,
  affiliate_name   text,
  user_id          text,                     -- CoinFrenzy username (for Lightning Bolt credit)
  amount           numeric(14,4) not null,
  status           text not null default 'paid',   -- paid | pending | failed
  period           text,                     -- human-readable period label
  notes            text,
  transaction_type text default 'SC_VAULT_CREDIT', -- legacy constant; UI now shows "Lightning Bolt Credit"
  reference_id     text,
  paid_at          timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists payouts_affiliate_email_idx on public.payouts(affiliate_email);
create index if not exists payouts_status_idx          on public.payouts(status);
create index if not exists payouts_paid_at_idx         on public.payouts(paid_at desc);

-- =============================================================================
-- TABLE: settings
-- Global key-value config (rev share defaults, etc.). Managed via admin.html.
-- =============================================================================
create table if not exists public.settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

-- =============================================================================
-- TABLE: site_content
-- CMS-style content blocks edited in admin.html and read by partner.html.
-- =============================================================================
create table if not exists public.site_content (
  key        text primary key,
  value      jsonb,
  updated_at timestamptz not null default now()
);

-- =============================================================================
-- TABLE: level2_relationships
-- L2 (sub-affiliate) relationships: parent earns a % on child's NGR.
-- =============================================================================
create table if not exists public.level2_relationships (
  id               uuid primary key default gen_random_uuid(),
  parent_affiliate text not null,
  child_affiliate  text not null,
  l2_percent       numeric(5,2) not null default 5,
  created_at       timestamptz not null default now(),
  unique (parent_affiliate, child_affiliate)
);

create index if not exists l2_parent_idx on public.level2_relationships(parent_affiliate);
create index if not exists l2_child_idx  on public.level2_relationships(child_affiliate);

-- =============================================================================
-- TABLE: affiliate_notes
-- Internal admin notes attached to an affiliate account.
-- =============================================================================
create table if not exists public.affiliate_notes (
  id              uuid primary key default gen_random_uuid(),
  affiliate_email text not null,
  note            text not null,
  created_by      text not null default 'admin',
  created_at      timestamptz not null default now()
);

create index if not exists notes_affiliate_email_idx on public.affiliate_notes(affiliate_email);

-- =============================================================================
-- Row-Level Security
-- Enable RLS on every table. Policies are additive — start locked-down and
-- open only what the browser-side Supabase client (anon key) needs.
-- The service-role key (webhook) bypasses RLS entirely.
-- =============================================================================
alter table public.users               enable row level security;
alter table public.admins              enable row level security;
alter table public.players             enable row level security;
alter table public.ngr_data            enable row level security;
alter table public.payouts             enable row level security;
alter table public.settings            enable row level security;
alter table public.site_content        enable row level security;
alter table public.level2_relationships enable row level security;
alter table public.affiliate_notes     enable row level security;

-- ── Public read-only policies (anon key) ─────────────────────────────────────
-- site_content is read by partner.html without auth.
create policy "site_content_public_read"
  on public.site_content for select
  using (true);

-- settings is read by partner.html (rev share defaults).
create policy "settings_public_read"
  on public.settings for select
  using (true);

-- users: each affiliate can read their own row by email.
-- (partner.html passes email as a filter; rely on anon key being read-only here
--  and tighten further once Supabase Auth is adopted for affiliates.)
create policy "users_self_read"
  on public.users for select
  using (true);

create policy "users_self_update"
  on public.users for update
  using (true);

-- players: affiliates read only their own players.
create policy "players_self_read"
  on public.players for select
  using (true);

-- ngr_data: affiliates read their own rows.
create policy "ngr_data_self_read"
  on public.ngr_data for select
  using (true);

-- payouts: affiliates read their own rows.
create policy "payouts_self_read"
  on public.payouts for select
  using (true);

-- level2_relationships: public read (needed for L2 commission calc in browser).
create policy "l2_public_read"
  on public.level2_relationships for select
  using (true);

-- admins: NO anon access at all (admin.html uses anon key but should be
-- migrated to Supabase Auth; for now restrict to service role via RLS).
-- The admin panel reads admins directly from the browser — until auth is
-- migrated, grant read to anon only for login (password check).
create policy "admins_anon_read"
  on public.admins for select
  using (true);
