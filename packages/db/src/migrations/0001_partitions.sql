-- docs/03 §3.2, §4.5, §8.1, §9.4 — initial month partitions for the four
-- partitioned tables. Subsequent partitions are created 3 months ahead by an
-- Inngest cron job that calls create_monthly_partition() (defined in 0003).

CREATE TABLE IF NOT EXISTS "ledger_entries_y2026m05" PARTITION OF "ledger_entries"
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ledger_entries_y2026m06" PARTITION OF "ledger_entries"
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ledger_entries_y2026m07" PARTITION OF "ledger_entries"
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "game_rounds_y2026m05" PARTITION OF "game_rounds"
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "game_rounds_y2026m06" PARTITION OF "game_rounds"
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "game_rounds_y2026m07" PARTITION OF "game_rounds"
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "player_events_y2026m05" PARTITION OF "player_events"
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "player_events_y2026m06" PARTITION OF "player_events"
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "player_events_y2026m07" PARTITION OF "player_events"
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "crm_message_log_y2026m05" PARTITION OF "crm_message_log"
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_message_log_y2026m06" PARTITION OF "crm_message_log"
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_message_log_y2026m07" PARTITION OF "crm_message_log"
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
