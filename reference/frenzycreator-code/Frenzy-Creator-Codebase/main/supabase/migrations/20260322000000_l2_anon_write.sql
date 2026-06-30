-- Allow anon key to insert, update, and delete level2_relationships
-- (admin.html uses the anon key for all L2 operations).

create policy if not exists "l2_anon_insert"
  on public.level2_relationships for insert
  to anon
  with check (true);

create policy if not exists "l2_anon_update"
  on public.level2_relationships for update
  to anon
  using (true);

create policy if not exists "l2_anon_delete"
  on public.level2_relationships for delete
  to anon
  using (true);

-- Also ensure affiliate_notes can be written by the admin anon client
drop policy if exists "affiliate_notes_no_anon_access" on public.affiliate_notes;

create policy "affiliate_notes_anon_select"
  on public.affiliate_notes for select
  to anon
  using (true);

create policy "affiliate_notes_anon_insert"
  on public.affiliate_notes for insert
  to anon
  with check (true);

create policy "affiliate_notes_anon_delete"
  on public.affiliate_notes for delete
  to anon
  using (true);
