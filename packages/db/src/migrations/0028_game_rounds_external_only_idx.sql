-- docs/03 §4.5 / docs/05 §5.5 — cross-partition index fixes for Alea callback latency.
--
-- Both game_rounds and ledger_entries are partitioned by created_at (monthly).
-- Any query that filters only by external_round_id or (source, source_id) WITHOUT
-- including created_at forces a full sequential scan across every monthly partition,
-- causing the round.bet / round.win handlers to take 9+ seconds.
--
-- PostgreSQL 11+ supports plain (non-partition-key) indexes on partitioned tables.
-- These are created once on the parent and automatically applied to all existing
-- and future child partitions.

-- 1. Plain index on game_rounds.external_round_id.
--    The existing UNIQUE index is ON (external_round_id, created_at) — that index
--    cannot be used for queries without created_at. This new plain index covers the
--    idempotency lookup in round-bet and the round lookup in round-win/round-refund.
CREATE INDEX IF NOT EXISTS "game_rounds_external_only_idx"
  ON "game_rounds" USING btree ("external_round_id");
--> statement-breakpoint

-- 2. Recreate ledger_entries_source_idx to guarantee it is present as a
--    global index across all partitions (the original may have been created
--    before partitions were attached, leaving it on the shell only).
--    The handler's dedup check (write.ts Step 2) queries:
--      WHERE source = 'bet' AND source_id = $roundId
--    which must not scan all partitions.
DROP INDEX IF EXISTS "ledger_entries_source_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_source_idx"
  ON "ledger_entries" USING btree ("source", "source_id");
