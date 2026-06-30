-- docs/13 §3.2 — extend the migration_column_mappings seed with the rest
-- of the Gamma → CoinFrenzy column rules. 0002_seed.sql seeded a starter
-- subset (players.csv basics + a couple of redemption/purchase entries);
-- the rules below cover the columns actually consumed by the runtime
-- importers in packages/core/src/migration.
--
-- This is declarative — the mappings table is consulted at import time
-- so a column rename in Gamma's export can be addressed by an INSERT,
-- not a code deploy. Idempotent via the (source_file, source_column,
-- target_table, target_column) unique constraint.

INSERT INTO "migration_column_mappings"
  (source_file, source_column, target_table, target_column, transform, notes) VALUES
  -- players_data.csv — additional columns
  ('players_data.csv',         'Affiliate Id',                  'affiliate_attribution', 'affiliate_id',       'as-is',           'Foreign key resolved via migration_id_map for affiliates'),
  -- purchase_report.csv — per-player aggregates
  ('purchase_report.csv',      'User Id',                       'player_lifetime_stats',  NULL,                 'as-is',           'Join key (mapped to players.id via migration_id_map)'),
  ('purchase_report.csv',      'Total Deposited',               'player_lifetime_stats',  'total_deposited_usd','parse_money',     NULL),
  ('purchase_report.csv',      'SC Balance',                    'wallets',                'current_balance',    'parse_money',     'Synthesized via migration_balance bonus per docs/13 §4.5'),
  ('purchase_report.csv',      'Disabled User',                 'players',                'status',             'parse_disabled',  'true → status=suspended'),
  -- transactions_banking_data.csv — purchase rows
  ('transactions_banking_data.csv', 'Transaction Id',           'purchases',              'gamma_transaction_id','as-is',          'Idempotency key'),
  ('transactions_banking_data.csv', 'User Id',                  'purchases',              'player_id',          'as-is',           'Resolved via migration_id_map'),
  ('transactions_banking_data.csv', 'Amount',                   'purchases',              'amount_usd',         'parse_money',     NULL),
  ('transactions_banking_data.csv', 'Status',                   'purchases',              'status',             'as-is',           'Success→completed, Canceled→cancelled, etc.'),
  ('transactions_banking_data.csv', 'Finix Transfer Id',        'purchases',              'finix_transfer_id',  'dash_to_null',    NULL),
  ('transactions_banking_data.csv', 'Card Last 4',              'purchases',              'finix_card_last4',   'dash_to_null',    NULL),
  ('transactions_banking_data.csv', 'Card Brand',               'purchases',              'finix_card_brand',   'dash_to_null',    NULL),
  ('transactions_banking_data.csv', '3DS Result',               'purchases',              'finix_3ds_result',   'dash_to_null',    NULL),
  ('transactions_banking_data.csv', 'Created At',               'purchases',              'created_at',         'parse_datetime',  NULL),
  -- redeem_requests_data.csv — additional columns
  ('redeem_requests_data.csv', 'User Id',                       'redemptions',            'player_id',          'as-is',           'Resolved via migration_id_map'),
  ('redeem_requests_data.csv', 'SC Amount',                     'redemptions',            'amount_sc',          'parse_money',     NULL),
  ('redeem_requests_data.csv', 'USD Amount',                    'redemptions',            'amount_usd',         'parse_money',     NULL),
  ('redeem_requests_data.csv', 'Status',                        'redemptions',            'status',             'as-is',           'Success→paid'),
  ('redeem_requests_data.csv', 'Requested At',                  'redemptions',            'requested_at',       'parse_datetime',  NULL),
  ('redeem_requests_data.csv', 'Paid At',                       'redemptions',            'paid_at',            'parse_datetime',  NULL),
  -- merv_report.csv — daily KPI snapshots
  ('merv_report.csv',          'Date',                          'daily_operational_snapshots', 'date',          'parse_datetime',  NULL),
  ('merv_report.csv',          'DAU',                           'daily_operational_snapshots', 'dau',            'as-is',           NULL),
  ('merv_report.csv',          'New Signups',                   'daily_operational_snapshots', 'new_registered_players', 'as-is',  NULL),
  ('merv_report.csv',          'Total Deposits USD',            'daily_operational_snapshots', 'total_deposits_usd', 'parse_money', NULL),
  ('merv_report.csv',          'GGR SC',                        'daily_operational_snapshots', 'total_ggr_sc',   'parse_money',     NULL),
  ('merv_report.csv',          'NGR SC',                        'daily_operational_snapshots', 'total_ngr_sc',   'parse_money',     NULL),
  ('merv_report.csv',          'Total Staked SC',               'daily_operational_snapshots', 'total_sc_staked','parse_money',     NULL),
  -- affiliate_report.csv
  ('affiliate_report.csv',     'Affiliate Id',                  'affiliates',             'gamma_affiliate_id', 'as-is',           NULL),
  ('affiliate_report.csv',     'Username',                      'affiliates',             'username',           'dash_to_null',    NULL),
  ('affiliate_report.csv',     'Email',                         'affiliates',             'email',              'lower',           NULL),
  ('affiliate_report.csv',     'Full Name',                     'affiliates',             'display_name',       'dash_to_null',    NULL),
  ('affiliate_report.csv',     'Rev Share %',                   'affiliates',             'revenue_share_pct',  'parse_money',     'Stored as fraction 0-1'),
  ('affiliate_report.csv',     'Status',                        'affiliates',             'status',             'as-is',           NULL),
  ('affiliate_report.csv',     'Created Date',                  'affiliates',             'created_at',         'parse_datetime',  NULL)
ON CONFLICT (source_file, source_column, target_table, target_column) DO NOTHING;
--> statement-breakpoint
