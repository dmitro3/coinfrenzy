-- =============================================================================
-- Frenzy Creator — Attribution Audit Log
--
-- Every time the reconcile-attribution job (or any future code path) writes
-- to players.affiliate_email or ngr_data.affiliate_email, it records the
-- before/after values + actor here. This lets us prove, at any point, that
-- no money has moved between affiliates without a recorded reason.
--
-- The table is service-role write only — anon clients can't tamper with it.
-- Admin UIs read it via server-side API routes.
-- =============================================================================

create table if not exists public.attribution_audit_log (
  id           uuid primary key default gen_random_uuid(),
  table_name   text not null,                            -- 'players' | 'ngr_data'
  row_id       text not null,                            -- the affected row's primary key
  field        text not null default 'affiliate_email',  -- always affiliate_email today; future-proofed
  old_value    text,                                     -- null = was unattributed
  new_value    text,
  actor        text not null,                            -- admin username/email that triggered it
  source       text not null,                            -- 'reconcile-attribution' | 'self-heal' | etc
  status       text not null,                            -- 'applied' | 'skipped-race-loss' | 'refused-...' | 'error'
  error        text,
  created_at   timestamptz not null default now()
);

create index if not exists attribution_audit_table_row_idx on public.attribution_audit_log(table_name, row_id);
create index if not exists attribution_audit_actor_idx     on public.attribution_audit_log(actor);
create index if not exists attribution_audit_created_idx   on public.attribution_audit_log(created_at desc);

-- RLS: anon CANNOT touch this table at all. All writes go through service
-- role from API routes; all admin reads also go through API routes.
alter table public.attribution_audit_log enable row level security;

drop policy if exists "attribution_audit_no_anon" on public.attribution_audit_log;
create policy "attribution_audit_no_anon"
  on public.attribution_audit_log
  for all
  to anon
  using (false);
