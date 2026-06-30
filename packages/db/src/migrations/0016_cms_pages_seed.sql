-- 0016_cms_pages_seed.sql
--
-- Seeds the dynamic CMS with the seven default static pages every
-- sweepstakes casino needs in its footer: Terms, Privacy, Cookies,
-- Sweepstakes Rules, Responsible Gaming, Bonus Terms, and Jackpot.
--
-- These pages live in `site_content` with `value_json.kind = 'page'`
-- so they show up under /admin/cms and render at /p/[slug]. The bodies
-- are intentionally minimal placeholders — counsel will replace them
-- before launch, and the operator can edit them in-place in the UI.
--
-- All seeds are idempotent: ON CONFLICT (key) DO NOTHING ensures we
-- never overwrite operator edits if this migration is replayed.

INSERT INTO site_content (key, value, value_json, version, audience, updated_by, created_at, updated_at) VALUES
(
  'terms-and-conditions',
  E'By using Coin Frenzy you agree to these terms. If you do not agree, do not use the site.\n\n## 1. Eligibility\n\nYou must be 18 or older and a resident of an eligible US state. See the Sweepstakes Rules for the current list.\n\n## 2. Currencies\n\nGold Coins have no monetary value. Sweepstakes Coins may be redeemed per the Sweepstakes Rules. No purchase necessary.\n\n## 3. Account Responsibility\n\nYou are responsible for safeguarding your account credentials and all activity on your account.\n\n## 4. Changes\n\nWe may update these terms from time to time. Material changes will be communicated in-product or by email.',
  '{"kind":"page","title":"Terms & Conditions","category":"legal","status":"active","seoDescription":"The terms that govern your use of Coin Frenzy."}'::jsonb,
  1,
  NULL,
  NULL,
  now(),
  now()
),
(
  'privacy-policy',
  E'## What we collect\n\nAccount info, gameplay activity, device and connection data, and anything you submit during KYC.\n\n## How we use it\n\nTo operate the platform, comply with regulations, prevent fraud, and personalise the experience.\n\n## Sharing\n\nWe share with payment, KYC, and analytics processors strictly to operate the service. We never sell your data.\n\n## Your rights\n\nContact privacy@coinfrenzy.com to request access, correction, or deletion of your data.',
  '{"kind":"page","title":"Privacy Policy","category":"legal","status":"active","seoDescription":"How Coin Frenzy collects, uses, and protects your information."}'::jsonb,
  1,
  NULL,
  NULL,
  now(),
  now()
),
(
  'cookie-policy',
  E'## What cookies we use\n\nStrictly necessary cookies for sessions, plus analytics cookies for product improvement.\n\n## Managing cookies\n\nYou can adjust cookie settings in your browser. Some site features require cookies to function.',
  '{"kind":"page","title":"Cookie Policy","category":"legal","status":"active","seoDescription":"How Coin Frenzy uses cookies and similar technologies."}'::jsonb,
  1,
  NULL,
  NULL,
  now(),
  now()
),
(
  'sweepstakes-rules',
  E'No purchase necessary. Void where prohibited.\n\n## Eligibility\n\nOpen to legal residents of the United States, 18 years or older, in eligible jurisdictions.\n\n## How to enter\n\nPlay games using Sweepstakes Coins, which are awarded with Gold Coin purchases or through free Alternate Method of Entry (AMOE) requests.\n\n## Prizes\n\nSweepstakes Coins may be redeemed for cash prizes per the redemption schedule, subject to KYC verification.\n\n## AMOE\n\nFree entry by postal mail — see the AMOE page for instructions.',
  '{"kind":"page","title":"Sweepstakes Rules","category":"legal","status":"active","seoDescription":"Official sweepstakes rules for Coin Frenzy."}'::jsonb,
  1,
  NULL,
  NULL,
  now(),
  now()
),
(
  'responsible-gaming',
  E'Coin Frenzy is meant to be fun. If it stops being fun, we want to help.\n\n## Limits\n\nYou can set deposit, loss, and time limits in your account settings. Limits take effect immediately.\n\n## Self-exclusion\n\nYou can self-exclude for 24 hours, 7 days, 30 days, or permanently. Once a permanent exclusion is set it cannot be reversed.\n\n## Resources\n\n- National Council on Problem Gambling: 1-800-GAMBLER\n- Gamblers Anonymous: www.gamblersanonymous.org',
  '{"kind":"page","title":"Responsible Social Gaming","category":"legal","status":"active","seoDescription":"Tools and resources to keep your gameplay fun and in control."}'::jsonb,
  1,
  NULL,
  NULL,
  now(),
  now()
),
(
  'bonus-terms',
  E'These terms apply to every bonus, promotion, and reward offered on Coin Frenzy.\n\n## Playthrough\n\nBonus coins must be played through at a multiplier specified on the offer. Until playthrough is satisfied, bonus coins are not eligible for redemption.\n\n## Eligibility\n\nBonuses are limited to one per household / IP / device unless otherwise stated. We reserve the right to deny bonuses for abuse.\n\n## Expiry\n\nUnclaimed and unredeemed bonus coins expire 30 days after award unless otherwise stated.',
  '{"kind":"page","title":"Bonus Terms","category":"legal","status":"active","seoDescription":"Terms that apply to bonuses and promotions on Coin Frenzy."}'::jsonb,
  1,
  NULL,
  NULL,
  now(),
  now()
),
(
  'jackpot',
  E'Coin Frenzy jackpots are funded by a portion of each Gold Coin wager and are awarded at random across qualifying games.\n\n## Tiers\n\n- **Mini** — paid out within hours\n- **Minor** — paid out within a day\n- **Major** — paid out within a week\n- **Mega** — paid out periodically across the network\n\n## Eligibility\n\nAny qualifying spin can win — there is no minimum bet to be eligible, though larger bets increase the odds of winning.',
  '{"kind":"page","title":"Jackpot","category":"promotions","status":"active","seoDescription":"How Coin Frenzy jackpots work."}'::jsonb,
  1,
  NULL,
  NULL,
  now(),
  now()
)
ON CONFLICT (key) DO NOTHING;
