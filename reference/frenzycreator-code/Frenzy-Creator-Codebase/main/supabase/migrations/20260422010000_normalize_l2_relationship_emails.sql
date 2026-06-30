-- =============================================================================
-- Normalize level2_relationships emails to lowercase
-- =============================================================================
-- Several admin queries against this table use case-sensitive `.eq()`
-- on parent_affiliate / child_affiliate (e.g. the Network Total tile,
-- Affiliate Leaderboard L2 rollups). Any row stored with mixed-case
-- emails — possible from the older Add Sub-Affiliate flow that took
-- the casing from the users table — is silently invisible to those
-- tiles even when the relationship genuinely exists.
--
-- This one-shot backfill lowercases every email in the table so the
-- canonical convention used everywhere else in the codebase (norm() →
-- lowercase) holds for relationships too. /api/admin/set-sponsor was
-- updated to insert lowercase from now on; this migration heals
-- anything inserted before that fix.
--
-- Idempotent: re-running on already-lowercased data is a no-op.
-- =============================================================================

update public.level2_relationships
   set parent_affiliate = lower(parent_affiliate)
 where parent_affiliate <> lower(parent_affiliate);

update public.level2_relationships
   set child_affiliate = lower(child_affiliate)
 where child_affiliate <> lower(child_affiliate);
