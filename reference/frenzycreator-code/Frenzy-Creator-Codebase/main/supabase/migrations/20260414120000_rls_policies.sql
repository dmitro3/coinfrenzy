-- =============================================================================
-- Frenzy Creator — Tightened RLS Policies + Schema Constraints
-- Run after 20260101000000_base_schema.sql
--
-- Changes from the base schema:
--   1. Drop all using (true) policies on sensitive tables and replace them
--      with appropriately locked-down policies.
--   2. Drop admins anon read entirely — admin login now goes through
--      POST /api/admin/session (server-side service role only).
--   3. Add CHECK constraints to status/role columns.
--   4. Add missing indexes.
--   5. Add explicit affiliate_notes policy for anon.
-- =============================================================================

-- ── 1. admins — remove ALL anon access ───────────────────────────────────────
-- Admin credentials must only ever be read server-side via service role key.
-- The browser reads the admins table directly in the original design; the new
-- POST /api/admin/session endpoint replaces this entirely.

drop policy if exists "admins_anon_read" on public.admins;

-- Service role bypasses RLS; no anon policies needed.
-- To make the intent explicit, add a deny-all for anon:
create policy "admins_no_anon_access"
  on public.admins
  for all
  to anon
  using (false);

-- ── 2. users — lock down write access ────────────────────────────────────────
-- The base schema had using (true) for SELECT and UPDATE, allowing any anon
-- client to read or overwrite any user row.
-- Until Supabase Auth is adopted there is no auth.uid(); writes are routed
-- through server-side API routes that use the service role key.

drop policy if exists "users_self_read"   on public.users;
drop policy if exists "users_self_update" on public.users;

-- Anon can SELECT — the partner dashboard needs to read its own row and
-- check other rows for duplicate email/phone during registration.
-- This is still broad; the long-term fix is Supabase Auth + email-scoped policy.
create policy "users_anon_select"
  on public.users for select
  to anon
  using (true);

-- Anon INSERT allowed only for registration (new users insert their own row).
-- Status is forced to 'pending' by WITH CHECK so no self-promotion is possible.
create policy "users_anon_insert"
  on public.users for insert
  to anon
  with check (status = 'pending');

-- Anon UPDATE is kept but constrained: status must remain the same value it
-- already has (prevents self-promotion). This is needed because admin.html
-- uses the Supabase anon-key client to patch user rows directly.
-- Long-term fix: route all admin writes through server-side API endpoints
-- that use the service role key, then drop this policy.
create policy "users_anon_update"
  on public.users for update
  to anon
  using (true)
  with check (status = (select status from public.users where email = users.email limit 1));

-- ── 3. players — read-only for anon ──────────────────────────────────────────
drop policy if exists "players_self_read" on public.players;

create policy "players_anon_select"
  on public.players for select
  to anon
  using (true);

-- Inserts and updates to players go through the webhook (service role only).

-- ── 4. ngr_data — read-only for anon ─────────────────────────────────────────
drop policy if exists "ngr_data_self_read" on public.ngr_data;

create policy "ngr_data_anon_select"
  on public.ngr_data for select
  to anon
  using (true);

-- ── 5. payouts — read-only for anon ─────────────────────────────────────────
drop policy if exists "payouts_self_read" on public.payouts;

create policy "payouts_anon_select"
  on public.payouts for select
  to anon
  using (true);

-- ── 6. level2_relationships — read-only for anon ────────────────────────────
drop policy if exists "l2_public_read" on public.level2_relationships;

create policy "l2_anon_select"
  on public.level2_relationships for select
  to anon
  using (true);

-- ── 7. affiliate_notes — no anon access (admin-only via service role) ────────
-- Base schema enabled RLS but added no policies, making the implicit block
-- explicit here so behaviour is documented and intentional.
create policy "affiliate_notes_no_anon_access"
  on public.affiliate_notes
  for all
  to anon
  using (false);

-- ── 8. CHECK constraints on status / role columns ───────────────────────────
-- Prevent garbage values reaching the DB from any path.

alter table public.users
  add constraint users_status_check
  check (status in ('pending', 'approved', 'denied', 'suspended', 'revision_required'));

alter table public.admins
  add constraint admins_role_check
  check (role in ('master', 'admin'));

alter table public.players
  add constraint players_status_check
  check (status in ('active', 'inactive', 'banned'));

alter table public.payouts
  add constraint payouts_status_check
  check (status in ('paid', 'pending', 'failed'));

-- ── 9. Missing indexes ────────────────────────────────────────────────────────
create index if not exists users_coinfrenzy_affiliate_id_idx
  on public.users(coinfrenzy_affiliate_id)
  where coinfrenzy_affiliate_id is not null;

create index if not exists users_casino_referral_code_idx
  on public.users(casino_referral_code)
  where casino_referral_code is not null;

create index if not exists players_affiliate_username_idx
  on public.players(affiliate_username)
  where affiliate_username is not null;

-- ── Note on 20260413140000_coinfrenzy_affiliate_id ───────────────────────────
-- That migration runs ADD COLUMN IF NOT EXISTS coinfrenzy_affiliate_id, which
-- is now redundant because the base schema (20260101000000) already declares
-- it. It is harmless and can be left in place for existing DB instances that
-- predated the base schema migration.
