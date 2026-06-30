-- docs/03 §17 step 24 — Cross-FK constraints added after every table exists.
-- These FKs span the migration ordering: most reference admins(id) from tables
-- defined before admins (because cross-FKs to admins are added at the end).

-- players.attributed_affiliate_id → affiliates(id)
ALTER TABLE "players"
  ADD CONSTRAINT "players_attributed_affiliate_id_fkey"
  FOREIGN KEY ("attributed_affiliate_id") REFERENCES "affiliates"("id");
--> statement-breakpoint

-- kyc_status.manual_decision_by → admins(id)
ALTER TABLE "kyc_status"
  ADD CONSTRAINT "kyc_status_manual_decision_by_fkey"
  FOREIGN KEY ("manual_decision_by") REFERENCES "admins"("id");
--> statement-breakpoint

-- compliance_flags.{created_by, cleared_by} → admins(id)
ALTER TABLE "compliance_flags"
  ADD CONSTRAINT "compliance_flags_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "admins"("id");
--> statement-breakpoint
ALTER TABLE "compliance_flags"
  ADD CONSTRAINT "compliance_flags_cleared_by_fkey"
  FOREIGN KEY ("cleared_by") REFERENCES "admins"("id");
--> statement-breakpoint

-- packages.bonus_id → bonuses(id)
ALTER TABLE "packages"
  ADD CONSTRAINT "packages_bonus_id_fkey"
  FOREIGN KEY ("bonus_id") REFERENCES "bonuses"("id");
--> statement-breakpoint

-- bonuses_awarded.awarded_by_admin → admins(id)
ALTER TABLE "bonuses_awarded"
  ADD CONSTRAINT "bonuses_awarded_awarded_by_admin_fkey"
  FOREIGN KEY ("awarded_by_admin") REFERENCES "admins"("id");
--> statement-breakpoint

-- promo_codes.created_by → admins(id)
ALTER TABLE "promo_codes"
  ADD CONSTRAINT "promo_codes_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "admins"("id");
--> statement-breakpoint

-- affiliate_payouts.approved_by → admins(id)
ALTER TABLE "affiliate_payouts"
  ADD CONSTRAINT "affiliate_payouts_approved_by_fkey"
  FOREIGN KEY ("approved_by") REFERENCES "admins"("id");
--> statement-breakpoint

-- admin_adjustments.{admin_id, approved_by} → admins(id)
ALTER TABLE "admin_adjustments"
  ADD CONSTRAINT "admin_adjustments_admin_id_fkey"
  FOREIGN KEY ("admin_id") REFERENCES "admins"("id");
--> statement-breakpoint
ALTER TABLE "admin_adjustments"
  ADD CONSTRAINT "admin_adjustments_approved_by_fkey"
  FOREIGN KEY ("approved_by") REFERENCES "admins"("id");
--> statement-breakpoint

-- redemptions.{approved_by, rejected_by} → admins(id)
ALTER TABLE "redemptions"
  ADD CONSTRAINT "redemptions_approved_by_fkey"
  FOREIGN KEY ("approved_by") REFERENCES "admins"("id");
--> statement-breakpoint
ALTER TABLE "redemptions"
  ADD CONSTRAINT "redemptions_rejected_by_fkey"
  FOREIGN KEY ("rejected_by") REFERENCES "admins"("id");
--> statement-breakpoint

-- site_content.updated_by → admins(id)
ALTER TABLE "site_content"
  ADD CONSTRAINT "site_content_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "admins"("id");
--> statement-breakpoint

-- email_templates.created_by → admins(id)
ALTER TABLE "email_templates"
  ADD CONSTRAINT "email_templates_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "admins"("id");
--> statement-breakpoint

-- sms_templates.created_by → admins(id)
ALTER TABLE "sms_templates"
  ADD CONSTRAINT "sms_templates_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "admins"("id");
--> statement-breakpoint

-- blocked_*.added_by → admins(id)
ALTER TABLE "blocked_emails"
  ADD CONSTRAINT "blocked_emails_added_by_fkey"
  FOREIGN KEY ("added_by") REFERENCES "admins"("id");
--> statement-breakpoint
ALTER TABLE "blocked_domains"
  ADD CONSTRAINT "blocked_domains_added_by_fkey"
  FOREIGN KEY ("added_by") REFERENCES "admins"("id");
--> statement-breakpoint
ALTER TABLE "blocked_ips"
  ADD CONSTRAINT "blocked_ips_added_by_fkey"
  FOREIGN KEY ("added_by") REFERENCES "admins"("id");
--> statement-breakpoint
ALTER TABLE "blocked_promo_codes"
  ADD CONSTRAINT "blocked_promo_codes_added_by_fkey"
  FOREIGN KEY ("added_by") REFERENCES "admins"("id");
--> statement-breakpoint

-- crm_*.created_by → admins(id)
ALTER TABLE "crm_segments"
  ADD CONSTRAINT "crm_segments_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "admins"("id");
--> statement-breakpoint
ALTER TABLE "crm_campaigns"
  ADD CONSTRAINT "crm_campaigns_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "admins"("id");
--> statement-breakpoint
ALTER TABLE "crm_flows"
  ADD CONSTRAINT "crm_flows_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "admins"("id");
--> statement-breakpoint

-- aml_review_queue.resolved_by → admins(id)
ALTER TABLE "aml_review_queue"
  ADD CONSTRAINT "aml_review_queue_resolved_by_fkey"
  FOREIGN KEY ("resolved_by") REFERENCES "admins"("id");
