-- =============================================================================
-- Frenzy Creator — RLS Lockdown: Deny ALL public/anon access to sensitive tables
--
-- After this migration the Supabase anon key can only read:
--   • site_content  (public CMS content)
--   • settings      (public settings)
--   • admins        (admin login fallback — consider locking down later)
--
-- All other data access goes through server-side API endpoints that use the
-- service_role key and validate session tokens before returning scoped data.
-- =============================================================================

-- ── 1. players ───────────────────────────────────────────────────────────────
drop policy if exists "Allow all operations on players" on public.players;
drop policy if exists "players_no_anon_access"           on public.players;
drop policy if exists "players_anon_select"              on public.players;
drop policy if exists "players_self_read"                on public.players;

create policy "players_deny_all"
  on public.players for all to public using (false);

-- ── 2. ngr_data ──────────────────────────────────────────────────────────────
drop policy if exists "Allow all operations on ngr_data" on public.ngr_data;
drop policy if exists "ngr_data_no_anon_access"          on public.ngr_data;
drop policy if exists "ngr_data_anon_select"             on public.ngr_data;
drop policy if exists "ngr_data_self_read"               on public.ngr_data;

create policy "ngr_data_deny_all"
  on public.ngr_data for all to public using (false);

-- ── 3. payouts ───────────────────────────────────────────────────────────────
drop policy if exists "Allow all operations on payouts" on public.payouts;
drop policy if exists "payouts_no_anon_access"          on public.payouts;
drop policy if exists "payouts_anon_select"             on public.payouts;
drop policy if exists "payouts_self_read"               on public.payouts;

create policy "payouts_deny_all"
  on public.payouts for all to public using (false);

-- ── 4. level2_relationships ──────────────────────────────────────────────────
drop policy if exists "Allow all operations on level2_relationships" on public.level2_relationships;
drop policy if exists "l2_no_anon_access"   on public.level2_relationships;
drop policy if exists "l2_anon_select"      on public.level2_relationships;
drop policy if exists "l2_public_read"      on public.level2_relationships;
drop policy if exists "l2_anon_insert"      on public.level2_relationships;
drop policy if exists "l2_anon_update"      on public.level2_relationships;
drop policy if exists "l2_anon_delete"      on public.level2_relationships;

create policy "l2_deny_all"
  on public.level2_relationships for all to public using (false);

-- ── 5. users ─────────────────────────────────────────────────────────────────
drop policy if exists "Allow public read"   on public.users;
drop policy if exists "Allow public insert" on public.users;
drop policy if exists "Allow public update" on public.users;
drop policy if exists "Allow read"          on public.users;
drop policy if exists "Allow signup"        on public.users;
drop policy if exists "users_no_anon_select"      on public.users;
drop policy if exists "users_no_anon_update"      on public.users;
drop policy if exists "users_anon_insert_pending" on public.users;
drop policy if exists "users_anon_select"         on public.users;
drop policy if exists "users_self_read"           on public.users;
drop policy if exists "users_anon_update"         on public.users;
drop policy if exists "users_self_update"         on public.users;
drop policy if exists "users_anon_insert"         on public.users;

create policy "users_deny_all"
  on public.users for all to public using (false);

-- ── 6. affiliate_notes (if exists) ──────────────────────────────────────────
drop policy if exists "Allow all operations on affiliate_notes" on public.affiliate_notes;

do $$ begin
  if exists (select 1 from pg_tables where tablename = 'affiliate_notes') then
    execute 'create policy "affiliate_notes_deny_all" on public.affiliate_notes for all to public using (false)';
  end if;
end $$;
