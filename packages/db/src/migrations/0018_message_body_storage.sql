-- docs/05 / docs/11 — full-body archival for crm_message_log.
--
-- Previously crm_message_log only stored the first 200 chars of the
-- email body in `body_preview`. For sweepstakes-casino AML/litigation
-- exposure we want the EXACT bytes we sent, retrievable months later.
-- Storing the full HTML in the (monthly-partitioned) table itself
-- balloons partition size and blows past TOAST limits for large mails.
--
-- Solution: stream the body to Cloudflare R2 and persist the object
-- key here. Detail dialog fetches via signed URL when an admin
-- explicitly asks "show full body". Key convention:
--   email-bodies/<yyyy>/<mm>/<dd>/<messageId>.html
--
-- The column is nullable because:
--   * Legacy rows pre-migration never had a body in R2.
--   * SMS / push entries don't have HTML bodies to archive.
--   * R2 may be unavailable transiently — we still log the send.

ALTER TABLE "crm_message_log"
  ADD COLUMN IF NOT EXISTS "body_storage_key" text;
--> statement-breakpoint
