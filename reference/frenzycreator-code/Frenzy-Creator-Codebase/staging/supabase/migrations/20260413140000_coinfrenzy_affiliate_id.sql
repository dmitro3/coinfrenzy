-- CoinFrenzy affiliate id returned from POST .../frenzy-creator/ (for PUT/DELETE sync)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS coinfrenzy_affiliate_id text;
