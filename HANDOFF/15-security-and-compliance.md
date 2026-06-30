# 15 · Security and Compliance

This doc captures everything that's about keeping money, players, and
the regulator happy. The codebase enforces most of this at the service
and database layer; some of it is policy that operators must apply.

---

## Defence in depth

Five overlapping layers, in order of cheapness:

| Layer             | Where                                                             | Purpose                                                                          |
| ----------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Edge middleware   | `apps/web/middleware.ts`                                          | Cookie presence + host portal path gate. Fastest reject.                         |
| RSC layout        | `apps/web/app/(admin)/admin/layout.tsx` and `(player)/layout.tsx` | Full session verification, role-correct shell.                                   |
| Page-level checks | Every server page                                                 | Calls `requireAdminSession` / `requirePlayerSession` + named permission helpers. |
| API ownership     | `/api/admin/host/*`, `/api/admin/vips/*`, `/api/player/*`         | Filters by `actor_id` so an admin can't read another's data.                     |
| Postgres RLS      | Policies on every sensitive table                                 | Final safety net even if app code has a bug.                                     |

A failure in any one layer is contained by the next.

---

## Authentication summary

See `05-authentication.md` for detail. In one paragraph:

- Players: Better Auth (cookie sessions, password + magic link).
- Admins: HMAC-signed cookie + mandatory TOTP 2FA. 8-hour session,
  IP-bound, UA-bound, revocable by `session_id`.
- Hosts: admin auth with role `host`; routed to a separate portal shell
  with restricted nav and 5-layer route gating.

---

## RLS (Row Level Security)

RLS is enabled on every table that contains player-scoped or
admin-scoped sensitive data. The pattern (see `04-database.md` and
`docs/09 §4`):

1. Every transaction sets three Postgres session vars via
   `set_config('app.actor_id', ..., true)` etc.
2. Policies key off those settings.
3. The bypass role (`postgres` / the migration role) is used only by
   `migrate.ts` and seed scripts. Runtime DB roles never bypass.

### Tables with strict RLS (illustrative)

| Table                      | Policy intent                                         |
| -------------------------- | ----------------------------------------------------- |
| `players`                  | Players see only their own row; admins see any.       |
| `wallets`                  | Same as players.                                      |
| `ledger_entries`           | Same as players for SELECT; INSERT-only for app role. |
| `audit_log`                | Read: manager+ only. Write: append-only (trigger).    |
| `host_player_interactions` | Hosts see only `host_admin_id = current actor`.       |
| `kyc_status`               | Players + kyc_reviewer+ admins.                       |
| `compliance_flags`         | Manager+ only.                                        |
| `crm_suppression_list`     | Manager+ read; master delete; webhooks insert.        |
| `admins`                   | Self-row visible; master sees all.                    |

### Pattern for a new table

```sql
-- Example: a hypothetical `player_notes` table where only the player
-- and support+ can read.
alter table player_notes enable row level security;

create policy player_notes_self on player_notes
  for select
  using (
    current_setting('app.actor_kind', true) = 'player'
    and player_id = current_setting('app.actor_id', true)::uuid
  );

create policy player_notes_support_read on player_notes
  for select
  using (
    current_setting('app.actor_kind', true) = 'admin'
    -- support is rank 10, kyc_reviewer 20, ...
  );

-- (Add write policies for admin roles you want to allow.)
```

---

## Audit log

Every admin mutation writes a row to `audit_log` via
`core.audit.record(ctx, ...)`.

### Properties

- **Append-only**: a Postgres trigger rejects `UPDATE` and `DELETE` on
  the table.
- **Per-row JSON diff**: each entry stores `before` and `after`
  snapshots in JSONB plus a free-text `reason` field.
- **Actor + IP + UA**: every row includes the actor descriptor and the
  request fingerprint at the time of action.

### What gets audited

(Non-exhaustive; the writer is invoked everywhere there's a mutation.)

- Auth: login (success / fail), logout, 2FA enable/disable, password
  reset, session revoke, staff creation.
- Player: KYC level change, status change (suspend/close), RG limit
  change, profile edit, stealth lock, wipe.
- Wallet: every manual adjustment + reason.
- Redemption: approve / reject / hold / release.
- CMS: page create / edit / archive.
- Packages, Tiers, Bonuses, Promo codes: every CRUD action.
- Suppression list: add (always), delete (master only).
- Email/notification compose: every one-off, including suppression-
  override flag.
- Terms versions: publish.
- Host: assignment / unassignment / bonus award.

### Reading the audit log

`/admin/audit` — restricted to `manager+` (`canReadAuditLog`). Filterable
by actor, action type, date range. Exports as CSV via
`/api/admin/audit/export`.

---

## Sweepstakes wording (legal-mandated)

The codebase enforces vocabulary in three places:

1. **CMS pages** — Terms, Privacy, Sweepstakes Rules are
   operator-editable but reviewed before publish.
2. **Email templates** — CRM template editor allows variable
   substitution but the operator can use "wrong" words; review on send.
3. **Code copy** — every visible label in `packages/ui` and
   `apps/web/app` uses the correct vocabulary:

| Banned                          | Required                                          |
| ------------------------------- | ------------------------------------------------- |
| deposit                         | **purchase**                                      |
| withdraw / withdrawal / cashout | **redemption**                                    |
| wager / bet                     | **play**                                          |
| jackpot (in some contexts)      | check context — "feature win" sometimes preferred |
| free coins                      | "promotional Sweeps Coins" / "free Gold Coins"    |

When you add new copy, audit for these terms. There's a
`docs/ux-polish-audit.md` that documents the audit done before launch.

---

## Blocked states

US states where SC play and/or redemption is not permitted. The list
lives in `packages/core/src/compliance/`:

```ts
export const BLOCKED_STATES: ReadonlySet<string> // current blocklist
export function isBlockedState(stateCode: string): boolean
```

The list is also exposed from the barrel
(`import { BLOCKED_STATES, isBlockedState } from '@coinfrenzy/core'`)
and used at:

- Signup (rejects with a state-specific message).
- Lobby load (denies SC gameplay for known players who relocate).
- Redemption start (re-checks against the player's current state).
- Geo (Radar) confirms server-side state for redemption requests.

Updating the list:

1. Edit `BLOCKED_STATES` in `packages/core/src/compliance/`.
2. Add a CMS update for the blocked-states notice on `/sweepstakes-rules`.
3. Email opt-in players in newly blocked states (one-off via CRM).
4. Deploy.

---

## KYC tiers + redemption gate

| Tier | Verified                             | Can do                                                      |
| ---- | ------------------------------------ | ----------------------------------------------------------- |
| 0    | Email only                           | Play GC + free SC. **No redemptions.**                      |
| 1    | Email + phone                        | Play GC + free SC. **No redemptions.**                      |
| 2    | + Footprint full KYC (ID + selfie)   | First redemption ≥ $1; redeem normally.                     |
| 3    | + enhanced (AML or large redemption) | Redemptions over a configured threshold; SAR-eligible flow. |

Tier is `players.kyc_level` (CHECK `0..3`). Redemption start fails
with `kyc_required` when the player is < 2 and they're sent to the
Footprint flow.

---

## AML (anti-money laundering)

Three machinery pieces:

1. **`compliance_flags` table** — every suspicious activity trigger
   writes a flag (rapid purchase + redeem, structuring, multi-account
   suspicion, etc.).
2. **AML hold queue** — at `/admin/cashier/aml-hold`. A redemption with
   an open AML flag is held there until a `manager+` clears it.
3. **`redemption_rules`** — operator-tunable thresholds for
   auto-approve / hold (table introduced in `0014_redemption_rules.sql`,
   admin UI at `/admin/cashier/redeem-rules`). Examples:
   - Auto-approve below $X if KYC2 and no flags.
   - Hold above $Y regardless.
   - Hold if `daily_redemption_total > $Z`.

The rules engine lives in `packages/core/src/cashier/redemption-rules.ts`.

---

## Responsible Gaming (RG)

Player-facing RG tools (`/account/responsible-gaming`):

| Tool                                     | Behaviour                                                                                                                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Self-exclusion                           | Sets `players.rg_self_excluded_until` to a chosen end date. **Hard blocks** all gameplay, all purchases. Email confirmation. Cannot be removed early; cooling-off period is enforced.                  |
| Daily / weekly / monthly purchase limits | `players.rg_deposit_limit_*` (we still use the column name "deposit" internally — note the wording violation; planned rename in `13-known-gaps.md`). Purchases over the limit fail with an RG message. |
| Session reminders                        | `players.rg_session_limit_min` — show a modal after N minutes of play.                                                                                                                                 |
| Limit-change cooling-off                 | New (looser) limits require a 24-72h cooling-off; tighter limits apply immediately. Tracked in `players.rg_pending_limit_changes`.                                                                     |

Server-side enforcement lives in `packages/core/src/compliance/` and
`packages/core/src/redemption/eligibility.ts`.

---

## Security headers

Set globally in `apps/web/vercel.json`:

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(self)
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

`/api/*` also gets `Cache-Control: no-store, max-age=0`.

CSP is NOT yet pinned via headers (it's set per-page via `next.config`
on a couple of routes). See `13-known-gaps.md` — recommend tightening
CSP before launch.

---

## Rate limits

Implemented via Upstash Redis token bucket. Applied in `app/api/.../route.ts`
handlers via a `withRateLimit(handler, opts)` helper. Tracked per
`(ip, route)` and per `(player_id, route)` where applicable.

Default budgets (per `docs/09 §10.5`):

| Path                               | Budget                                  |
| ---------------------------------- | --------------------------------------- |
| `/api/player/signup`               | 5/min/IP                                |
| `/api/auth/login` (player + admin) | 10/min/IP, exponential lockout on fails |
| `/api/player/purchase/*`           | 10/min/player                           |
| `/api/admin/*`                     | 60/min/admin                            |
| `/api/webhooks/*`                  | not rate-limited (signed)               |

429s return a JSON body with `retry_after` and Retry-After header.

---

## Secrets management

- **Doppler** is the source of truth. Three configs: `dev`, `staging`,
  `prod`.
- Mirrors into Vercel (web), Fly (worker), and GitHub Actions
  (workflows).
- Rotation procedure: `runbooks/secret_rotation.md` (root). HMAC
  secrets use a 7-day overlap window via `ADMIN_SESSION_SECRET_PREV` /
  `ENCRYPTION_KEY_PREVIOUS`.
- Never log secrets. Never commit `.env*` (gitignored).
- App-layer encryption uses `ENCRYPTION_KEY_CURRENT` (AES-256-GCM).
  Fields encrypted: KYC SSN-fragment, payment instrument fingerprints,
  AML notes.

---

## Incident classification

Per `runbooks/incident_response.md`:

| Sev   | Definition                                          | Page on-call?              |
| ----- | --------------------------------------------------- | -------------------------- |
| Sev 1 | Production down, money at risk, regulatory exposure | Immediately, via PagerDuty |
| Sev 2 | Significant feature broken, no money risk           | Page on-call               |
| Sev 3 | Minor feature broken or visual bug                  | Slack notification         |
| Sev 4 | Cosmetic only                                       | Backlog ticket             |

The incident response runbook is `HANDOFF/runbooks/incident-response.md`
(operational steps for the dev firm).

---

## Data retention

Per privacy policy:

- **Player PII**: retained for the duration of the account + 7 years
  (regulatory). Self-excluded players' PII is minimised but identity
  hash kept to prevent re-registration.
- **Audit log**: 7 years.
- **Ledger entries**: indefinitely (no auto-purge).
- **CRM message log**: 18 months (older partitions dropped quarterly).
- **Player events**: 24 months.
- **Exports + signed URLs**: 24 hours (`expireDownloadLinks` cron).
- **Sessions**: 8 hours then revoked.

The pruning crons are scheduled in `apps/worker` but the older-than-
threshold pruners for `player_events` and `crm_message_log` are
**pending**. See `13-known-gaps.md`.

---

## Pen-test + audit posture

- We have not engaged an external pen-test firm yet. **Recommended
  before launch** (see `14-recommended-next-work.md`).
- Internal audit done by the founder + Claude during build. Reports in
  `docs/_reports/`.
- SOC 2 / PCI compliance is **not in scope for v1**. Finix Hosted
  Fields keeps us out of PCI scope on card data; Footprint handles KYC
  data; we don't store SSNs whole.

---

## What to read next

- `09-vip-host-system.md` — 5-layer auth on the host portal.
- `04-database.md` — RLS patterns in practice.
- `20-credentials-and-access.md` — full secret inventory.
