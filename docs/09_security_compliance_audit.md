# CoinFrenzy Platform — Security, Compliance & Audit

**Document:** 09 of 13
**Reads:** Doc 01 (Architecture), Doc 02 (Core Service Layer), Doc 03 v2 (Data Model)
**Read alongside:** Every other doc — security is cross-cutting
**Purpose:** Define the security model in implementation detail. Roles, permissions, RLS policies, audit trail, RG enforcement, jurisdiction logic, secrets handling, key rotation, incident response.

---

## 1. The threat model

Before defending we name what we're defending against. Five categories
of threat, in order of likelihood:

**Tier 1 — fraud (constant).** Carders testing stolen cards on
purchases, bot signups for welcome bonus abuse, multi-account
collusion to drain bonuses, refund/chargeback fraud (purchase + redeem
+ chargeback). This is your daily reality.

**Tier 2 — staff compromise (likely over years).** A support rep's
password leaks; a manager goes rogue and adjusts coins for a friend;
an ex-employee's session was never revoked. Your audit log is the
defense.

**Tier 3 — third-party compromise (uncommon but devastating).** Alea's
webhook signing key leaks; Finix's session token is stolen from a
proxy. Defense: HMAC + replay protection + integration health
monitoring.

**Tier 4 — application-layer attack (uncommon if we're careful).**
SQL injection in admin search, XSS in player names, CSRF on cashier
actions, SSRF in the affiliate referral URL. Defense: parameterized
queries everywhere (Drizzle enforces this), output encoding (React
enforces this), CSP headers, request-origin checks.

**Tier 5 — infrastructure attack (rare but possible).** DDoS against
the auth endpoint, credential stuffing, password reset email
hijacking. Defense: Vercel/Cloudflare DDoS protection, rate limits,
strong password requirements, email/phone verification.

Each section below maps to one or more of these threats.

---

## 2. The five trust zones

Every request comes from one of these zones. The zone determines what
the request can do.

### Zone 1 — Public (anonymous)

Marketing pages, login, signup, password reset, AMOE entry, legal
pages. No database access. No persistent state about the user. No
ability to mutate anything.

**Defenses:** rate limits (10 signups/IP/hour, 5 password resets/email/hour, 100 marketing page loads/IP/min), CAPTCHA on signup if signup rate from an IP exceeds threshold, no SQL queries that take user input without parameterization, CSP header denying inline scripts.

### Zone 2 — Player (authenticated)

Logged-in players. Better Auth session backed by Postgres. Can read
and write only their own data, enforced by RLS at the row level —
not just at the application level.

**Defenses:** RLS policies that check `auth.user_id() = players.id` on every row of every player-scoped table. The application can have a bug, the policy can't. Defense in depth.

### Zone 3 — Staff (scoped admin)

Logged-in admin/staff with a specific role. HMAC session (from Frenzy
Creator pattern, hardened — see §5). 2FA mandatory. Each role has a
permission scope (see §3) and cannot exceed it.

**Defenses:** role-based access control enforced in API middleware AND in the UI (UI hides what they can't do; API rejects if they try anyway). Every action writes to audit_log.

### Zone 4 — Master admin

You and a small handful of trusted operators (≤5 people). Everything
staff can do, plus admin coin adjustments, staff management, secrets
visibility (read-only), export center, infrastructure controls.

**Defenses:** hardware-key 2FA option (YubiKey) for the master tier, IP allowlist option, weekly login summary email to the admin themselves so they notice unauthorized logins.

### Zone 5 — System (no human)

Webhook handlers, worker jobs, cron jobs, migration scripts.
Authenticated by HMAC signatures from third parties OR by service-role
DB credentials. Bypass RLS because they need to.

**Defenses:** service-role credentials live only in Doppler, never in code; never exposed to a browser; rotated quarterly. Webhook HMAC keys per provider, rotated when provider supports it.

---

## 3. The role/permission matrix

Eight roles. Each is a row in `admin_roles`. Permissions are a 2D
matrix of (resource, action). The full table:

| Role | Players (read) | Players (write/suspend) | KYC (review/decide) | Cashier (approve redemption) | Cashier (large redemption >$1k) | Bonuses (award manually) | Admin Adjustments | Staff (manage) | CRM (segments/campaigns) | Game Ops (games/packages/tiers) | Reports (read all) | Audit Log (read) | Secrets (read) | Export Center |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Support** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | partial¹ | own actions | ❌ | ❌ |
| **KYC Reviewer** | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | partial¹ | own actions | ❌ | ❌ |
| **Cashier** | ✅ | ❌ | ❌ | ✅ (≤$1k) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | partial¹ | own actions | ❌ | ❌ |
| **Cashier Lead** | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | partial¹ | own actions | ❌ | ❌ |
| **Marketing** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ (CRM-flow only) | ❌ | ❌ | ✅ | ❌ | ✅ | own actions | ❌ | ✅ (CRM exports) |
| **Game Ops** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | own actions | ❌ | ❌ |
| **Manager** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (≤$1k) | ❌ | ✅ | ✅ | ✅ | all | ❌ | ✅ |
| **Master** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (unlimited) | ✅ | ✅ | ✅ | ✅ | all | ✅ (read-only) | ✅ |

¹ "partial" = scoped to the player records they're currently helping (i.e. they search for a player, open the case, then see relevant report data for that player only — not the org-wide report).

**A staff member can hold multiple roles.** Permissions are the UNION
of all granted roles. Permissions never subtract; they only add. A
support rep who also does cashier work holds Support + Cashier roles.

**Approval thresholds in code:**

```typescript
// packages/core/src/auth/permissions.ts
export const APPROVAL_THRESHOLDS = {
  cashier_redemption_approve: { 
    cashier: { max_usd: 1000 },
    cashier_lead: { max_usd: 10_000 },
    manager: { max_usd: 50_000 },
    master: { max_usd: Infinity },
  },
  admin_adjustment_grant: {
    manager: { max_usd_equivalent: 1000 },
    master: { max_usd_equivalent: Infinity },
  },
  player_suspend: {
    manager: { allowed: true },
    master: { allowed: true },
  },
} as const;
```

**Two-person rule for large adjustments:** any admin adjustment over
$5,000 USD-equivalent requires a second admin to approve before it
fires. Implemented via `admin_adjustments.requires_approval = true`
and a `approved_by/approved_at` pair. The ledger entry is written
only AFTER approval. This prevents a single rogue admin from draining
the platform.

---

## 4. RLS policies — defense in depth

RLS is on for every table. Default is deny. We open specific paths.
Below are the patterns, not the literal SQL for every table (Drizzle
generates the actual policies from these patterns).

### 4.1 The actor identification mechanism

Every request sets `app.actor_id` and `app.actor_kind` at the
connection level when the request enters the database transaction:

```sql
-- In every transaction opened from the app:
SET LOCAL app.actor_id    = '<player_uuid_or_admin_uuid>';
SET LOCAL app.actor_kind  = '<player|admin|system>';
SET LOCAL app.actor_role  = '<role_slug>';  -- only for admin
SET LOCAL app.request_id  = '<trace_id>';
```

Policies read these via `current_setting('app.actor_id', true)`. The
`true` second argument returns null instead of erroring if unset —
which means an unset variable cannot accidentally grant access (the
comparison `null = anything` is null/false).

### 4.2 Pattern: player-owned data

For tables like `wallets`, `purchases`, `redemptions`,
`bonuses_awarded`, `notifications`, `compliance_flags`:

```sql
-- Players can read their own rows
create policy {table}_player_read on {table} for select
  using (
    current_setting('app.actor_kind', true) = 'player'
    and player_id = current_setting('app.actor_id', true)::uuid
  );

-- Players cannot write to these tables directly (only via core service layer)
-- (No INSERT/UPDATE/DELETE policy for players — denied by default)

-- Admins can read all rows IF their role permits (enforced in core, this is a backstop)
create policy {table}_admin_read on {table} for select
  using (
    current_setting('app.actor_kind', true) = 'admin'
    and current_setting('app.actor_role', true) in 
      ('support', 'kyc_reviewer', 'cashier', 'cashier_lead', 'marketing', 'game_ops', 'manager', 'master')
  );

-- System role bypasses RLS entirely (uses service-role connection)
```

### 4.3 Pattern: ledger entries (special — only self-reads, scoped)

```sql
create policy ledger_entries_player_read on ledger_entries for select
  using (
    current_setting('app.actor_kind', true) = 'player'
    and player_id = current_setting('app.actor_id', true)::uuid
    and account_kind = 'player_wallet'  -- only their wallet entries, not house movements
  );

create policy ledger_entries_admin_read on ledger_entries for select
  using (
    current_setting('app.actor_kind', true) = 'admin'
    -- All admins can read all entries (with audit log of the read)
  );

-- No INSERT/UPDATE/DELETE policy for any non-system actor.
-- INSERTs happen only via the service-role connection in core/ledger.
```

### 4.4 Pattern: admin-only tables

For `admins`, `admin_roles`, `admin_permissions`, `audit_log`,
`house_accounts`, `admin_adjustments`:

```sql
create policy {table}_admin_read on {table} for select
  using (current_setting('app.actor_kind', true) = 'admin');

-- Specific writes (e.g. only master can write admin_roles)
create policy {table}_master_write on {table} for insert
  using (
    current_setting('app.actor_kind', true) = 'admin'
    and current_setting('app.actor_role', true) = 'master'
  );
```

### 4.5 Why RLS when the application also enforces?

Defense in depth. The application layer can have a bug. A bad join
might leak a player's wallet to another player's view. RLS makes that
bug fail closed instead of failing open — the bad query returns
empty rows instead of leaking data.

This is the most important defensive pattern in the system. We accept
the ~5-10% query overhead because the alternative is "trust application
code is bug-free," which is never true.

---

## 5. The session model

### 5.1 Player sessions (Better Auth)

Better Auth handles:
- Email/password signup
- Magic link login
- TOTP 2FA (optional for players, encouraged for VIPs)
- Session token in HTTP-only secure cookie
- 14-day session lifetime, refreshed on activity
- Revocation via `auth.sessions` table delete

We do not customize Better Auth's session model beyond:
1. Setting `app.actor_id` and `app.actor_kind = 'player'` on every authenticated request
2. Writing a `player_events` row of type `player.session.start` on login
3. Writing a `geo_history` row on every login (IP, country, state, VPN/proxy flags from Radar)

### 5.2 Admin sessions (HMAC, hardened)

Pattern is from Frenzy Creator's `adminAuth.js`, with five upgrades.

**The token structure:**

```
HMAC-SHA256( body=base64({
  session_id: uuid,        // NEW — server-side row in admin_sessions for revocation
  admin_id:   uuid,
  role:       string,
  exp:        unix_seconds, // 8 hours
  iat:        unix_seconds,
  bind_ip:    string,       // NEW — IP bound to this session (toggleable per role)
  bind_ua:    string,       // NEW — short hash of user agent
}), secret=ADMIN_SESSION_SECRET )
```

Signature is timing-safe-compared (the Frenzy Creator pattern). Token
sent as `Authorization: Bearer <token>` header AND in a secure HTTP-only
cookie (cookie is the default; header is for API testing).

**Five upgrades from Frenzy Creator:**

1. **`session_id` allows revocation.** Stored in `admin_sessions` table with `revoked_at` column. Every request verifies the session_id exists AND has `revoked_at IS NULL` AND `expires_at > now()`.

2. **`bind_ip` ties session to IP.** If the request IP doesn't match `bind_ip`, force re-auth. Toggleable per role — turn off for traveling execs whose IP changes. Default: on for all roles.

3. **`bind_ua` ties session to a coarse user-agent hash.** Catches the simple case of "someone exfiltrated my cookie and used it from their browser." User-agent hash is coarse enough (browser+OS major versions) that a Chrome update doesn't log you out.

4. **2FA mandatory on first login of every session.** Even if you've TOTP'd before, every new session re-prompts. Increased friction; trivially worth it.

5. **Quarterly secret rotation with 7-day overlap.** `ADMIN_SESSION_SECRET` and `ADMIN_SESSION_SECRET_PREV`. New sessions sign with current; verifier accepts either. After 7 days, drop the previous secret. Automated via Doppler rotation.

### 5.3 System credentials

Three sets:
- **Webhook HMAC keys per provider** — rotated when provider supports rotation (Finix supports it; Alea per their docs).
- **Service-role DB credentials** — rotated quarterly. Used only by worker and webhook handlers. Never exposed to browser. Stored in Doppler.
- **Provider API keys** — rotated quarterly OR when provider supports per-call signing instead of static keys.

---

## 6. The audit log — what gets logged

`audit_log` (Doc 03 §8) captures every meaningful action. Three rules:

### 6.1 Rule 1 — every admin action writes a row

Every endpoint in `app/api/admin/*` writes one or more audit entries.
Pattern:

```typescript
// At the end of every admin API handler
await audit.write(ctx, {
  action: 'redemption.approve',
  resource_kind: 'redemption',
  resource_id: redemption.id,
  before: { status: 'pending' },
  after:  { status: 'approved', approved_by: ctx.actor.adminId },
  reason: req.body.reason,
});
```

This is enforced by middleware that wraps every admin route — if the
handler doesn't call `audit.write()`, the response is held and the
middleware writes a generic audit entry. Better noisy than missing.

### 6.2 Rule 2 — every authentication event writes a row

Login (success), login (failure), password reset request, 2FA enable,
2FA disable, session revoke, password change. All audit-logged.

```typescript
// Examples
'auth.login.success'
'auth.login.failure.bad_password'
'auth.login.failure.bad_totp'
'auth.login.failure.account_locked'
'auth.password.reset.requested'
'auth.password.reset.completed'
'auth.totp.enabled'
'auth.session.revoked'
```

### 6.3 Rule 3 — every system override writes a row

Any time the system bypasses normal flow — auto-approves a redemption
under daily threshold, auto-credits an affiliate, releases playthrough
on a bonus, escalates a fraud flag — an entry is written with
`actor_kind = 'system'` and the originating service.

### 6.4 What audit log entries CAN'T do

- Be updated (table-level rule denies UPDATE)
- Be deleted (table-level rule denies DELETE)
- Be exported in a way that lets an admin omit their own entries (export queries are scope-locked at the function level)

### 6.5 Audit log retention

Indefinite. We don't delete audit log rows. At ~5M entries/month and
~2KB per row, storage is ~10GB/year — cheap. After 25 months we
detach the old partitions to cold storage but they stay queryable.

---

## 7. Responsible gaming enforcement

Three pillars: self-exclusion, deposit limits, session limits.

### 7.1 Self-exclusion

Player goes to Settings → Responsible Gaming → Self-Exclude → picks
duration (1 day, 7 days, 30 days, 1 year, permanent). On submit:

1. A `compliance_flags` row is written: `flag_type='self_exclusion'`, `expires_at` set per choice, `severity='block'`.
2. Player's active sessions are revoked.
3. Player's status updates to `self_excluded`.
4. Welcome email + SMS (if consented) confirming.
5. Audit log entry.

During exclusion: player cannot log in (login endpoint checks
compliance_flags before issuing session). Player CAN log in to view
their account on the `/account` page after entering email + DOB, but
cannot deposit, play, or change exclusion. They CAN extend it.

**The big rule:** a player cannot un-self-exclude during the exclusion
period. Period. Not even a Master admin can shorten it. This is the
single rule the audit log catches most.

### 7.2 Deposit limits

Player sets daily/weekly/monthly USD caps. Stored on
`players.rg_deposit_limit_*`. Enforced in the purchase flow:

```typescript
// In core/purchase/eligibility.ts
const window24h = await sumDepositsInWindow(playerId, '24h');
if (window24h + thisPurchase > player.rg_deposit_limit_daily) {
  return err({ code: 'RG_DAILY_LIMIT_EXCEEDED', remaining: ... });
}
```

**Increasing a limit takes 24 hours to take effect.** This is industry
standard and required by many jurisdictions. Decreases are immediate.

### 7.3 Session limits

Player sets a max session duration. Enforced by client-side timer +
server-side session check on every API call:

```typescript
// On every authenticated player request
if (player.rg_session_limit_min && 
    now() - session.started_at > player.rg_session_limit_min * 60) {
  await revokeSession(session.id, 'rg_session_limit_reached');
  return 401;
}
```

Player gets a UI countdown warning at 5 minutes and 1 minute before
auto-logout. After auto-logout, they can re-login (it resets the
timer for the next session).

### 7.4 RG dashboard for admins

Manager+ can see:
- Players currently self-excluded (count + list)
- Players approaching deposit limits (>80% of limit consumed)
- Self-exclusion duration distribution
- Reactivation rate after exclusion ends

This is what regulators ask for in audits.

---

## 8. Jurisdiction logic

Eleven blocked states currently per your operations: CA, CT, ID, LA,
MI, MT, NV, NJ, NY, TN, WA. Maintained in code:

```typescript
// packages/core/src/compliance/jurisdictions.ts

export const BLOCKED_STATES = new Set([
  'CA', 'CT', 'ID', 'LA', 'MI', 'MT', 'NV', 'NJ', 'NY', 'TN', 'WA',
]);

export const RESTRICTED_FEATURES_BY_STATE: Record<string, RestrictedFeatures> = {
  // Example: if a state someday allows play but not redemption
  // 'XX': { canPlay: true, canRedeem: false, reason: 'state_redemption_block' },
};

export function checkJurisdiction(state: string | null, action: 'signup' | 'play' | 'redeem' | 'purchase'): JurisdictionCheck {
  if (!state) return { allowed: false, reason: 'unknown_state' };
  if (BLOCKED_STATES.has(state)) return { allowed: false, reason: 'state_blocked' };
  
  const restrictions = RESTRICTED_FEATURES_BY_STATE[state];
  if (restrictions) {
    if (action === 'play' && !restrictions.canPlay) return { allowed: false, reason: restrictions.reason };
    if (action === 'redeem' && !restrictions.canRedeem) return { allowed: false, reason: restrictions.reason };
    // etc
  }
  
  return { allowed: true };
}
```

### 8.1 What gets checked when

- **Signup** — check state from registration form. If blocked, allow signup (so they can play GC for fun) but flag the wallet so SC is never awarded and redemption is impossible. (Some operators block signup entirely; we permit GC-only play because it's a marketing funnel for if/when they move states.)
- **Login** — check current IP-resolved state via Radar. If different from registered state and now in a blocked state, flag the session.
- **Purchase** — check IP-resolved state. If in a blocked state, refuse. (Even if registered in an allowed state.)
- **Game launch** — check IP-resolved state. If in a blocked state, refuse with a "geo restriction" message.
- **Redemption request** — check IP-resolved state AT TIME OF REQUEST AND at registered state. Both must be allowed.

### 8.2 The VPN problem

Radar flags VPN/proxy/tor. Our policy:
- VPN detected at signup → require additional verification
- VPN detected at gameplay → allow (lots of people use VPN legitimately) but log
- VPN detected at purchase → refuse (fraud risk)
- VPN detected at redemption → refuse (sweepstakes compliance)

---

## 9. Secrets handling

### 9.1 Where secrets live

Three places:
- **Doppler** — primary source for everything. Three configs: `dev`, `staging`, `prod`. Per-config secret values.
- **Vercel env vars** — pulled from Doppler at deploy time.
- **Fly.io secrets** — pulled from Doppler at deploy time.

Never in `.env` files committed to git. Never in plaintext anywhere
queryable. Never in code.

### 9.2 What goes in Doppler

Full list (each is one secret in Doppler):

```
# Database
DATABASE_URL                                 (Neon connection string)
DATABASE_URL_DIRECT                          (Neon direct, no pooling — for migrations)
REDIS_URL                                    (Upstash)

# Auth
BETTER_AUTH_SECRET                           (32+ bytes random)
ADMIN_SESSION_SECRET                         (current, 32+ bytes)
ADMIN_SESSION_SECRET_PREV                    (previous, for 7-day rotation overlap)

# Adapters — Alea
ALEA_API_BASE
ALEA_API_KEY
ALEA_WEBHOOK_SECRET

# Adapters — Finix
FINIX_API_KEY
FINIX_APPLICATION_ID                         (publicly visible per Finix's model, but bundled here)
FINIX_WEBHOOK_SECRET

# Adapters — Footprint
FOOTPRINT_API_KEY
FOOTPRINT_WEBHOOK_SECRET
FOOTPRINT_PLAYBOOK_ID

# Adapters — Radar
RADAR_API_KEY                                (server-side; do NOT use the publishable key)

# Adapters — Communication
SENDGRID_API_KEY
SENDGRID_FROM_EMAIL
SENDGRID_WEBHOOK_SECRET
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_WEBHOOK_SECRET

# Adapters — Other
EASYSCAM_API_KEY                             (AMOE provider)
INTERCOM_ACCESS_TOKEN

# Infrastructure
INNGEST_EVENT_KEY
INNGEST_SIGNING_KEY
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET

# Observability
SENTRY_DSN
AXIOM_TOKEN
GRAFANA_API_KEY                              (for posting metrics)
PAGERDUTY_ROUTING_KEY                        (for alerting)

# Encryption keys (for app-layer encryption of sensitive fields)
ENCRYPTION_KEY_CURRENT                       (used for new writes)
ENCRYPTION_KEY_PREVIOUS                      (used for reading older data during rotation)
```

### 9.3 App-layer encryption

Some fields in the database are encrypted at the application layer
before insert (in addition to disk-level encryption Neon provides):

- `kyc_status.footprint_user_id` — encrypted
- `admins.totp_secret` — encrypted
- `admins.backup_codes` — encrypted
- `redemptions.ach_account_last4` — last 4 only; full number never stored
- `redemptions.ach_routing_last4` — last 4 only

Encryption is AES-256-GCM with `ENCRYPTION_KEY_CURRENT`. We never
store sensitive numbers in full (PAN, full bank account, SSN). Finix
and Footprint hold the real values; we hold tokenized references.

### 9.4 Key rotation

Quarterly schedule:

- Q1 — rotate `BETTER_AUTH_SECRET` (force all players to re-login)
- Q1 — rotate webhook secrets where provider supports it
- Q2 — rotate `ADMIN_SESSION_SECRET` (with 7-day overlap)
- Q2 — rotate `ENCRYPTION_KEY` (re-encrypt all encrypted columns gradually)
- Q3 — rotate adapter API keys per provider
- Q3 — rotate service-role DB credentials
- Q4 — rotate all the above as appropriate

All rotations have runbooks. All rotations are tested on staging
before prod.

---

## 10. Application-layer defenses

### 10.1 SQL injection

Prevented by Drizzle (parameterized queries always). The `.cursorrules`
file forbids raw SQL except in migrations. Pre-commit hook scans for
`db.execute(sql\`` patterns containing template interpolation.

### 10.2 XSS

Prevented by React (auto-escapes by default). One rule: never use
`dangerouslySetInnerHTML` with user content. Pre-commit hook scans
for it. CSP header denies inline scripts on both player and admin
surfaces.

### 10.3 CSRF

Better Auth sets SameSite=Lax cookies (default). Admin endpoints
additionally require a CSRF token in the request header that's set
per-session. Non-matching token → 403.

### 10.4 SSRF

Two exposed paths take URLs: affiliate referral URL preview (admin)
and KYC document URL fetch (system). Both are wrapped in:

```typescript
async function safeFetch(url: string): Promise<Response> {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('bad_protocol');
  
  // Resolve hostname and reject private/link-local
  const resolved = await dns.resolve(parsed.hostname);
  if (isPrivateIp(resolved)) throw new Error('private_ip_rejected');
  if (resolved === '127.0.0.1' || resolved === '::1') throw new Error('localhost_rejected');
  
  return fetch(url, { redirect: 'manual', timeout: 5000 });
}
```

### 10.5 Rate limits

| Endpoint                       | Limit                          | Storage |
| ------------------------------ | ------------------------------ | ------- |
| `/api/auth/login` (any)        | 5 per minute per IP            | Redis   |
| `/api/auth/login` (per email)  | 5 per 15min per email          | Redis   |
| `/api/auth/signup`             | 10 per hour per IP             | Redis   |
| `/api/auth/password-reset`     | 5 per hour per email           | Redis   |
| `/api/player/*` (catch-all)    | 100 per minute per session     | Redis   |
| `/api/admin/*` (catch-all)     | 300 per minute per admin       | Redis   |
| `/api/webhooks/*`              | 1000 per minute per provider   | Redis   |
| `/api/cron/*`                  | 1 per minute per cron job      | Redis   |

Implemented via Upstash rate-limit library. Exceeding → 429 with
`Retry-After` header.

### 10.6 Headers

Every response sets:
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (except for embeddable game iframes from approved Alea origins)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()`
- `Content-Security-Policy: ...` (see §10.7)

### 10.7 Content Security Policy

```
default-src 'self';
script-src  'self' https://*.alea.com https://*.evervault.com;
style-src   'self' 'unsafe-inline';                                  -- Tailwind needs inline styles
img-src     'self' data: https://images.coinfrenzy.com https://*.r2.cloudflarestorage.com;
font-src    'self';
connect-src 'self' https://api.coinfrenzy.com wss://realtime.coinfrenzy.com https://*.alea.com https://*.finix.com;
frame-src   'self' https://*.alea.com https://*.evervault.com;
form-action 'self';
base-uri    'self';
report-uri  https://o0.ingest.sentry.io/api/...
```

(Admin surface has a stricter CSP — no third-party script-src except Sentry.)

---

## 11. Incident response

### 11.1 Severity classification

- **SEV-1** — financial integrity at risk, customer-facing outage, suspected breach. PagerDuty fires. Response time: 15 minutes.
- **SEV-2** — feature broken for many users, integration partner down, audit log gap. Slack alert. Response time: 1 hour.
- **SEV-3** — bug affecting some users, recoverable on retry. Ticket. Response time: 1 business day.

### 11.2 SEV-1 runbook (the 8 events)

1. **Wallet ledger drift detected** (reconciliation finds a difference). On-call investigates per Doc 04 §9.4.
2. **Alea round reconciliation divergence**. On-call replays missing rounds per Doc 04 §7.2.
3. **Footprint webhook outage > 30 minutes**. Polling fallback engages automatically; on-call confirms.
4. **Finix webhook outage > 30 minutes**. Same — polling fallback engages.
5. **Admin session secret leak suspected**. Trigger immediate rotation; revoke all admin sessions; force re-login + 2FA.
6. **Player password breach suspected** (e.g. someone's email + hash appeared on a paste). Force password reset for affected users; email notification; trigger MFA where opted.
7. **DDoS in progress**. Cloudflare attack mode on; rate-limits tightened; PagerDuty notified.
8. **DB primary failover**. Neon handles automatically; on-call verifies and clears the page after replication catches up.

Each has a runbook in `/docs/runbooks/{name}.md`. Each runbook is
tested via game-day exercises quarterly.

### 11.3 Post-incident review

Every SEV-1 gets a written post-mortem within 5 business days. Format:
timeline, root cause, contributing factors, what worked, what didn't,
action items. Stored in `/docs/post-mortems/`. Reviewed in the
quarterly security review.

---

## 12. Compliance posture

### 12.1 What we're complying with

- **State sweepstakes laws** — 11 blocked states (§8); GC/SC dual currency model; AMOE entry channel via EasyScam.
- **KYC/AML** — Footprint handles Identity verification. Level 2 required for redemption. Level 3 (enhanced due diligence) for high-LTV players (>$10K lifetime deposit).
- **Card network rules** — Finix handles PCI. We never see PAN. 3DS on every card transaction (per Gamma's pattern).
- **GDPR/CCPA-style data rights** — full export of player data on request (Doc 12), full deletion on request (legal-hold preserved). 30-day SLA.
- **CAN-SPAM / TCPA** — explicit consent stored on `players.email_consent` and `players.sms_consent`; unsubscribe link in every marketing email; STOP support in SMS.

### 12.2 What we deliberately don't do

- **No PCI scope on our infrastructure.** Cards never touch our servers. Finix + Evervault handle it.
- **No SSN storage.** Footprint holds it. We hold a reference.
- **No biometric data storage.** Footprint handles it if they offer biometric verification.

### 12.3 Audit-readiness checklist

For state regulators or financial auditors:

- ✅ Full player audit trail (audit_log + ledger_entries, immutable, queryable)
- ✅ Self-exclusion records preserved indefinitely with timestamps
- ✅ KYC verification records (Footprint holds documents; we hold decisions + dates)
- ✅ Source-of-funds tracking (every purchase → Finix transfer ID + 3DS result)
- ✅ Redemption records with payment trail (every redemption → Finix transfer ID + bank account masked)
- ✅ Geo-location records (geo_history table; every login + every relevant action)
- ✅ Reconciliation reports (daily reconciliation, retained 7 years)
- ✅ Data deletion records (audit log entry for every GDPR/CCPA deletion request and outcome)

---

## 13. Cross-references to other docs

This security model is enforced by patterns in:
- **Doc 02** — Context object carries actor identity to every core function
- **Doc 03 v2** — RLS policies on every table; audit_log table immutable
- **Doc 04** — Ledger immutability via triggers; idempotency via unique constraints
- **Doc 05** (forthcoming) — Webhook signature verification per provider; replay protection
- **Doc 07** (forthcoming) — KYC gating on redemption; jurisdiction checks
- **Doc 13** (forthcoming) — Migration security (encrypted data at rest, scoped access)

Every code review against this doc asks: does the proposed change
weaken any of the patterns above? If yes, the change is rejected
until the security implication is addressed.

---

## 14. What's next

Doc 13 (Migration) comes next — it's the runbook for actually cutting
over from Gamma. Then Doc 08 (Admin Panel). Then once API docs land,
Docs 05/06/07.
