-- Add purchase_amount, redemption_amount, ggr_amount, report_period, and
-- affiliate_username to ngr_data so the full CoinFrenzy push payload is stored.

alter table public.ngr_data
  add column if not exists purchase_amount   numeric(14,4) default 0,
  add column if not exists redemption_amount numeric(14,4) default 0,
  add column if not exists ggr_amount        numeric(14,4) default 0,
  add column if not exists report_period     text,
  add column if not exists affiliate_username text;
