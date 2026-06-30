CREATE TYPE "public"."bonus_type" AS ENUM('welcome', 'tier_up', 'weekly_tier', 'monthly_tier', 'package', 'daily', 'jackpot', 'referral', 'affiliate', 'promotion', 'amoe', 'admin_added_sc', 'crm_promocode', 'purchase_promocode');--> statement-breakpoint
CREATE TYPE "public"."ledger_account_kind" AS ENUM('player_wallet', 'pending_purchase', 'pending_redemption', 'house_bank', 'house_winnings_gc', 'house_winnings_sc', 'bonus_pool_gc', 'bonus_pool_sc', 'amoe_pool_sc', 'affiliate_payable', 'internal_account_sink', 'external');--> statement-breakpoint
CREATE TYPE "public"."ledger_leg" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."ledger_source" AS ENUM('purchase', 'bet', 'win', 'bonus_award', 'playthrough_release', 'redemption_request', 'redemption_paid', 'redemption_rejected', 'purchase_refund', 'admin_adjustment', 'affiliate_payout', 'bonus_expired', 'migration');--> statement-breakpoint
CREATE TYPE "public"."player_status" AS ENUM('active', 'suspended', 'self_excluded', 'closed', 'internal', 'restricted');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"username" text,
	"display_name" text,
	"phone" text,
	"date_of_birth" date,
	"first_name" text,
	"last_name" text,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"country" text DEFAULT 'US' NOT NULL,
	"status" "player_status" DEFAULT 'active' NOT NULL,
	"status_reason" text,
	"is_internal_account" boolean DEFAULT false NOT NULL,
	"kyc_level" integer DEFAULT 0 NOT NULL,
	"kyc_verified_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"signup_ip" "inet",
	"signup_country" text,
	"signup_state" text,
	"attributed_affiliate_id" uuid,
	"attributed_promo_code" text,
	"attributed_at" timestamp with time zone,
	"rg_self_excluded_until" timestamp with time zone,
	"rg_deposit_limit_daily" numeric(20, 4),
	"rg_deposit_limit_weekly" numeric(20, 4),
	"rg_deposit_limit_monthly" numeric(20, 4),
	"rg_session_limit_min" integer,
	"rg_pending_limit_changes" jsonb,
	"email_consent" boolean DEFAULT true NOT NULL,
	"sms_consent" boolean DEFAULT false NOT NULL,
	"marketing_consent_at" timestamp with time zone,
	"crm_daily_max" integer DEFAULT 3 NOT NULL,
	"gamma_user_id" text,
	"signup_source" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "players_email_unique" UNIQUE("email"),
	CONSTRAINT "players_username_unique" UNIQUE("username"),
	CONSTRAINT "players_gamma_user_id_unique" UNIQUE("gamma_user_id"),
	CONSTRAINT "players_kyc_level_range" CHECK ("players"."kyc_level" >= 0 and "players"."kyc_level" <= 3)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"current_balance" numeric(20, 4) DEFAULT 0 NOT NULL,
	"balance_purchased" numeric(20, 4) DEFAULT 0 NOT NULL,
	"balance_bonus" numeric(20, 4) DEFAULT 0 NOT NULL,
	"balance_promo" numeric(20, 4) DEFAULT 0 NOT NULL,
	"balance_earned" numeric(20, 4) DEFAULT 0 NOT NULL,
	"playthrough_required" numeric(20, 4) DEFAULT 0 NOT NULL,
	"playthrough_progress" numeric(20, 4) DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_player_currency_unique" UNIQUE("player_id","currency"),
	CONSTRAINT "wallets_currency_check" CHECK ("wallets"."currency" in ('GC', 'SC')),
	CONSTRAINT "wallets_balance_sum_check" CHECK ("wallets"."current_balance" = "wallets"."balance_purchased" + "wallets"."balance_bonus" + "wallets"."balance_promo" + "wallets"."balance_earned")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kyc_status" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"footprint_user_id" text,
	"footprint_status" text,
	"footprint_manual_review_status" text,
	"footprint_completed_at" timestamp with time zone,
	"footprint_status_last_synced" timestamp with time zone,
	"watchlist_last_check_at" timestamp with time zone,
	"watchlist_last_status" text,
	"documents_uploaded" jsonb,
	"manual_decision_by" uuid,
	"manual_decision_at" timestamp with time zone,
	"manual_decision_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kyc_status_player_id_unique" UNIQUE("player_id"),
	CONSTRAINT "kyc_status_footprint_user_id_unique" UNIQUE("footprint_user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "compliance_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"flag_type" text NOT NULL,
	"severity" text NOT NULL,
	"reason" text NOT NULL,
	"expires_at" timestamp with time zone,
	"cleared_at" timestamp with time zone,
	"cleared_by" uuid,
	"cleared_reason" text,
	"imported_from" text,
	"imported_source_text" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "compliance_flags_severity_check" CHECK ("compliance_flags"."severity" in ('info', 'warn', 'block'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "geo_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"action" text NOT NULL,
	"resource_id" uuid,
	"ip" "inet" NOT NULL,
	"country" text,
	"state" text,
	"city" text,
	"postal_code" text,
	"is_proxy" boolean DEFAULT false,
	"is_mocked" boolean DEFAULT false,
	"is_compromised" boolean DEFAULT false,
	"is_jumped" boolean DEFAULT false,
	"is_inaccurate" boolean DEFAULT false,
	"user_agent" text,
	"device_id" text,
	"radar_response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "house_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"currency" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"current_balance" numeric(20, 4) DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "house_accounts_kind_currency_unique" UNIQUE("kind","currency"),
	CONSTRAINT "house_accounts_currency_check" CHECK ("house_accounts"."currency" in ('GC', 'SC', 'USD'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ledger_entries" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"source" "ledger_source" NOT NULL,
	"source_id" text NOT NULL,
	"idempotency_key" text,
	"pair_id" uuid NOT NULL,
	"leg" "ledger_leg" NOT NULL,
	"account_kind" "ledger_account_kind" NOT NULL,
	"account_id" uuid NOT NULL,
	"amount" numeric(20, 4) NOT NULL,
	"currency" text NOT NULL,
	"sub_bucket" text,
	"player_id" uuid,
	"balance_after" numeric(20, 4),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_id_created_at_pk" PRIMARY KEY("id","created_at"),
	CONSTRAINT "ledger_entries_amount_positive" CHECK ("ledger_entries"."amount" > 0),
	CONSTRAINT "ledger_entries_currency_check" CHECK ("ledger_entries"."currency" in ('GC', 'SC', 'USD')),
	CONSTRAINT "ledger_entries_sub_bucket_check" CHECK ("ledger_entries"."sub_bucket" is null or "ledger_entries"."sub_bucket" in ('purchased', 'bonus', 'promo', 'earned'))
) PARTITION BY RANGE (created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"admin_id" uuid NOT NULL,
	"amount" numeric(20, 4) NOT NULL,
	"currency" text NOT NULL,
	"sub_bucket" text,
	"direction" text NOT NULL,
	"reason" text NOT NULL,
	"reason_category" text NOT NULL,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"approval_threshold_usd" numeric(20, 4),
	"ledger_pair_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_adjustments_currency_check" CHECK ("admin_adjustments"."currency" in ('GC', 'SC')),
	CONSTRAINT "admin_adjustments_sub_bucket_check" CHECK ("admin_adjustments"."sub_bucket" is null or "admin_adjustments"."sub_bucket" in ('purchased', 'bonus', 'promo', 'earned')),
	CONSTRAINT "admin_adjustments_direction_check" CHECK ("admin_adjustments"."direction" in ('credit', 'debit'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "aggregators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"api_base_url" text,
	"status" text DEFAULT 'active' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aggregators_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "game_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"aggregator_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"logo_url" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_providers_aggregator_slug_unique" UNIQUE("aggregator_id","slug"),
	CONSTRAINT "game_providers_status_check" CHECK ("game_providers"."status" in ('active', 'inactive', 'maintenance'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "game_rounds" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"external_round_id" text NOT NULL,
	"bet_amount" numeric(20, 4) NOT NULL,
	"win_amount" numeric(20, 4) DEFAULT 0 NOT NULL,
	"currency" text NOT NULL,
	"status" text NOT NULL,
	"outcome" jsonb,
	"bet_at" timestamp with time zone NOT NULL,
	"won_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_rounds_id_created_at_pk" PRIMARY KEY("id","created_at"),
	CONSTRAINT "game_rounds_currency_check" CHECK ("game_rounds"."currency" in ('GC', 'SC')),
	CONSTRAINT "game_rounds_status_check" CHECK ("game_rounds"."status" in ('bet_placed', 'resolved', 'refunded'))
) PARTITION BY RANGE (created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "game_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"alea_session_token" text,
	"alea_play_url" text,
	"total_bet" numeric(20, 4) DEFAULT 0 NOT NULL,
	"total_win" numeric(20, 4) DEFAULT 0 NOT NULL,
	"round_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"launch_ip" "inet",
	"launch_state" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_sessions_currency_check" CHECK ("game_sessions"."currency" in ('GC', 'SC')),
	CONSTRAINT "game_sessions_status_check" CHECK ("game_sessions"."status" in ('active', 'closed', 'abandoned'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"external_id" text NOT NULL,
	"display_name" text NOT NULL,
	"category" text NOT NULL,
	"sub_category" text,
	"thumbnail_url" text,
	"banner_url" text,
	"rtp" numeric(5, 4),
	"volatility" text,
	"min_bet_sc" numeric(20, 4),
	"max_bet_sc" numeric(20, 4),
	"playthrough_weight" numeric(5, 4) DEFAULT '1.0' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"customer_facing" boolean DEFAULT true NOT NULL,
	"available_in_gc" boolean DEFAULT true NOT NULL,
	"available_in_sc" boolean DEFAULT true NOT NULL,
	"lobby_order" integer DEFAULT 0,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_new" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "games_slug_unique" UNIQUE("slug"),
	CONSTRAINT "games_status_check" CHECK ("games"."status" in ('active', 'inactive', 'maintenance'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tier_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"from_tier_id" uuid,
	"to_tier_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"xp_at_change" numeric(20, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tier_progress" (
	"player_id" uuid PRIMARY KEY NOT NULL,
	"current_tier_id" uuid NOT NULL,
	"current_tier_level" integer DEFAULT 1 NOT NULL,
	"current_xp" numeric(20, 4) DEFAULT 0 NOT NULL,
	"xp_for_next_tier" numeric(20, 4),
	"tier_reached_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_weekly_bonus_at" timestamp with time zone,
	"last_monthly_bonus_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"level" integer NOT NULL,
	"xp_required" numeric(20, 4) DEFAULT 0 NOT NULL,
	"weekly_sc_bonus" numeric(20, 4) DEFAULT 0 NOT NULL,
	"monthly_sc_bonus" numeric(20, 4) DEFAULT 0 NOT NULL,
	"daily_login_bonus_mult" numeric(5, 2) DEFAULT '1.0' NOT NULL,
	"cashback_pct" numeric(5, 4) DEFAULT '0',
	"icon_url" text,
	"badge_color" text,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tiers_slug_unique" UNIQUE("slug"),
	CONSTRAINT "tiers_level_unique" UNIQUE("level"),
	CONSTRAINT "tiers_status_check" CHECK ("tiers"."status" in ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"price_usd" numeric(20, 4) NOT NULL,
	"base_gc" numeric(20, 4) NOT NULL,
	"base_sc" numeric(20, 4) DEFAULT 0 NOT NULL,
	"bonus_gc" numeric(20, 4) DEFAULT 0 NOT NULL,
	"bonus_sc" numeric(20, 4) DEFAULT 0 NOT NULL,
	"playthrough_multiplier" numeric(5, 2) DEFAULT '1.0' NOT NULL,
	"bonus_id" uuid,
	"promotional_label" text,
	"display_image_url" text,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"first_purchase_only" boolean DEFAULT false NOT NULL,
	"min_tier_id" uuid,
	"max_per_player" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "packages_slug_unique" UNIQUE("slug"),
	CONSTRAINT "packages_status_check" CHECK ("packages"."status" in ('active', 'inactive', 'archived'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bonuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"bonus_type" "bonus_type" NOT NULL,
	"award_gc" numeric(20, 4) DEFAULT 0 NOT NULL,
	"award_sc" numeric(20, 4) DEFAULT 0 NOT NULL,
	"award_formula" jsonb,
	"playthrough_multiplier" numeric(5, 2) DEFAULT '3.0' NOT NULL,
	"playthrough_window_hours" integer,
	"game_weight_overrides" jsonb,
	"min_bet_for_contribution" numeric(20, 4),
	"max_bet_during_playthrough" numeric(20, 4),
	"min_tier_id" uuid,
	"max_per_player" integer,
	"cooldown_hours" integer,
	"stackable" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"description" text,
	"terms" text,
	"display_image_url" text,
	"awarded_count_lifetime" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bonuses_slug_unique" UNIQUE("slug"),
	CONSTRAINT "bonuses_status_check" CHECK ("bonuses"."status" in ('active', 'inactive', 'archived'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bonuses_awarded" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"bonus_id" uuid NOT NULL,
	"gc_amount" numeric(20, 4) DEFAULT 0 NOT NULL,
	"sc_amount" numeric(20, 4) DEFAULT 0 NOT NULL,
	"playthrough_multiplier_snapshot" numeric(5, 2) NOT NULL,
	"playthrough_required" numeric(20, 4) DEFAULT 0 NOT NULL,
	"playthrough_progress" numeric(20, 4) DEFAULT 0 NOT NULL,
	"playthrough_complete" boolean DEFAULT false NOT NULL,
	"game_weight_overrides_snapshot" jsonb,
	"min_bet_for_contribution_snapshot" numeric(20, 4),
	"max_bet_during_playthrough_snapshot" numeric(20, 4),
	"expires_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"source_kind" text,
	"source_id" text,
	"awarded_by_admin" uuid,
	"award_reason" text,
	"award_pair_id" uuid,
	"release_pair_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "bonuses_awarded_source_unique" UNIQUE("source_kind","source_id"),
	CONSTRAINT "bonuses_awarded_status_check" CHECK ("bonuses_awarded"."status" in ('active', 'completed', 'expired', 'forfeited', 'reversed'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "promo_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"bonus_id" uuid NOT NULL,
	"playthrough_multiplier" numeric(5, 2),
	"playthrough_window_hours" integer,
	"game_weight_overrides" jsonb,
	"required_context" text,
	"min_tier_id" uuid,
	"max_per_player" integer DEFAULT 1,
	"max_total_uses" integer,
	"uses_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"blocked_email_domains" text[],
	"created_by" uuid,
	"campaign_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_codes_code_unique" UNIQUE("code"),
	CONSTRAINT "promo_codes_required_context_check" CHECK ("promo_codes"."required_context" is null or "promo_codes"."required_context" in ('signup', 'purchase', 'standalone')),
	CONSTRAINT "promo_codes_status_check" CHECK ("promo_codes"."status" in ('active', 'inactive', 'archived'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "promo_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promo_code_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"bonus_award_id" uuid,
	"context" text,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_redemptions_code_player_unique" UNIQUE("promo_code_id","player_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "affiliate_attribution" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"affiliate_id" uuid NOT NULL,
	"source" text NOT NULL,
	"source_detail" text,
	"campaign_name" text,
	"attributed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"click_ip" "inet",
	"click_user_agent" text,
	"click_referrer" text,
	CONSTRAINT "affiliate_attribution_player_id_unique" UNIQUE("player_id"),
	CONSTRAINT "affiliate_attribution_source_check" CHECK ("affiliate_attribution"."source" in ('PROMO_CODE', 'LINK', 'MANUAL', 'FRENZY_CREATOR_PORTAL'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "affiliate_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"affiliate_id" uuid NOT NULL,
	"code" text NOT NULL,
	"campaign_name" text,
	"signups_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_codes_code_unique" UNIQUE("code"),
	CONSTRAINT "affiliate_codes_status_check" CHECK ("affiliate_codes"."status" in ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "affiliate_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"affiliate_id" uuid NOT NULL,
	"period_label" text NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"amount_sc" numeric(20, 4) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"ledger_pair_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_payouts_status_check" CHECK ("affiliate_payouts"."status" in ('pending', 'approved', 'paid', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "affiliates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"first_name" text,
	"last_name" text,
	"player_id" uuid,
	"frenzy_creator_id" text,
	"revenue_share_pct" numeric(5, 4) DEFAULT '0' NOT NULL,
	"base_cpa_usd" numeric(20, 4) DEFAULT 0,
	"status" text DEFAULT 'active' NOT NULL,
	"total_signups_attributed" integer DEFAULT 0 NOT NULL,
	"total_active_attributed" integer DEFAULT 0 NOT NULL,
	"total_ngr_attributed_sc" numeric(20, 4) DEFAULT 0 NOT NULL,
	"total_payouts_sc" numeric(20, 4) DEFAULT 0 NOT NULL,
	"pending_payout_sc" numeric(20, 4) DEFAULT 0 NOT NULL,
	"gamma_affiliate_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliates_username_unique" UNIQUE("username"),
	CONSTRAINT "affiliates_email_unique" UNIQUE("email"),
	CONSTRAINT "affiliates_gamma_affiliate_id_unique" UNIQUE("gamma_affiliate_id"),
	CONSTRAINT "affiliates_status_check" CHECK ("affiliates"."status" in ('active', 'inactive', 'banned'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"package_id" uuid,
	"amount_usd" numeric(20, 4) NOT NULL,
	"amount_cents" bigint NOT NULL,
	"base_gc" numeric(20, 4) DEFAULT 0 NOT NULL,
	"base_sc" numeric(20, 4) DEFAULT 0 NOT NULL,
	"bonus_gc" numeric(20, 4) DEFAULT 0 NOT NULL,
	"bonus_sc" numeric(20, 4) DEFAULT 0 NOT NULL,
	"promo_code" text,
	"finix_transfer_id" text,
	"finix_payment_instrument_id" text,
	"finix_3ds_result" text,
	"finix_3ds_eci" text,
	"finix_avs_result" text,
	"finix_cvv_result" text,
	"finix_card_last4" text,
	"finix_card_brand" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"failure_message" text,
	"attempts_count" integer DEFAULT 1 NOT NULL,
	"abandonment_step" text,
	"ledger_pair_id" uuid,
	"ip_at_purchase" "inet",
	"state_at_purchase" text,
	"gamma_transaction_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "purchases_finix_transfer_id_unique" UNIQUE("finix_transfer_id"),
	CONSTRAINT "purchases_gamma_transaction_id_unique" UNIQUE("gamma_transaction_id"),
	CONSTRAINT "purchases_status_check" CHECK ("purchases"."status" in ('pending', 'completed', 'failed', 'cancelled', 'refunded', 'disputed'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_instruments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"type" text NOT NULL,
	"display_name" text,
	"finix_payment_instrument_id" text,
	"bank_name" text,
	"account_last4" text,
	"routing_last4" text,
	"plaid_account_id" text,
	"plaid_validation_status" text,
	"plaid_validation_at" timestamp with time zone,
	"apt_card_token" text,
	"card_brand" text,
	"card_last4" text,
	"status" text DEFAULT 'active' NOT NULL,
	"disabled_at" timestamp with time zone,
	"disabled_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_instruments_type_check" CHECK ("payment_instruments"."type" in ('bank_account', 'debit_card')),
	CONSTRAINT "payment_instruments_status_check" CHECK ("payment_instruments"."status" in ('active', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"amount_sc" numeric(20, 4) NOT NULL,
	"amount_usd" numeric(20, 4) NOT NULL,
	"method" text NOT NULL,
	"payment_instrument_id" uuid,
	"drain_plan" jsonb NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"approval_reason" text,
	"rejected_by" uuid,
	"rejected_at" timestamp with time zone,
	"rejection_reason" text,
	"rejection_category" text,
	"finix_transfer_id" text,
	"apt_transfer_id" text,
	"failure_reason" text,
	"ledger_pair_id" uuid,
	"ip_at_request" "inet",
	"state_at_request" text,
	"submitted_to_finix_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"gamma_redemption_id" text,
	"fraud_signals_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "redemptions_finix_transfer_id_unique" UNIQUE("finix_transfer_id"),
	CONSTRAINT "redemptions_apt_transfer_id_unique" UNIQUE("apt_transfer_id"),
	CONSTRAINT "redemptions_gamma_redemption_id_unique" UNIQUE("gamma_redemption_id"),
	CONSTRAINT "redemptions_method_check" CHECK ("redemptions"."method" in ('finix_ach', 'apt_debit')),
	CONSTRAINT "redemptions_status_check" CHECK ("redemptions"."status" in ('requested', 'pending_review', 'kyc_pending', 'approved', 'submitted', 'awaiting_webhook', 'paid', 'failed', 'rejected', 'cancelled', 'aml_hold'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "player_events" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"event_name" text NOT NULL,
	"event_category" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"game_id" uuid,
	"amount" numeric(20, 4),
	"currency" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_events_id_created_at_pk" PRIMARY KEY("id","created_at")
) PARTITION BY RANGE (created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "player_30d_stats" (
	"player_id" uuid PRIMARY KEY NOT NULL,
	"deposited_usd_30d" numeric(20, 4) DEFAULT 0 NOT NULL,
	"redeemed_usd_30d" numeric(20, 4) DEFAULT 0 NOT NULL,
	"wagered_sc_30d" numeric(20, 4) DEFAULT 0 NOT NULL,
	"ngr_sc_30d" numeric(20, 4) DEFAULT 0 NOT NULL,
	"session_count_30d" integer DEFAULT 0 NOT NULL,
	"days_active_30d" integer DEFAULT 0 NOT NULL,
	"last_purchase_at" timestamp with time zone,
	"last_session_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "player_game_stats" (
	"player_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"total_bet_sc" numeric(20, 4) DEFAULT 0 NOT NULL,
	"total_win_sc" numeric(20, 4) DEFAULT 0 NOT NULL,
	"round_count" integer DEFAULT 0 NOT NULL,
	"first_played_at" timestamp with time zone NOT NULL,
	"last_played_at" timestamp with time zone NOT NULL,
	"last_7d_wagered_sc" numeric(20, 4) DEFAULT 0 NOT NULL,
	"last_7d_rounds" integer DEFAULT 0 NOT NULL,
	"last_30d_wagered_sc" numeric(20, 4) DEFAULT 0 NOT NULL,
	"last_30d_rounds" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_game_stats_player_id_game_id_pk" PRIMARY KEY("player_id","game_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "player_lifetime_stats" (
	"player_id" uuid PRIMARY KEY NOT NULL,
	"total_deposited_usd" numeric(20, 4) DEFAULT 0 NOT NULL,
	"total_redeemed_usd" numeric(20, 4) DEFAULT 0 NOT NULL,
	"net_position_usd" numeric(20, 4) DEFAULT 0 NOT NULL,
	"purchase_count" integer DEFAULT 0 NOT NULL,
	"redemption_count" integer DEFAULT 0 NOT NULL,
	"pending_redemption_count" integer DEFAULT 0 NOT NULL,
	"total_wagered_gc" numeric(20, 4) DEFAULT 0 NOT NULL,
	"total_wagered_sc" numeric(20, 4) DEFAULT 0 NOT NULL,
	"total_won_gc" numeric(20, 4) DEFAULT 0 NOT NULL,
	"total_won_sc" numeric(20, 4) DEFAULT 0 NOT NULL,
	"ggr_sc" numeric(20, 4) DEFAULT 0 NOT NULL,
	"ngr_sc" numeric(20, 4) DEFAULT 0 NOT NULL,
	"session_count" integer DEFAULT 0 NOT NULL,
	"round_count" integer DEFAULT 0 NOT NULL,
	"days_active" integer DEFAULT 0 NOT NULL,
	"first_purchase_at" timestamp with time zone,
	"last_purchase_at" timestamp with time zone,
	"first_session_at" timestamp with time zone,
	"last_session_at" timestamp with time zone,
	"emails_received_lifetime" integer DEFAULT 0 NOT NULL,
	"emails_opened_lifetime" integer DEFAULT 0 NOT NULL,
	"emails_clicked_lifetime" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"segment_id" uuid,
	"channel" text NOT NULL,
	"template_id" uuid,
	"ab_variant_a_template_id" uuid,
	"ab_variant_b_template_id" uuid,
	"ab_split_pct" integer,
	"ab_winner_metric" text,
	"ab_winning_variant" text,
	"ab_decided_at" timestamp with time zone,
	"scheduled_for" timestamp with time zone,
	"conversion_event" text,
	"conversion_window_hours" integer DEFAULT 168,
	"status" text DEFAULT 'draft' NOT NULL,
	"segment_snapshot_count" integer,
	"eligible_count" integer,
	"recipients_count" integer DEFAULT 0,
	"sent_count" integer DEFAULT 0,
	"delivered_count" integer DEFAULT 0,
	"opened_count" integer DEFAULT 0,
	"clicked_count" integer DEFAULT 0,
	"bounced_count" integer DEFAULT 0,
	"unsubscribed_count" integer DEFAULT 0,
	"conversion_count" integer DEFAULT 0,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_started_at" timestamp with time zone,
	"sent_completed_at" timestamp with time zone,
	CONSTRAINT "crm_campaigns_channel_check" CHECK ("crm_campaigns"."channel" in ('email', 'sms', 'in_app')),
	CONSTRAINT "crm_campaigns_status_check" CHECK ("crm_campaigns"."status" in ('draft', 'scheduled', 'sending', 'sent', 'cancelled', 'paused'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_flow_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"current_step" integer DEFAULT 1 NOT NULL,
	"next_action_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"last_step_at" timestamp with time zone,
	"error_message" text,
	CONSTRAINT "crm_flow_enrollments_status_check" CHECK ("crm_flow_enrollments"."status" in ('active', 'completed', 'cancelled', 'errored'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_flow_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_id" uuid NOT NULL,
	"step_number" integer NOT NULL,
	"action_type" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"wait_duration_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_flow_steps_flow_step_unique" UNIQUE("flow_id","step_number"),
	CONSTRAINT "crm_flow_steps_action_check" CHECK ("crm_flow_steps"."action_type" in ('send_email', 'send_sms', 'wait', 'condition', 'award_bonus', 'add_to_segment', 'remove_from_segment', 'end'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"trigger_event" text NOT NULL,
	"trigger_filter" jsonb,
	"max_enrollments_per_player" integer DEFAULT 1,
	"cooldown_hours_between_enrollments" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"conversion_event" text,
	"enrollments_count_lifetime" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_flows_status_check" CHECK ("crm_flows"."status" in ('active', 'paused', 'archived'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_message_log" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"campaign_id" uuid,
	"flow_enrollment_id" uuid,
	"template_id" uuid,
	"channel" text NOT NULL,
	"recipient" text NOT NULL,
	"subject" text,
	"body_preview" text,
	"ab_variant" text,
	"status" text NOT NULL,
	"sendgrid_message_id" text,
	"twilio_message_sid" text,
	"conversion_event_id" uuid,
	"conversion_at" timestamp with time zone,
	"queued_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"clicked_at" timestamp with time zone,
	"error_code" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_message_log_id_created_at_pk" PRIMARY KEY("id","created_at"),
	CONSTRAINT "crm_message_log_channel_check" CHECK ("crm_message_log"."channel" in ('email', 'sms', 'in_app')),
	CONSTRAINT "crm_message_log_status_check" CHECK ("crm_message_log"."status" in ('queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'spam', 'unsubscribed', 'failed'))
) PARTITION BY RANGE (created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"filter_tree" jsonb NOT NULL,
	"compiled_sql" text,
	"compiled_at" timestamp with time zone,
	"compilation_version" integer DEFAULT 1,
	"cached_count" integer,
	"count_updated_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_segments_name_unique" UNIQUE("name"),
	CONSTRAINT "crm_segments_status_check" CHECK ("crm_segments"."status" in ('active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_suppression" (
	"email_or_phone" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"source" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_suppression_source_check" CHECK ("crm_suppression"."source" in ('bounce', 'complaint', 'manual', 'unsubscribe', 'tcpa_stop'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_dashboard_layouts" (
	"admin_id" uuid PRIMARY KEY NOT NULL,
	"layout" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"admin_id" uuid NOT NULL,
	"note" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"resource" text NOT NULL,
	"action" text NOT NULL,
	"scope" jsonb,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by" uuid,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "admin_permissions_admin_resource_action_unique" UNIQUE("admin_id","resource","action")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_role_assignments" (
	"admin_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by" uuid,
	CONSTRAINT "admin_role_assignments_admin_id_role_id_pk" PRIMARY KEY("admin_id","role_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"level" integer NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"redemption_approve_max_usd" bigint,
	"adjustment_max_usd" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_roles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"name" text NOT NULL,
	"filter_config" jsonb NOT NULL,
	"column_config" jsonb,
	"is_shared" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"bind_ip" "inet",
	"bind_ua_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"revoked_by" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"password_set_at" timestamp with time zone DEFAULT now() NOT NULL,
	"totp_secret" text,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"totp_enabled_at" timestamp with time zone,
	"backup_codes" text,
	"status" text DEFAULT 'active' NOT NULL,
	"status_reason" text,
	"last_login_at" timestamp with time zone,
	"last_login_ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "admins_email_unique" UNIQUE("email"),
	CONSTRAINT "admins_status_check" CHECK ("admins"."status" in ('active', 'suspended', 'terminated'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "custom_query_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"query_config" jsonb NOT NULL,
	"schedule" text,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_id" uuid,
	"actor_role" text,
	"action" text NOT NULL,
	"resource_kind" text,
	"resource_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"ip" "inet",
	"user_agent" text,
	"request_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_actor_kind_check" CHECK ("audit_log"."actor_kind" in ('admin', 'player', 'system'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "banners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text,
	"body" text,
	"cta_label" text,
	"cta_url" text,
	"image_url" text,
	"audience_segment_id" uuid,
	"pages" text[],
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "banners_slug_unique" UNIQUE("slug"),
	CONSTRAINT "banners_status_check" CHECK ("banners"."status" in ('active', 'inactive'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"parent_id" uuid,
	"is_current" boolean DEFAULT true NOT NULL,
	"subject_template" text NOT NULL,
	"body_html_template" text NOT NULL,
	"body_text_template" text,
	"from_email" text,
	"reply_to" text,
	"category" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_templates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"cta_url" text,
	"category" text,
	"priority" text DEFAULT 'normal' NOT NULL,
	"read_at" timestamp with time zone,
	"source_kind" text,
	"source_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "notifications_priority_check" CHECK ("notifications"."priority" in ('low', 'normal', 'high'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "site_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" text,
	"value_json" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"audience" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_content_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sms_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"parent_id" uuid,
	"is_current" boolean DEFAULT true NOT NULL,
	"body_template" text NOT NULL,
	"category" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sms_templates_slug_unique" UNIQUE("slug"),
	CONSTRAINT "sms_templates_body_length_check" CHECK (length("sms_templates"."body_template") <= 320)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "blocked_domains" (
	"domain" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"added_by" uuid,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "blocked_emails" (
	"email" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"added_by" uuid,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "blocked_ips" (
	"ip" "inet" PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"added_by" uuid,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "blocked_promo_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"added_by" uuid,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integration_health" (
	"provider" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'green' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"error_count_1h" integer DEFAULT 0 NOT NULL,
	"success_count_1h" integer DEFAULT 0 NOT NULL,
	"p99_latency_ms_1h" integer,
	"duplicate_count_1h" integer DEFAULT 0 NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_health_status_check" CHECK ("integration_health"."status" in ('green', 'yellow', 'red'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "aml_review_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"footprint_event_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"resolution_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aml_review_queue_status_check" CHECK ("aml_review_queue"."status" in ('open', 'cleared', 'hold_confirmed', 'escalated_legal'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pending_webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"event_type" text NOT NULL,
	"raw_body" text NOT NULL,
	"raw_headers" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"processing_attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_error" text,
	"processed_at" timestamp with time zone,
	CONSTRAINT "pending_webhooks_provider_idempotency_unique" UNIQUE("provider","idempotency_key"),
	CONSTRAINT "pending_webhooks_status_check" CHECK ("pending_webhooks"."status" in ('received', 'processing', 'completed', 'failed', 'replayed_for_migration'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daily_operational_snapshots" (
	"date" date PRIMARY KEY NOT NULL,
	"day_of_week" text NOT NULL,
	"dau" integer DEFAULT 0 NOT NULL,
	"unique_logins" integer DEFAULT 0 NOT NULL,
	"new_registered_players" integer DEFAULT 0 NOT NULL,
	"total_sc_staked" numeric(20, 4) DEFAULT 0 NOT NULL,
	"total_sc_won" numeric(20, 4) DEFAULT 0 NOT NULL,
	"total_ggr_sc" numeric(20, 4) DEFAULT 0 NOT NULL,
	"total_ngr_sc" numeric(20, 4) DEFAULT 0 NOT NULL,
	"total_gc_staked" numeric(20, 4) DEFAULT 0 NOT NULL,
	"total_deposits_usd" numeric(20, 4) DEFAULT 0 NOT NULL,
	"depositors_count" integer DEFAULT 0 NOT NULL,
	"first_time_purchasers" integer DEFAULT 0 NOT NULL,
	"withdrawals_requested_sc" numeric(20, 4) DEFAULT 0 NOT NULL,
	"withdrawals_completed_sc" numeric(20, 4) DEFAULT 0 NOT NULL,
	"withdrawals_completed_usd" numeric(20, 4) DEFAULT 0 NOT NULL,
	"bonus_amoe" numeric(20, 4) DEFAULT 0 NOT NULL,
	"bonus_tier" numeric(20, 4) DEFAULT 0 NOT NULL,
	"bonus_daily" numeric(20, 4) DEFAULT 0 NOT NULL,
	"bonus_package" numeric(20, 4) DEFAULT 0 NOT NULL,
	"bonus_welcome" numeric(20, 4) DEFAULT 0 NOT NULL,
	"bonus_jackpot" numeric(20, 4) DEFAULT 0 NOT NULL,
	"bonus_referral" numeric(20, 4) DEFAULT 0 NOT NULL,
	"bonus_affiliate" numeric(20, 4) DEFAULT 0 NOT NULL,
	"bonus_promotion" numeric(20, 4) DEFAULT 0 NOT NULL,
	"bonus_weekly_tier" numeric(20, 4) DEFAULT 0 NOT NULL,
	"bonus_monthly_tier" numeric(20, 4) DEFAULT 0 NOT NULL,
	"bonus_admin_added_sc" numeric(20, 4) DEFAULT 0 NOT NULL,
	"bonus_crm_promocode" numeric(20, 4) DEFAULT 0 NOT NULL,
	"bonus_purchase_promocode" numeric(20, 4) DEFAULT 0 NOT NULL,
	"bonus_total" numeric(20, 4) DEFAULT 0 NOT NULL,
	"abp_per_dau" numeric(10, 2),
	"aggr_per_dau" numeric(10, 2),
	"angr_per_dau" numeric(10, 2),
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"generation_duration_ms" integer,
	"source_hash" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daily_per_affiliate_snapshot" (
	"date" date NOT NULL,
	"affiliate_id" uuid NOT NULL,
	"attributed_signups" integer DEFAULT 0 NOT NULL,
	"attributed_active_players" integer DEFAULT 0 NOT NULL,
	"attributed_deposits_usd" numeric(20, 4) DEFAULT 0 NOT NULL,
	"attributed_ngr_sc" numeric(20, 4) DEFAULT 0 NOT NULL,
	"payout_owed_sc" numeric(20, 4) DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_per_affiliate_snapshot_date_affiliate_id_pk" PRIMARY KEY("date","affiliate_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daily_per_game_snapshot" (
	"date" date NOT NULL,
	"game_id" uuid NOT NULL,
	"unique_players" integer DEFAULT 0 NOT NULL,
	"total_rounds" integer DEFAULT 0 NOT NULL,
	"total_bet_sc" numeric(20, 4) DEFAULT 0 NOT NULL,
	"total_win_sc" numeric(20, 4) DEFAULT 0 NOT NULL,
	"ggr_sc" numeric(20, 4) DEFAULT 0 NOT NULL,
	"rtp_realized" numeric(5, 4),
	"rtp_expected" numeric(5, 4),
	CONSTRAINT "daily_per_game_snapshot_date_game_id_pk" PRIMARY KEY("date","game_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daily_per_state_snapshot" (
	"date" date NOT NULL,
	"state" text NOT NULL,
	"dau" integer DEFAULT 0 NOT NULL,
	"new_signups" integer DEFAULT 0 NOT NULL,
	"total_deposited_usd" numeric(20, 4) DEFAULT 0 NOT NULL,
	"total_redeemed_usd" numeric(20, 4) DEFAULT 0 NOT NULL,
	"total_staked_sc" numeric(20, 4) DEFAULT 0 NOT NULL,
	"total_ggr_sc" numeric(20, 4) DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_per_state_snapshot_date_state_pk" PRIMARY KEY("date","state")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daily_redemption_rate_snapshot" (
	"date" date PRIMARY KEY NOT NULL,
	"revenue_usd" numeric(20, 4) DEFAULT 0 NOT NULL,
	"redemptions_usd" numeric(20, 4) DEFAULT 0 NOT NULL,
	"pending_usd" numeric(20, 4) DEFAULT 0 NOT NULL,
	"cumulative_revenue_usd" numeric(20, 4) DEFAULT 0 NOT NULL,
	"cumulative_redemptions_usd" numeric(20, 4) DEFAULT 0 NOT NULL,
	"daily_redemption_rate" numeric(5, 4),
	"lifetime_redemption_rate" numeric(5, 4),
	"per_state" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"export_type" text NOT NULL,
	"query_spec" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"row_count" integer,
	"size_bytes" bigint,
	"r2_key" text,
	"download_url" text,
	"expires_at" timestamp with time zone,
	"requires_review" boolean DEFAULT false NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"reason" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exports_status_check" CHECK ("exports"."status" in ('pending', 'running', 'complete', 'failed', 'expired'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"report_kind" text NOT NULL,
	"query_spec" jsonb,
	"schedule" text NOT NULL,
	"email_to" text[] NOT NULL,
	"email_subject" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_sent_at" timestamp with time zone,
	"next_due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "migration_column_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_file" text NOT NULL,
	"source_column" text NOT NULL,
	"target_table" text NOT NULL,
	"target_column" text NOT NULL,
	"transform" text,
	"transform_expression" text,
	"notes" text,
	CONSTRAINT "migration_column_mappings_unique" UNIQUE("source_file","source_column","target_table","target_column")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "migration_id_map" (
	"source_table" text NOT NULL,
	"gamma_id" text NOT NULL,
	"casino_id" uuid NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "migration_id_map_source_table_gamma_id_pk" PRIMARY KEY("source_table","gamma_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "migration_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_date" date NOT NULL,
	"source" text NOT NULL,
	"table_name" text NOT NULL,
	"rows_in_source" integer NOT NULL,
	"rows_imported" integer NOT NULL,
	"rows_skipped" integer NOT NULL,
	"rows_failed" integer NOT NULL,
	"status" text NOT NULL,
	"error_summary" text,
	"mapping_config" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tax_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"tax_year" integer NOT NULL,
	"form_type" text NOT NULL,
	"total_amount_usd" numeric(20, 4) NOT NULL,
	"redemption_count" integer NOT NULL,
	"status" text DEFAULT 'pending_generation' NOT NULL,
	"generated_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"filed_at" timestamp with time zone,
	"delivery_method" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_reports_player_year_form_unique" UNIQUE("player_id","tax_year","form_type"),
	CONSTRAINT "tax_reports_status_check" CHECK ("tax_reports"."status" in ('pending_generation', 'generated', 'delivered', 'filed', 'cancelled'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wallets" ADD CONSTRAINT "wallets_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "kyc_status" ADD CONSTRAINT "kyc_status_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "compliance_flags" ADD CONSTRAINT "compliance_flags_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "geo_history" ADD CONSTRAINT "geo_history_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin_adjustments" ADD CONSTRAINT "admin_adjustments_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "game_providers" ADD CONSTRAINT "game_providers_aggregator_id_aggregators_id_fk" FOREIGN KEY ("aggregator_id") REFERENCES "public"."aggregators"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "games" ADD CONSTRAINT "games_provider_id_game_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."game_providers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tier_history" ADD CONSTRAINT "tier_history_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tier_history" ADD CONSTRAINT "tier_history_from_tier_id_tiers_id_fk" FOREIGN KEY ("from_tier_id") REFERENCES "public"."tiers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tier_history" ADD CONSTRAINT "tier_history_to_tier_id_tiers_id_fk" FOREIGN KEY ("to_tier_id") REFERENCES "public"."tiers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tier_progress" ADD CONSTRAINT "tier_progress_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tier_progress" ADD CONSTRAINT "tier_progress_current_tier_id_tiers_id_fk" FOREIGN KEY ("current_tier_id") REFERENCES "public"."tiers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "packages" ADD CONSTRAINT "packages_min_tier_id_tiers_id_fk" FOREIGN KEY ("min_tier_id") REFERENCES "public"."tiers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bonuses" ADD CONSTRAINT "bonuses_min_tier_id_tiers_id_fk" FOREIGN KEY ("min_tier_id") REFERENCES "public"."tiers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bonuses_awarded" ADD CONSTRAINT "bonuses_awarded_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bonuses_awarded" ADD CONSTRAINT "bonuses_awarded_bonus_id_bonuses_id_fk" FOREIGN KEY ("bonus_id") REFERENCES "public"."bonuses"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_bonus_id_bonuses_id_fk" FOREIGN KEY ("bonus_id") REFERENCES "public"."bonuses"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_min_tier_id_tiers_id_fk" FOREIGN KEY ("min_tier_id") REFERENCES "public"."tiers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_bonus_award_id_bonuses_awarded_id_fk" FOREIGN KEY ("bonus_award_id") REFERENCES "public"."bonuses_awarded"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "affiliate_attribution" ADD CONSTRAINT "affiliate_attribution_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "affiliate_attribution" ADD CONSTRAINT "affiliate_attribution_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "affiliate_codes" ADD CONSTRAINT "affiliate_codes_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "affiliate_payouts" ADD CONSTRAINT "affiliate_payouts_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "affiliates" ADD CONSTRAINT "affiliates_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchases" ADD CONSTRAINT "purchases_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchases" ADD CONSTRAINT "purchases_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_instruments" ADD CONSTRAINT "payment_instruments_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_payment_instrument_id_payment_instruments_id_fk" FOREIGN KEY ("payment_instrument_id") REFERENCES "public"."payment_instruments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "player_30d_stats" ADD CONSTRAINT "player_30d_stats_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "player_game_stats" ADD CONSTRAINT "player_game_stats_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "player_game_stats" ADD CONSTRAINT "player_game_stats_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "player_lifetime_stats" ADD CONSTRAINT "player_lifetime_stats_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_campaigns" ADD CONSTRAINT "crm_campaigns_segment_id_crm_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."crm_segments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_flow_enrollments" ADD CONSTRAINT "crm_flow_enrollments_flow_id_crm_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."crm_flows"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_flow_enrollments" ADD CONSTRAINT "crm_flow_enrollments_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_flow_steps" ADD CONSTRAINT "crm_flow_steps_flow_id_crm_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."crm_flows"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin_dashboard_layouts" ADD CONSTRAINT "admin_dashboard_layouts_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin_notes" ADD CONSTRAINT "admin_notes_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin_notes" ADD CONSTRAINT "admin_notes_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin_permissions" ADD CONSTRAINT "admin_permissions_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin_permissions" ADD CONSTRAINT "admin_permissions_granted_by_admins_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin_role_assignments" ADD CONSTRAINT "admin_role_assignments_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin_role_assignments" ADD CONSTRAINT "admin_role_assignments_role_id_admin_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."admin_roles"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin_role_assignments" ADD CONSTRAINT "admin_role_assignments_granted_by_admins_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin_saved_views" ADD CONSTRAINT "admin_saved_views_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_revoked_by_admins_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "custom_query_definitions" ADD CONSTRAINT "custom_query_definitions_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "banners" ADD CONSTRAINT "banners_audience_segment_id_crm_segments_id_fk" FOREIGN KEY ("audience_segment_id") REFERENCES "public"."crm_segments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_parent_id_email_templates_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."email_templates"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sms_templates" ADD CONSTRAINT "sms_templates_parent_id_sms_templates_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sms_templates"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "aml_review_queue" ADD CONSTRAINT "aml_review_queue_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_per_affiliate_snapshot" ADD CONSTRAINT "daily_per_affiliate_snapshot_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_per_game_snapshot" ADD CONSTRAINT "daily_per_game_snapshot_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exports" ADD CONSTRAINT "exports_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exports" ADD CONSTRAINT "exports_reviewed_by_admins_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."admins"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report_subscriptions" ADD CONSTRAINT "report_subscriptions_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tax_reports" ADD CONSTRAINT "tax_reports_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "players_email_idx" ON "players" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "players_username_idx" ON "players" USING btree (lower("username")) WHERE "players"."username" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "players_status_idx" ON "players" USING btree ("status") WHERE "players"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "players_kyc_level_idx" ON "players" USING btree ("kyc_level");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "players_attributed_affiliate_idx" ON "players" USING btree ("attributed_affiliate_id") WHERE "players"."attributed_affiliate_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "players_last_seen_idx" ON "players" USING btree ("last_seen_at" desc) WHERE "players"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "players_last_login_idx" ON "players" USING btree ("last_login_at" desc) WHERE "players"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "players_state_idx" ON "players" USING btree ("state","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "players_gamma_id_idx" ON "players" USING btree ("gamma_user_id") WHERE "players"."gamma_user_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "players_real_users_idx" ON "players" USING btree ("id") WHERE "players"."is_internal_account" = false and "players"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "players_phone_idx" ON "players" USING btree ("phone") WHERE "players"."phone" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallets_player_idx" ON "wallets" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kyc_status_footprint_id_idx" ON "kyc_status" USING btree ("footprint_user_id") WHERE "kyc_status"."footprint_user_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kyc_status_status_idx" ON "kyc_status" USING btree ("footprint_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kyc_status_watchlist_idx" ON "kyc_status" USING btree ("watchlist_last_status","watchlist_last_check_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "compliance_flags_player_idx" ON "compliance_flags" USING btree ("player_id","created_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "compliance_flags_active_idx" ON "compliance_flags" USING btree ("player_id","flag_type") WHERE "compliance_flags"."cleared_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "compliance_flags_type_idx" ON "compliance_flags" USING btree ("flag_type","severity") WHERE "compliance_flags"."cleared_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "geo_history_player_idx" ON "geo_history" USING btree ("player_id","created_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "geo_history_action_idx" ON "geo_history" USING btree ("action","created_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "geo_history_ip_idx" ON "geo_history" USING btree ("ip");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "geo_history_state_idx" ON "geo_history" USING btree ("state","created_at" desc);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ledger_entries_source_dedup_idx" ON "ledger_entries" USING btree ("source","source_id","account_kind","account_id","leg","sub_bucket","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_account_idx" ON "ledger_entries" USING btree ("account_id","currency","created_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_player_idx" ON "ledger_entries" USING btree ("player_id","created_at" desc) WHERE "ledger_entries"."player_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_pair_idx" ON "ledger_entries" USING btree ("pair_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_entries_source_idx" ON "ledger_entries" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_adjustments_player_idx" ON "admin_adjustments" USING btree ("player_id","created_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_adjustments_admin_idx" ON "admin_adjustments" USING btree ("admin_id","created_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_adjustments_pending_idx" ON "admin_adjustments" USING btree ("created_at") WHERE "admin_adjustments"."requires_approval" = true and "admin_adjustments"."approved_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_providers_aggregator_idx" ON "game_providers" USING btree ("aggregator_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "game_rounds_external_idx" ON "game_rounds" USING btree ("external_round_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_rounds_player_idx" ON "game_rounds" USING btree ("player_id","created_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_rounds_session_idx" ON "game_rounds" USING btree ("session_id","created_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_rounds_game_idx" ON "game_rounds" USING btree ("game_id","created_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_sessions_player_idx" ON "game_sessions" USING btree ("player_id","started_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_sessions_game_idx" ON "game_sessions" USING btree ("game_id","started_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_sessions_status_idx" ON "game_sessions" USING btree ("status","started_at" desc) WHERE "game_sessions"."status" = 'active';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "games_provider_idx" ON "games" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "games_category_idx" ON "games" USING btree ("category","status") WHERE "games"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "games_status_idx" ON "games" USING btree ("status","customer_facing") WHERE "games"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "games_lobby_idx" ON "games" USING btree ("lobby_order") WHERE "games"."customer_facing" = true and "games"."status" = 'active';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "games_featured_idx" ON "games" USING btree ("is_featured") WHERE "games"."is_featured" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tier_history_player_idx" ON "tier_history" USING btree ("player_id","created_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tier_progress_tier_idx" ON "tier_progress" USING btree ("current_tier_id","current_xp" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tier_progress_level_idx" ON "tier_progress" USING btree ("current_tier_level" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "packages_status_idx" ON "packages" USING btree ("status","sort_order") WHERE "packages"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "packages_first_purchase_idx" ON "packages" USING btree ("first_purchase_only") WHERE "packages"."first_purchase_only" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bonuses_type_idx" ON "bonuses" USING btree ("bonus_type","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bonuses_active_idx" ON "bonuses" USING btree ("status","valid_from","valid_until") WHERE "bonuses"."status" = 'active';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bonuses_awarded_player_idx" ON "bonuses_awarded" USING btree ("player_id","created_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bonuses_awarded_active_idx" ON "bonuses_awarded" USING btree ("player_id","status") WHERE "bonuses_awarded"."status" = 'active';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bonuses_awarded_bonus_idx" ON "bonuses_awarded" USING btree ("bonus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bonuses_awarded_expiring_idx" ON "bonuses_awarded" USING btree ("expires_at") WHERE "bonuses_awarded"."status" = 'active' and "bonuses_awarded"."expires_at" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promo_codes_code_idx" ON "promo_codes" USING btree ("code") WHERE "promo_codes"."status" = 'active';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promo_codes_bonus_idx" ON "promo_codes" USING btree ("bonus_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promo_redemptions_player_idx" ON "promo_redemptions" USING btree ("player_id","redeemed_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "promo_redemptions_code_idx" ON "promo_redemptions" USING btree ("promo_code_id","redeemed_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "affiliate_attribution_affiliate_idx" ON "affiliate_attribution" USING btree ("affiliate_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "affiliate_attribution_player_idx" ON "affiliate_attribution" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "affiliate_codes_affiliate_idx" ON "affiliate_codes" USING btree ("affiliate_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "affiliate_payouts_affiliate_idx" ON "affiliate_payouts" USING btree ("affiliate_id","created_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "affiliate_payouts_status_idx" ON "affiliate_payouts" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "affiliates_status_idx" ON "affiliates" USING btree ("status","total_ngr_attributed_sc" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "affiliates_player_idx" ON "affiliates" USING btree ("player_id") WHERE "affiliates"."player_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchases_player_idx" ON "purchases" USING btree ("player_id","created_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchases_status_idx" ON "purchases" USING btree ("status","created_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchases_finix_idx" ON "purchases" USING btree ("finix_transfer_id") WHERE "purchases"."finix_transfer_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchases_pending_idx" ON "purchases" USING btree ("created_at") WHERE "purchases"."status" = 'pending';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_instruments_player_idx" ON "payment_instruments" USING btree ("player_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "redemptions_player_idx" ON "redemptions" USING btree ("player_id","created_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "redemptions_status_idx" ON "redemptions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "redemptions_pending_review_idx" ON "redemptions" USING btree ("created_at") WHERE "redemptions"."status" in ('pending_review', 'kyc_pending', 'aml_hold');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "redemptions_awaiting_webhook_idx" ON "redemptions" USING btree ("submitted_to_finix_at") WHERE "redemptions"."status" = 'awaiting_webhook';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_events_player_idx" ON "player_events" USING btree ("player_id","created_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_events_name_idx" ON "player_events" USING btree ("event_name","created_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_events_category_idx" ON "player_events" USING btree ("event_category","created_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_events_game_idx" ON "player_events" USING btree ("game_id","created_at" desc) WHERE "player_events"."game_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_30d_stats_active_idx" ON "player_30d_stats" USING btree ("last_login_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_30d_stats_wagered_idx" ON "player_30d_stats" USING btree ("wagered_sc_30d" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_game_stats_player_idx" ON "player_game_stats" USING btree ("player_id","total_bet_sc" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_game_stats_game_idx" ON "player_game_stats" USING btree ("game_id","total_bet_sc" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_game_stats_recent_idx" ON "player_game_stats" USING btree ("game_id","last_7d_wagered_sc" desc) WHERE "player_game_stats"."last_7d_wagered_sc" > 0;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_lifetime_stats_deposited_idx" ON "player_lifetime_stats" USING btree ("total_deposited_usd" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_lifetime_stats_ngr_idx" ON "player_lifetime_stats" USING btree ("ngr_sc" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_lifetime_stats_last_purchase_idx" ON "player_lifetime_stats" USING btree ("last_purchase_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_campaigns_status_idx" ON "crm_campaigns" USING btree ("status","created_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_campaigns_segment_idx" ON "crm_campaigns" USING btree ("segment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_campaigns_scheduled_idx" ON "crm_campaigns" USING btree ("scheduled_for") WHERE "crm_campaigns"."status" = 'scheduled';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_flow_enrollments_player_idx" ON "crm_flow_enrollments" USING btree ("player_id","flow_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_flow_enrollments_pending_idx" ON "crm_flow_enrollments" USING btree ("next_action_at") WHERE "crm_flow_enrollments"."status" = 'active';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_flow_steps_flow_idx" ON "crm_flow_steps" USING btree ("flow_id","step_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_flows_trigger_idx" ON "crm_flows" USING btree ("trigger_event","status") WHERE "crm_flows"."status" = 'active';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_message_log_player_idx" ON "crm_message_log" USING btree ("player_id","created_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_message_log_campaign_idx" ON "crm_message_log" USING btree ("campaign_id","created_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_message_log_status_idx" ON "crm_message_log" USING btree ("status","created_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_segments_status_idx" ON "crm_segments" USING btree ("status","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_notes_player_idx" ON "admin_notes" USING btree ("player_id","created_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_notes_pinned_idx" ON "admin_notes" USING btree ("player_id") WHERE "admin_notes"."pinned" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_permissions_admin_idx" ON "admin_permissions" USING btree ("admin_id") WHERE "admin_permissions"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_role_assignments_admin_idx" ON "admin_role_assignments" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_role_assignments_role_idx" ON "admin_role_assignments" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_saved_views_scope_idx" ON "admin_saved_views" USING btree ("scope","admin_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_sessions_admin_idx" ON "admin_sessions" USING btree ("admin_id","created_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_sessions_active_idx" ON "admin_sessions" USING btree ("expires_at") WHERE "admin_sessions"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admins_email_idx" ON "admins" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admins_status_idx" ON "admins" USING btree ("status") WHERE "admins"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id","occurred_at" desc) WHERE "audit_log"."actor_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_action_idx" ON "audit_log" USING btree ("action","occurred_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_resource_idx" ON "audit_log" USING btree ("resource_kind","resource_id","occurred_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_occurred_idx" ON "audit_log" USING btree ("occurred_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "banners_status_idx" ON "banners" USING btree ("status","sort_order") WHERE "banners"."status" = 'active';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "banners_schedule_idx" ON "banners" USING btree ("starts_at","ends_at") WHERE "banners"."status" = 'active';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_templates_slug_idx" ON "email_templates" USING btree ("slug") WHERE "email_templates"."is_current" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_player_idx" ON "notifications" USING btree ("player_id","created_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_unread_idx" ON "notifications" USING btree ("player_id") WHERE "notifications"."read_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_content_key_idx" ON "site_content" USING btree ("key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blocked_ips_active_idx" ON "blocked_ips" USING btree ("ip") WHERE "blocked_ips"."expires_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "aml_review_queue_open_idx" ON "aml_review_queue" USING btree ("created_at") WHERE "aml_review_queue"."status" = 'open';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "aml_review_queue_player_idx" ON "aml_review_queue" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pending_webhooks_status_idx" ON "pending_webhooks" USING btree ("status","received_at") WHERE "pending_webhooks"."status" in ('received', 'processing', 'failed');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pending_webhooks_provider_idx" ON "pending_webhooks" USING btree ("provider","received_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pending_webhooks_event_idx" ON "pending_webhooks" USING btree ("event_type","received_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_snapshots_date_idx" ON "daily_operational_snapshots" USING btree ("date" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_per_game_date_idx" ON "daily_per_game_snapshot" USING btree ("date" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exports_admin_idx" ON "exports" USING btree ("admin_id","created_at" desc);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exports_status_idx" ON "exports" USING btree ("status","created_at") WHERE "exports"."status" in ('pending', 'running');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exports_review_idx" ON "exports" USING btree ("created_at") WHERE "exports"."requires_review" = true and "exports"."reviewed_at" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_subscriptions_due_idx" ON "report_subscriptions" USING btree ("next_due_at") WHERE "report_subscriptions"."enabled" = true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "migration_id_map_casino_idx" ON "migration_id_map" USING btree ("casino_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tax_reports_year_idx" ON "tax_reports" USING btree ("tax_year","status");