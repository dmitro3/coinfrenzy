CREATE INDEX IF NOT EXISTS "ledger_entries_alea_tx_idx" ON "ledger_entries" USING btree ((metadata->>'tx_id')) WHERE source in ('bet', 'win');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_alea_rollback_round_idx" ON "audit_log" USING btree ((metadata->>'round_id')) WHERE action = 'webhook.alea.round_rollback';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_alea_original_tx_idx" ON "audit_log" USING btree ((metadata->>'original_tx_id')) WHERE action = 'webhook.alea.round_rollback';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_alea_pending_rollback_original_tx_idx" ON "audit_log" USING btree ((metadata->>'original_tx_id')) WHERE action = 'webhook.alea.pending_rollback';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_alea_rollback_tx_idx" ON "audit_log" USING btree ((metadata->>'rollback_tx_id')) WHERE action = 'webhook.alea.round_rollback';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_alea_tx_idx" ON "audit_log" USING btree ((metadata->>'tx_id')) WHERE action in ('webhook.alea.round_bet', 'webhook.alea.round_win');
