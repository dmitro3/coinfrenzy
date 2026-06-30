-- =============================================================================
-- One-shot: place zachzona@gmail.com under michaelpatjane@gmail.com
-- =============================================================================
-- Zach signed up without a referral and was sitting "direct under
-- CoinFrenzy" (no row in level2_relationships). Michael should be his
-- sponsor going forward, so Michael's partner dashboard sees Zach as a
-- L2 sub-affiliate and earns L2 commission on Zach's network NGR.
--
-- This is the same operation now exposed in admin via the "Change
-- sponsor" modal (POST /api/admin/set-sponsor) — kept here as a
-- migration so the move is idempotent across environments without
-- requiring a manual click in production admin.
-- =============================================================================

-- Defensive cleanup: if Zach somehow already has a parent, drop it.
-- The unique constraint on (parent, child) plus a fresh insert means
-- we'd otherwise get a conflict if he was already under Michael.
delete from public.level2_relationships
where lower(child_affiliate) = lower('zachzona@gmail.com');

-- Insert the new sponsor relationship at the global default L2 % so
-- Michael's commission scales with whatever the org-wide rate is at
-- the time the row is read (rev_share_l2_default lives in `settings`).
-- We don't pin a specific rate here because admin can later tune it
-- per-relationship via the affiliate detail UI.
insert into public.level2_relationships (parent_affiliate, child_affiliate, l2_percent)
select
  'michaelpatjane@gmail.com',
  'zachzona@gmail.com',
  coalesce((select (value)::numeric from public.settings where key = 'rev_share_l2_default' limit 1), 5)
where exists (select 1 from public.users where lower(email) = lower('michaelpatjane@gmail.com'))
  and exists (select 1 from public.users where lower(email) = lower('zachzona@gmail.com'));

-- Make sure Michael's L2 features are turned on so his partner
-- dashboard immediately surfaces the sub-affiliate breakdown.
update public.users
   set l2_enabled = true
 where lower(email) = lower('michaelpatjane@gmail.com');
