-- M4 — VIP / Host system schema.
--
-- 1. Extend admin_roles with the 'host' slug (contractor account scoped
--    only to their assigned VIPs).
-- 2. Add VIP columns to `players` so the platform can track lifetime
--    qualification and host assignment without joins.
-- 3. New `host_player_interactions` table — every call, text, note,
--    bonus-send, and message a host performs against one of their VIPs.
-- 4. Add `bonuses.host_available` so masters can curate the subset of
--    templates a host is allowed to award without escalation.
-- 5. RLS: hosts only see their own interactions, masters/managers see all.
--
-- Idempotent: every change is wrapped in IF NOT EXISTS / ON CONFLICT.

-- ===========================================================================
-- Admin role: 'host'
-- ===========================================================================

INSERT INTO "admin_roles" (slug, display_name, level, redemption_approve_max_usd, adjustment_max_usd)
VALUES ('host', 'Host', 15, 0, 0)
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint

-- ===========================================================================
-- Players: VIP tracking + host assignment
-- ===========================================================================

ALTER TABLE "players"
  ADD COLUMN IF NOT EXISTS "vip_status" text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "vip_qualified_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "assigned_host_id" uuid,
  ADD COLUMN IF NOT EXISTS "host_assigned_at" timestamptz;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'players_vip_status_check'
  ) THEN
    ALTER TABLE "players"
      ADD CONSTRAINT "players_vip_status_check"
      CHECK (vip_status IN ('none', 'candidate', 'vip', 'high_roller'));
  END IF;
END$$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'players_assigned_host_fk'
  ) THEN
    ALTER TABLE "players"
      ADD CONSTRAINT "players_assigned_host_fk"
      FOREIGN KEY (assigned_host_id) REFERENCES "admins"(id) ON DELETE SET NULL;
  END IF;
END$$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "players_vip_status_idx"
  ON "players" (vip_status)
  WHERE vip_status <> 'none' AND deleted_at IS NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "players_assigned_host_idx"
  ON "players" (assigned_host_id)
  WHERE assigned_host_id IS NOT NULL AND deleted_at IS NULL;
--> statement-breakpoint

-- ===========================================================================
-- host_player_interactions — every host touchpoint with their VIP.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS "host_player_interactions" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "host_id"          uuid NOT NULL REFERENCES "admins"(id) ON DELETE RESTRICT,
  "player_id"        uuid NOT NULL REFERENCES "players"(id) ON DELETE CASCADE,
  "interaction_type" text NOT NULL,
  "notes"            text,
  "outcome"          text,
  "metadata"         jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at"       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "host_player_interactions_type_check"
    CHECK (interaction_type IN (
      'call', 'text', 'email', 'in_person',
      'bonus_sent', 'note', 'message_sent', 'system'
    )),
  CONSTRAINT "host_player_interactions_outcome_check"
    CHECK (outcome IS NULL OR outcome IN (
      'positive', 'neutral', 'negative', 'no_response'
    ))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "host_player_interactions_player_idx"
  ON "host_player_interactions" (player_id, created_at DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "host_player_interactions_host_idx"
  ON "host_player_interactions" (host_id, created_at DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "host_player_interactions_type_idx"
  ON "host_player_interactions" (interaction_type, created_at DESC);
--> statement-breakpoint

-- ===========================================================================
-- bonuses.host_available — gate which templates a host may award alone.
-- ===========================================================================

ALTER TABLE "bonuses"
  ADD COLUMN IF NOT EXISTS "host_available" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "bonuses_host_available_idx"
  ON "bonuses" (host_available, status)
  WHERE host_available = true;
--> statement-breakpoint

-- ===========================================================================
-- RLS — host_player_interactions
-- ===========================================================================

ALTER TABLE "host_player_interactions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Hosts: only their own rows.
DROP POLICY IF EXISTS "host_player_interactions_host_read" ON "host_player_interactions";
--> statement-breakpoint
CREATE POLICY "host_player_interactions_host_read" ON "host_player_interactions" FOR SELECT
  USING (
    current_setting('app.actor_kind', true) = 'admin'
    AND current_setting('app.actor_role', true) = 'host'
    AND host_id::text = current_setting('app.actor_id', true)
  );
--> statement-breakpoint

DROP POLICY IF EXISTS "host_player_interactions_host_write" ON "host_player_interactions";
--> statement-breakpoint
CREATE POLICY "host_player_interactions_host_write" ON "host_player_interactions" FOR INSERT
  WITH CHECK (
    current_setting('app.actor_kind', true) = 'admin'
    AND current_setting('app.actor_role', true) = 'host'
    AND host_id::text = current_setting('app.actor_id', true)
  );
--> statement-breakpoint

-- Master / manager: full read.
DROP POLICY IF EXISTS "host_player_interactions_admin_read" ON "host_player_interactions";
--> statement-breakpoint
CREATE POLICY "host_player_interactions_admin_read" ON "host_player_interactions" FOR SELECT
  USING (
    current_setting('app.actor_kind', true) = 'admin'
    AND current_setting('app.actor_role', true) IN ('master', 'manager')
  );
--> statement-breakpoint

DROP POLICY IF EXISTS "host_player_interactions_admin_write" ON "host_player_interactions";
--> statement-breakpoint
CREATE POLICY "host_player_interactions_admin_write" ON "host_player_interactions" FOR INSERT
  WITH CHECK (
    current_setting('app.actor_kind', true) = 'admin'
    AND current_setting('app.actor_role', true) IN ('master', 'manager')
  );
--> statement-breakpoint

-- ===========================================================================
-- Seed: mark several existing bonus templates as host_available so hosts
-- have something to award out of the box.
-- ===========================================================================

UPDATE "bonuses"
SET host_available = true
WHERE slug IN (
  'seed-promo-vip',
  'seed-promo-weekend',
  'seed-crm-birthday',
  'seed-promo-comeback'
);
--> statement-breakpoint

-- Brand-new host-only templates (small SC, no playthrough, daily/weekly).
INSERT INTO "bonuses" (
  slug, display_name, bonus_type,
  award_gc, award_sc,
  playthrough_multiplier, playthrough_window_hours,
  status, description, host_available
) VALUES
  (
    'host-daily-boost', 'VIP Daily Boost', 'promotion',
    0, 50000,
    '1.0', 24,
    'active', 'Small SC boost a host can award to keep VIPs engaged.',
    true
  ),
  (
    'host-weekend-bonus', 'VIP Weekend Bonus', 'promotion',
    0, 250000,
    '1.0', 72,
    'active', 'Weekend SC bonus available to VIP hosts.',
    true
  ),
  (
    'host-birthday-bonus', 'Birthday Bonus', 'promotion',
    0, 500000,
    '1.0', 168,
    'active', 'Birthday SC gift from your VIP host.',
    true
  ),
  (
    'host-comeback-bonus', 'Comeback Bonus', 'promotion',
    0, 150000,
    '1.0', 168,
    'active', 'Reactivation SC awarded by host after VIP dormancy.',
    true
  ),
  (
    'host-high-roller-treat', 'High Roller Treat', 'promotion',
    0, 1000000,
    '1.0', 168,
    'active', 'Big SC gift reserved for high rollers.',
    true
  )
ON CONFLICT (slug) DO UPDATE
  SET host_available = EXCLUDED.host_available,
      status = EXCLUDED.status;
