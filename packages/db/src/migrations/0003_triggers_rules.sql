-- docs/03 §16 — triggers, rules, and the create_monthly_partition function.

-- 1) set_updated_at() — applied to every table with an updated_at column.

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'players','wallets','kyc_status','tier_progress','tiers','packages','bonuses',
    'bonuses_awarded','promo_codes','aggregators','game_providers','games',
    'game_sessions','house_accounts','admin_adjustments','affiliates',
    'affiliate_codes','affiliate_payouts','purchases','redemptions',
    'payment_instruments','crm_segments','crm_campaigns','crm_flows',
    'admin_roles','admins','site_content','banners','email_templates',
    'sms_templates','daily_operational_snapshots','integration_health',
    'admin_dashboard_layouts'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON %I; CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t || '_set_updated_at', t, t || '_set_updated_at', t
    );
  END LOOP;
END
$$;
--> statement-breakpoint

-- 2) ledger_entries immutability (docs/03 §16.2)
-- DELETE: forbidden via rule.
-- UPDATE: only balance_after may change. All other columns are immutable.

CREATE OR REPLACE RULE ledger_entries_no_delete AS
  ON DELETE TO ledger_entries DO INSTEAD NOTHING;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION ledger_entries_update_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.source            IS DISTINCT FROM OLD.source            OR
     NEW.source_id         IS DISTINCT FROM OLD.source_id         OR
     NEW.pair_id           IS DISTINCT FROM OLD.pair_id           OR
     NEW.leg               IS DISTINCT FROM OLD.leg               OR
     NEW.amount            IS DISTINCT FROM OLD.amount            OR
     NEW.currency          IS DISTINCT FROM OLD.currency          OR
     NEW.account_id        IS DISTINCT FROM OLD.account_id        OR
     NEW.account_kind      IS DISTINCT FROM OLD.account_kind      OR
     NEW.created_at        IS DISTINCT FROM OLD.created_at        OR
     NEW.player_id         IS DISTINCT FROM OLD.player_id         OR
     NEW.metadata::text    IS DISTINCT FROM OLD.metadata::text    OR
     NEW.sub_bucket        IS DISTINCT FROM OLD.sub_bucket        OR
     NEW.idempotency_key   IS DISTINCT FROM OLD.idempotency_key THEN
    RAISE EXCEPTION 'Ledger entries are immutable except for balance_after';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS ledger_entries_immutable_guard ON ledger_entries;
--> statement-breakpoint
CREATE TRIGGER ledger_entries_immutable_guard
  BEFORE UPDATE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION ledger_entries_update_guard();
--> statement-breakpoint

-- 3) audit_log immutability (docs/03 §16.3)
CREATE OR REPLACE RULE audit_log_no_update AS
  ON UPDATE TO audit_log DO INSTEAD NOTHING;
--> statement-breakpoint
CREATE OR REPLACE RULE audit_log_no_delete AS
  ON DELETE TO audit_log DO INSTEAD NOTHING;
--> statement-breakpoint

-- 4) create_monthly_partition function (docs/03 §16.4)
-- Called by the Inngest cron job in prompt 11 to provision partitions
-- 3 months ahead for ledger_entries, game_rounds, player_events,
-- crm_message_log.

CREATE OR REPLACE FUNCTION create_monthly_partition(
  parent_table text,
  partition_date date
) RETURNS void AS $$
DECLARE
  partition_name text;
  range_start date;
  range_end date;
BEGIN
  range_start := date_trunc('month', partition_date)::date;
  range_end := (range_start + interval '1 month')::date;
  partition_name := parent_table || '_y' ||
    extract(year from range_start)::text || 'm' ||
    lpad(extract(month from range_start)::text, 2, '0');

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
    partition_name, parent_table, range_start, range_end
  );
END;
$$ LANGUAGE plpgsql;
