-- 0019_blocked_domains_seed.sql
--
-- Seeds the `blocked_domains` table with the operator's existing Gamma
-- blocklist (49 domains) so the production cutover does not regress.
-- Anything already present (e.g. the dev fixtures from seed-fake-fixtures)
-- is preserved via ON CONFLICT (domain) DO NOTHING. The migration is
-- idempotent and safe to replay.
--
-- The categorization keywords below ("Disposable", "anonymity", "abuse
-- risk", "forwarder") line up with the regex in the /admin/domain-blocking
-- page so the rows show the correct category badge without UI changes.

INSERT INTO blocked_domains (domain, reason) VALUES
  ('mailinator.com',         'Disposable email service'),
  ('dispostable.com',        'Disposable email service'),
  ('fakeinbox.com',          'Disposable email service'),
  ('10minutemail.com',       'Disposable email service'),
  ('guerrillamail.com',      'Disposable email service'),
  ('throwawaymail.com',      'Disposable email service'),
  ('maildrop.cc',            'Disposable email service'),
  ('mytemp.email',           'Disposable email service'),
  ('temp-mail.org',          'Disposable email service'),
  ('tempmail.com',           'Disposable email service'),
  ('tempmailo.com',          'Disposable email service'),
  ('getnada.com',            'Disposable email service'),
  ('mohmal.com',             'Disposable email service'),
  ('minutemailbox.com',      'Disposable email service'),
  ('emailondeck.com',        'Disposable email service'),
  ('burnermail.io',          'Disposable email service'),
  ('spamgourmet.com',        'Aliased forwarder — abuse risk'),
  ('10mail.org',             'Disposable email service'),
  ('mailnesia.com',          'Disposable email service'),
  ('trashmail.com',          'Disposable email service'),
  ('inboxbear.com',          'Disposable email service'),
  ('mail7.io',               'Disposable email service'),
  ('sharklasers.com',        'Disposable email service'),
  ('fakemail.net',           'Disposable email service'),
  ('tutanota.com',           'High-anonymity provider — manual review'),
  ('protonmail.com',         'High-anonymity provider — manual review'),
  ('tempail.com',            'Disposable email service'),
  ('mailcatch.com',          'Disposable email service'),
  ('trashmail.net',          'Disposable email service'),
  ('trashmail.me',           'Disposable email service'),
  ('armyspy.com',            'Fake-identity service — abuse risk'),
  ('rhyta.com',              'Fake-identity service — abuse risk'),
  ('jourrapide.com',         'Fake-identity service — abuse risk'),
  ('easytrashmail.com',      'Disposable email service'),
  ('fakeinbox.net',          'Disposable email service'),
  ('emailtemp.org',          'Disposable email service'),
  ('privaterelay.appleid.com', 'Aliased forwarder — manual review'),
  ('moakt.com',              'Disposable email service'),
  ('harakirimail.com',       'Disposable email service'),
  ('airmail.cc',             'Disposable email service'),
  ('mailforspam.com',        'Disposable email service'),
  ('tempemail.co',           'Disposable email service'),
  ('spamotel.com',           'Disposable email service'),
  ('anonbox.net',            'Disposable email service'),
  ('24hourmail.com',         'Disposable email service'),
  ('instantemailaddress.com','Disposable email service'),
  ('klikmail.com',           'Disposable email service'),
  ('lroid.com',              'Disposable email service')
ON CONFLICT (domain) DO NOTHING;
