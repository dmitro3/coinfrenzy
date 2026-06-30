-- docs/03 §16.5 + docs/09 §4 — Row Level Security: enable + policies.
-- Default behavior (no matching policy on an RLS-enabled table) is deny.
--
-- Actor identification: app.actor_kind ∈ {'player','admin','system'} and
-- app.actor_id are set per request via withActor() in @coinfrenzy/db.
-- The 'system' actor uses a service-role DB user that bypasses RLS at the
-- connection level (BYPASSRLS) — no `system` policies needed here.

-- ============================================================================
-- Enable RLS on every table.
-- ============================================================================

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'players','wallets','kyc_status','compliance_flags','geo_history',
    'house_accounts','ledger_entries','admin_adjustments',
    'aggregators','game_providers','games','game_sessions','game_rounds',
    'tiers','tier_progress','tier_history','packages','bonuses','bonuses_awarded',
    'promo_codes','promo_redemptions',
    'affiliates','affiliate_codes','affiliate_attribution','affiliate_payouts',
    'purchases','payment_instruments','redemptions',
    'player_events','player_lifetime_stats','player_30d_stats','player_game_stats',
    'crm_segments','crm_campaigns','crm_flows','crm_flow_steps','crm_flow_enrollments',
    'crm_message_log','crm_suppression',
    'admins','admin_roles','admin_role_assignments','admin_permissions','admin_sessions',
    'admin_dashboard_layouts','admin_saved_views','admin_notes','custom_query_definitions',
    'audit_log',
    'site_content','banners','email_templates','sms_templates','notifications',
    'blocked_emails','blocked_domains','blocked_ips','blocked_promo_codes',
    'integration_health','pending_webhooks','aml_review_queue',
    'daily_operational_snapshots','daily_per_state_snapshot','daily_per_game_snapshot',
    'daily_per_affiliate_snapshot','daily_redemption_rate_snapshot',
    'exports','report_subscriptions',
    'migration_imports','migration_id_map','migration_column_mappings','tax_reports'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END
$$;
--> statement-breakpoint

-- ============================================================================
-- Pattern 1: Player-owned tables. Player can SELECT their own rows. Admins
-- (with any whitelisted role) can SELECT all.
-- Writes are denied at the RLS layer — the service layer holds the write path.
-- ============================================================================

-- wallets
CREATE POLICY "wallets_player_read" ON "wallets" FOR SELECT
  USING (
    current_setting('app.actor_kind', true) = 'player'
    AND player_id::text = current_setting('app.actor_id', true)
  );
--> statement-breakpoint
CREATE POLICY "wallets_admin_read" ON "wallets" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint

-- purchases
CREATE POLICY "purchases_player_read" ON "purchases" FOR SELECT
  USING (
    current_setting('app.actor_kind', true) = 'player'
    AND player_id::text = current_setting('app.actor_id', true)
  );
--> statement-breakpoint
CREATE POLICY "purchases_admin_read" ON "purchases" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint

-- redemptions
CREATE POLICY "redemptions_player_read" ON "redemptions" FOR SELECT
  USING (
    current_setting('app.actor_kind', true) = 'player'
    AND player_id::text = current_setting('app.actor_id', true)
  );
--> statement-breakpoint
CREATE POLICY "redemptions_admin_read" ON "redemptions" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint

-- bonuses_awarded
CREATE POLICY "bonuses_awarded_player_read" ON "bonuses_awarded" FOR SELECT
  USING (
    current_setting('app.actor_kind', true) = 'player'
    AND player_id::text = current_setting('app.actor_id', true)
  );
--> statement-breakpoint
CREATE POLICY "bonuses_awarded_admin_read" ON "bonuses_awarded" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint

-- notifications
CREATE POLICY "notifications_player_read" ON "notifications" FOR SELECT
  USING (
    current_setting('app.actor_kind', true) = 'player'
    AND player_id::text = current_setting('app.actor_id', true)
  );
--> statement-breakpoint
CREATE POLICY "notifications_admin_read" ON "notifications" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint

-- compliance_flags
CREATE POLICY "compliance_flags_player_read" ON "compliance_flags" FOR SELECT
  USING (
    current_setting('app.actor_kind', true) = 'player'
    AND player_id::text = current_setting('app.actor_id', true)
  );
--> statement-breakpoint
CREATE POLICY "compliance_flags_admin_read" ON "compliance_flags" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint

-- payment_instruments
CREATE POLICY "payment_instruments_player_read" ON "payment_instruments" FOR SELECT
  USING (
    current_setting('app.actor_kind', true) = 'player'
    AND player_id::text = current_setting('app.actor_id', true)
  );
--> statement-breakpoint
CREATE POLICY "payment_instruments_admin_read" ON "payment_instruments" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint

-- promo_redemptions
CREATE POLICY "promo_redemptions_player_read" ON "promo_redemptions" FOR SELECT
  USING (
    current_setting('app.actor_kind', true) = 'player'
    AND player_id::text = current_setting('app.actor_id', true)
  );
--> statement-breakpoint
CREATE POLICY "promo_redemptions_admin_read" ON "promo_redemptions" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint

-- geo_history
CREATE POLICY "geo_history_player_read" ON "geo_history" FOR SELECT
  USING (
    current_setting('app.actor_kind', true) = 'player'
    AND player_id::text = current_setting('app.actor_id', true)
  );
--> statement-breakpoint
CREATE POLICY "geo_history_admin_read" ON "geo_history" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint

-- kyc_status
CREATE POLICY "kyc_status_player_read" ON "kyc_status" FOR SELECT
  USING (
    current_setting('app.actor_kind', true) = 'player'
    AND player_id::text = current_setting('app.actor_id', true)
  );
--> statement-breakpoint
CREATE POLICY "kyc_status_admin_read" ON "kyc_status" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint

-- tier_progress
CREATE POLICY "tier_progress_player_read" ON "tier_progress" FOR SELECT
  USING (
    current_setting('app.actor_kind', true) = 'player'
    AND player_id::text = current_setting('app.actor_id', true)
  );
--> statement-breakpoint
CREATE POLICY "tier_progress_admin_read" ON "tier_progress" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint

-- tier_history
CREATE POLICY "tier_history_player_read" ON "tier_history" FOR SELECT
  USING (
    current_setting('app.actor_kind', true) = 'player'
    AND player_id::text = current_setting('app.actor_id', true)
  );
--> statement-breakpoint
CREATE POLICY "tier_history_admin_read" ON "tier_history" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint

-- game_sessions
CREATE POLICY "game_sessions_player_read" ON "game_sessions" FOR SELECT
  USING (
    current_setting('app.actor_kind', true) = 'player'
    AND player_id::text = current_setting('app.actor_id', true)
  );
--> statement-breakpoint
CREATE POLICY "game_sessions_admin_read" ON "game_sessions" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint

-- player_lifetime_stats / player_30d_stats / player_game_stats
CREATE POLICY "player_lifetime_stats_player_read" ON "player_lifetime_stats" FOR SELECT
  USING (
    current_setting('app.actor_kind', true) = 'player'
    AND player_id::text = current_setting('app.actor_id', true)
  );
--> statement-breakpoint
CREATE POLICY "player_lifetime_stats_admin_read" ON "player_lifetime_stats" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "player_30d_stats_player_read" ON "player_30d_stats" FOR SELECT
  USING (
    current_setting('app.actor_kind', true) = 'player'
    AND player_id::text = current_setting('app.actor_id', true)
  );
--> statement-breakpoint
CREATE POLICY "player_30d_stats_admin_read" ON "player_30d_stats" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "player_game_stats_player_read" ON "player_game_stats" FOR SELECT
  USING (
    current_setting('app.actor_kind', true) = 'player'
    AND player_id::text = current_setting('app.actor_id', true)
  );
--> statement-breakpoint
CREATE POLICY "player_game_stats_admin_read" ON "player_game_stats" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint

-- crm_flow_enrollments
CREATE POLICY "crm_flow_enrollments_player_read" ON "crm_flow_enrollments" FOR SELECT
  USING (
    current_setting('app.actor_kind', true) = 'player'
    AND player_id::text = current_setting('app.actor_id', true)
  );
--> statement-breakpoint
CREATE POLICY "crm_flow_enrollments_admin_read" ON "crm_flow_enrollments" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint

-- players: player sees own row, admin sees all
CREATE POLICY "players_self_read" ON "players" FOR SELECT
  USING (
    current_setting('app.actor_kind', true) = 'player'
    AND id::text = current_setting('app.actor_id', true)
  );
--> statement-breakpoint
CREATE POLICY "players_admin_read" ON "players" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint

-- ============================================================================
-- Pattern 2: Ledger entries — players see only their own player_wallet rows.
-- ============================================================================

CREATE POLICY "ledger_entries_player_read" ON "ledger_entries" FOR SELECT
  USING (
    current_setting('app.actor_kind', true) = 'player'
    AND player_id::text = current_setting('app.actor_id', true)
    AND account_kind = 'player_wallet'
  );
--> statement-breakpoint
CREATE POLICY "ledger_entries_admin_read" ON "ledger_entries" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint

-- game_rounds: same logic (denormalized player_id)
CREATE POLICY "game_rounds_player_read" ON "game_rounds" FOR SELECT
  USING (
    current_setting('app.actor_kind', true) = 'player'
    AND player_id::text = current_setting('app.actor_id', true)
  );
--> statement-breakpoint
CREATE POLICY "game_rounds_admin_read" ON "game_rounds" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint

-- player_events: player sees their own
CREATE POLICY "player_events_player_read" ON "player_events" FOR SELECT
  USING (
    current_setting('app.actor_kind', true) = 'player'
    AND player_id::text = current_setting('app.actor_id', true)
  );
--> statement-breakpoint
CREATE POLICY "player_events_admin_read" ON "player_events" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint

-- crm_message_log: player sees their own
CREATE POLICY "crm_message_log_player_read" ON "crm_message_log" FOR SELECT
  USING (
    current_setting('app.actor_kind', true) = 'player'
    AND player_id::text = current_setting('app.actor_id', true)
  );
--> statement-breakpoint
CREATE POLICY "crm_message_log_admin_read" ON "crm_message_log" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint

-- ============================================================================
-- Pattern 3: Public-read tables (lobby content). Players + admins read.
-- ============================================================================

CREATE POLICY "games_public_read" ON "games" FOR SELECT
  USING (status = 'active' AND deleted_at IS NULL);
--> statement-breakpoint
CREATE POLICY "games_admin_read" ON "games" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "packages_public_read" ON "packages" FOR SELECT
  USING (status = 'active' AND deleted_at IS NULL);
--> statement-breakpoint
CREATE POLICY "packages_admin_read" ON "packages" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "tiers_public_read" ON "tiers" FOR SELECT
  USING (status = 'active');
--> statement-breakpoint
CREATE POLICY "tiers_admin_read" ON "tiers" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "bonuses_public_read" ON "bonuses" FOR SELECT
  USING (status = 'active');
--> statement-breakpoint
CREATE POLICY "bonuses_admin_read" ON "bonuses" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "aggregators_public_read" ON "aggregators" FOR SELECT
  USING (status = 'active');
--> statement-breakpoint
CREATE POLICY "aggregators_admin_read" ON "aggregators" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "game_providers_public_read" ON "game_providers" FOR SELECT
  USING (status = 'active');
--> statement-breakpoint
CREATE POLICY "game_providers_admin_read" ON "game_providers" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "banners_public_read" ON "banners" FOR SELECT
  USING (status = 'active');
--> statement-breakpoint
CREATE POLICY "banners_admin_read" ON "banners" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "site_content_public_read" ON "site_content" FOR SELECT
  USING (true);
--> statement-breakpoint
CREATE POLICY "email_templates_admin_read" ON "email_templates" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "sms_templates_admin_read" ON "sms_templates" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint

-- ============================================================================
-- Pattern 4: Admin-only tables (default-deny for players).
-- ============================================================================

CREATE POLICY "admins_admin_read" ON "admins" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "admin_roles_admin_read" ON "admin_roles" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "admin_role_assignments_admin_read" ON "admin_role_assignments" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "admin_permissions_admin_read" ON "admin_permissions" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "admin_sessions_admin_read" ON "admin_sessions" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "audit_log_admin_read" ON "audit_log" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "house_accounts_admin_read" ON "house_accounts" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "admin_adjustments_admin_read" ON "admin_adjustments" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "admin_dashboard_layouts_admin_read" ON "admin_dashboard_layouts" FOR SELECT
  USING (
    current_setting('app.actor_kind', true) = 'admin'
    AND admin_id::text = current_setting('app.actor_id', true)
  );
--> statement-breakpoint
CREATE POLICY "admin_saved_views_admin_read" ON "admin_saved_views" FOR SELECT
  USING (
    current_setting('app.actor_kind', true) = 'admin'
    AND (admin_id::text = current_setting('app.actor_id', true) OR is_shared = true)
  );
--> statement-breakpoint
CREATE POLICY "admin_notes_admin_read" ON "admin_notes" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "custom_query_definitions_admin_read" ON "custom_query_definitions" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "affiliates_admin_read" ON "affiliates" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "affiliate_codes_admin_read" ON "affiliate_codes" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "affiliate_attribution_admin_read" ON "affiliate_attribution" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "affiliate_payouts_admin_read" ON "affiliate_payouts" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "crm_segments_admin_read" ON "crm_segments" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "crm_campaigns_admin_read" ON "crm_campaigns" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "crm_flows_admin_read" ON "crm_flows" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "crm_flow_steps_admin_read" ON "crm_flow_steps" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "crm_suppression_admin_read" ON "crm_suppression" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "promo_codes_admin_read" ON "promo_codes" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "pending_webhooks_admin_read" ON "pending_webhooks" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "integration_health_admin_read" ON "integration_health" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "aml_review_queue_admin_read" ON "aml_review_queue" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "blocked_emails_admin_read" ON "blocked_emails" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "blocked_domains_admin_read" ON "blocked_domains" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "blocked_ips_admin_read" ON "blocked_ips" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "blocked_promo_codes_admin_read" ON "blocked_promo_codes" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "daily_operational_snapshots_admin_read" ON "daily_operational_snapshots" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "daily_per_state_snapshot_admin_read" ON "daily_per_state_snapshot" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "daily_per_game_snapshot_admin_read" ON "daily_per_game_snapshot" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "daily_per_affiliate_snapshot_admin_read" ON "daily_per_affiliate_snapshot" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "daily_redemption_rate_snapshot_admin_read" ON "daily_redemption_rate_snapshot" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "exports_admin_read" ON "exports" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "report_subscriptions_admin_read" ON "report_subscriptions" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "migration_imports_admin_read" ON "migration_imports" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "migration_id_map_admin_read" ON "migration_id_map" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "migration_column_mappings_admin_read" ON "migration_column_mappings" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
--> statement-breakpoint
CREATE POLICY "tax_reports_admin_read" ON "tax_reports" FOR SELECT
  USING (current_setting('app.actor_kind', true) = 'admin');
