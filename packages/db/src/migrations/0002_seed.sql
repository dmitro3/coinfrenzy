-- docs/03 §3.1, §4.1, §5.1, §10.1, §13, §15 — static seed data for
-- house_accounts, aggregators, tiers, admin_roles, integration_health,
-- and migration_column_mappings.
-- Idempotent: ON CONFLICT DO NOTHING so re-running the migration is safe.

-- house_accounts (docs/03 §3.1 — 12 rows)
INSERT INTO "house_accounts" (kind, currency, display_name, description) VALUES
  ('house_bank',               'USD', 'House USD bank',         'Settled cash from purchases and source for payouts'),
  ('house_winnings_gc',        'GC',  'House GC winnings',      'GC won by the house from player losses'),
  ('house_winnings_sc',        'SC',  'House SC winnings',      'SC won by the house from player losses'),
  ('bonus_pool_gc',            'GC',  'Bonus pool GC',          'Reserved GC for bonus awards'),
  ('bonus_pool_sc',            'SC',  'Bonus pool SC',          'Reserved SC for bonus awards'),
  ('amoe_pool_sc',             'SC',  'AMOE pool SC',           'Reserved SC for EasyScam mail-in entries'),
  ('affiliate_payable_sc',     'SC',  'Affiliate payable',      'SC owed to affiliates pending payout'),
  ('internal_account_sink_gc', 'GC',  'Internal GC sink',       'GC routed to comp/test accounts'),
  ('internal_account_sink_sc', 'SC',  'Internal SC sink',       'SC routed to comp/test accounts'),
  ('external',                 'USD', 'External USD',           'Cash flowing in/out of the system'),
  ('external',                 'GC',  'External GC',            'Synthetic for external GC flows'),
  ('external',                 'SC',  'External SC',            'Synthetic for external SC flows')
ON CONFLICT (kind, currency) DO NOTHING;
--> statement-breakpoint

-- aggregators (docs/03 §4.1)
INSERT INTO "aggregators" (slug, display_name) VALUES
  ('alea', 'AleaPlay')
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint

-- tiers (docs/03 §5.1 — 6 rows)
INSERT INTO "tiers" (slug, display_name, level, xp_required, weekly_sc_bonus, monthly_sc_bonus) VALUES
  ('rookie',   'Rookie',   1, 0,        0,    0),
  ('bronze',   'Bronze',   2, 1000,     1,    5),
  ('silver',   'Silver',   3, 10000,    5,    25),
  ('gold',     'Gold',     4, 50000,    25,   100),
  ('platinum', 'Platinum', 5, 200000,   100,  500),
  ('diamond',  'Diamond',  6, 1000000,  500,  2500)
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint

-- admin_roles (docs/03 §10.1 — 8 rows)
INSERT INTO "admin_roles" (slug, display_name, level, redemption_approve_max_usd, adjustment_max_usd) VALUES
  ('support',       'Support',         10, 0,        0),
  ('kyc_reviewer',  'KYC Reviewer',    20, 0,        0),
  ('cashier',       'Cashier',         30, 100000,   0),
  ('cashier_lead',  'Cashier Lead',    40, 1000000,  0),
  ('marketing',     'Marketing',       50, 0,        0),
  ('game_ops',      'Game Ops',        60, 0,        0),
  ('manager',       'Manager',         80, 5000000,  100000),
  ('master',        'Master',         100, NULL,     NULL)
ON CONFLICT (slug) DO NOTHING;
--> statement-breakpoint

-- integration_health (docs/03 §13 — 9 rows)
INSERT INTO "integration_health" (provider) VALUES
  ('finix'), ('alea'), ('footprint'), ('radar'),
  ('sendgrid'), ('twilio'), ('easyscam'), ('pusher'), ('inngest')
ON CONFLICT (provider) DO NOTHING;
--> statement-breakpoint

-- migration_column_mappings (docs/03 §15 — selection per v3 doc).
-- One mapping (Gamma 'rsg' freetext) parses into multiple rows rather than a
-- single column, so target_column must permit NULL.
ALTER TABLE "migration_column_mappings"
  ALTER COLUMN "target_column" DROP NOT NULL;
--> statement-breakpoint

INSERT INTO "migration_column_mappings"
  (source_file, source_column, target_table, target_column, transform, notes) VALUES
  ('players_data.csv',         'User Id',                       'players',                'gamma_user_id',      'as-is',           'Preserve original Gamma ID'),
  ('players_data.csv',         'User email',                    'players',                'email',              'lower',           NULL),
  ('players_data.csv',         'Username',                      'players',                'username',           'dash_to_null',    'Gamma uses "-" for missing'),
  ('players_data.csv',         'Name',                          'players',                'display_name',       'dash_to_null',    NULL),
  ('players_data.csv',         'Registration Date',             'players',                'first_seen_at',      'parse_datetime',  'MM/DD/YYYY'),
  ('players_data.csv',         'Last Login',                    'players',                'last_login_at',      'dash_to_null',    NULL),
  ('players_data.csv',         'rsg',                           'compliance_flags',       NULL,                 'parse_freetext',  'See parse_rsg_freetext() in Doc 13'),
  ('players_data.csv',         'Status',                        'players',                'status',             'parse_status',    NULL),
  ('purchase_report.csv',      'Total Reedemption Amount',      'player_lifetime_stats',  'total_redeemed_usd', 'as-is',           'Gamma typo "Reedemption"'),
  ('redeem_requests_data.csv', 'Payment Provider',              'redemptions',            'method',             'parse_method',    'BANK_ACCOUNT_FINIX → finix_ach'),
  ('redeem_requests_data.csv', 'Transaction Id',                'redemptions',            'finix_transfer_id',  'as-is',           NULL)
ON CONFLICT (source_file, source_column, target_table, target_column) DO NOTHING;
