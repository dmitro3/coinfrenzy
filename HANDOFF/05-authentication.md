# 05 · Authentication

Three independent authentication paths share one codebase:

1. **Players** — Better Auth (cookie sessions, password + magic link).
2. **Admins** — Custom HMAC session cookie + mandatory TOTP 2FA.
3. **Hosts** — Same as admins, but the `host` role triggers a separate
   portal shell and a 5-layer route gate.

---

## Player authentication — Better Auth

### Where it lives

- Library: `better-auth` (`apps/web/package.json` pins `^1.6.10`).
- Server instance: `apps/web/lib/auth.ts`.
- Client wrapper: `apps/web/lib/auth-client.ts`.
- Routes:
  - `/api/auth/[...all]` — Better Auth's catch-all handler.
  - `/signup`, `/login`, `/reset-password`, `/verify-email` — pages.
- DB tables: `auth_users`, `auth_sessions`, `auth_accounts`,
  `auth_verifications` (introduced in migration `0006_better_auth.sql`).
- Session cookie: `better-auth.session_token` (or
  `__Secure-better-auth.session_token` in production).

### Server-side session reads

`apps/web/lib/player-session.ts` exposes:

- `getPlayerSession()` — returns the session or null.
- `requirePlayerSession()` — throws (redirects) if not logged in.

RSC pages and API routes use these to gate access. Middleware
(`apps/web/middleware.ts`) does a **cookie-presence-only** check at the
edge — it doesn't verify the signature (the edge runtime can't pull in
the Better Auth verify code). The full verification happens in the page
or API handler.

### Signup flow

1. `POST /api/player/signup` — calls
   `core.auth.playerSignup(ctx, input)`.
2. Server validates email, password complexity, age (18+), state
   (rejects blocked states), and the optional promo code.
3. Creates the `auth_users` + `players` rows in a transaction, hashes
   the password (bcryptjs), provisions empty `GC` + `SC` wallets.
4. Issues a Better Auth session and sets the cookie.
5. Emits a `player.signup` event for the CRM (welcome series).
6. Returns the session info.

### Login flow

Standard Better Auth password flow at `/login`. On success, a session is
set and the user is redirected to `/lobby`.

### Magic link

Better Auth supports magic link out of the box; the player UI hides this
behind "Email me a sign-in link" on the login page. Email is sent via
SendGrid (or the mock).

### Password reset

`/reset-password` flow uses Better Auth's built-in reset. The email is a
SendGrid-templated send.

---

## Admin authentication — HMAC session + TOTP 2FA

### Why a separate path

Admin sessions need things Better Auth doesn't give us:

- IP binding (downgrade on IP change).
- UA binding (downgrade on UA change).
- Session revocation in O(1) by `session_id`.
- 7-day rotation overlap on the signing secret.
- Hard mandatory TOTP on every account.

The implementation is `packages/core/src/auth/admin-session.ts`.

### Token shape

```
<base64url(payload)>.<base64url(hmac-sha256(payload, ADMIN_SESSION_SECRET))>
```

`payload` is:

```ts
{
  session_id: string // UUID, used for revocation
  admin_id: string // UUID
  role: AdminRoleSlug
  iat: number // ms epoch
  exp: number // ms epoch (default = iat + 8h)
  bind_ip: string // hashed IP
  bind_ua: string // SHA-256 of lowercased UA, truncated to 32 hex
}
```

Cookie name: `cf_admin_session`. Stored as `HttpOnly`, `Secure`,
`SameSite=Lax`, path `/`.

### Secret rotation

- `ADMIN_SESSION_SECRET` is the active signing key.
- `ADMIN_SESSION_SECRET_PREV` is honoured during a 7-day rotation
  overlap. Tokens signed with the previous key still verify (and are
  re-issued on next request).

Rotate via the procedure in `runbooks/secret_rotation.md`.

### Login flow

1. `POST /api/admin/auth/login` with `{email, password}`.
2. `core.auth.adminLogin(ctx, input)` validates against `admins` row
   (bcrypt).
3. **First-login forced reset**: if `must_reset_password = true` the
   response is `{stage: 'reset'}` and the UI walks the operator through
   `/admin/reset-password`.
4. **2FA gate**: if `totp_enabled = false` the response is
   `{stage: 'enrol_2fa'}` with a `pending_2fa_token` that lets them
   visit `/admin/mfa/setup` once and confirm.
5. **2FA challenge**: if `totp_enabled = true` the response is
   `{stage: 'challenge'}` with a `pending_2fa_token` and the UI shows
   the 6-digit input at `/admin/mfa`.
6. **Issue session**: when all stages pass, `issueSession()` mints the
   HMAC token and the cookie is set on the response.
7. Redirect to `/admin` (or the `?next` param if present and allowed).

### Dev escape hatch

`ADMIN_2FA_OPTIONAL=true` in `.env.local` skips the 2FA enrollment
requirement for accounts with `totp_enabled = false`. Hard-rejected at
runtime when `NODE_ENV = 'production'`. Use only for local UI work.

### Session verification

`packages/core/src/auth/admin-session.ts → verifySession(ctx, token)`
does:

1. Split + base64url-decode the payload and signature.
2. Verify HMAC against `ADMIN_SESSION_SECRET`, fall back to
   `ADMIN_SESSION_SECRET_PREV` if present.
3. Reject if `exp < now`.
4. Look up `admin_sessions` row by `session_id`; reject if revoked or
   missing.
5. Compare `bind_ip` and `bind_ua` against the current request.
6. Return the verified session + admin row.

Verify errors are typed: `malformed | bad_signature | expired |
revoked_or_unknown | ip_mismatch | ua_mismatch`.

### Server-side session reads

- `apps/web/lib/admin-session.ts → requireAdminSession()` is the
  primary entry point. Used by every admin RSC page and every
  `/api/admin/*` route.
- It returns `{admin, payload}` where `admin` is the DB row and
  `payload` is the verified token payload.

### Edge middleware (peek-only)

Edge runtime can't import `node:crypto` / bcryptjs, so
`apps/web/middleware.ts` only:

1. Checks the cookie is present.
2. Base64-decodes the payload (without verifying signature) to peek at
   the role.
3. If role is `host`, gates the path to one of the host-allowed
   prefixes; otherwise redirects to `/admin?restricted=1`.

The full verification happens in the RSC layout / API route. A tampered
cookie would fail there.

---

## 2FA (TOTP) for admins

### Where it lives

- `packages/core/src/auth/admin-2fa.ts` (otplib + qrcode).
- Tables: `admins.totp_secret`, `admins.totp_enabled`,
  `admins.totp_backup_codes` (JSON array).
- Routes:
  - `/admin/mfa/setup` — QR + verify-and-enable.
  - `/admin/mfa` — 6-digit challenge during login.
  - `/api/admin/auth/2fa/{begin, verify, disable}` — endpoints.

### Setup flow

1. `beginSetup(adminEmail)` generates a fresh 160-bit secret and the
   otpauth URI. Does **not** persist anything.
2. The UI shows the QR + the secret string.
3. Admin scans, enters the 6-digit code.
4. `confirmAndEnable(adminId, code)` verifies the code and, if valid,
   persists `totp_secret`, sets `totp_enabled = true`, and generates 10
   backup codes (one-time use).
5. Backup codes are shown ONCE and downloadable as a text file.

### Algorithm

- SHA1, 6 digits, 30-second window (RFC 6238 standard).
- Window tolerance: 1 (so an old/new code within ~60s is accepted).

### Backup codes

- Stored in `admins.totp_backup_codes` as a JSON array of strings.
- One-time use: consumed codes are removed from the array atomically.
- Low blast radius — see `docs/09 §5.2`.

---

## Role model

Nine admin role slugs, ranked:

| Slug           | Rank | Notes                                                                                                          |
| -------------- | ---- | -------------------------------------------------------------------------------------------------------------- |
| `host`         | 5    | Contractor managing VIPs. Below `support` deliberately — the rank ladder must not accidentally promote a host. |
| `support`      | 10   | Read-only on most surfaces.                                                                                    |
| `kyc_reviewer` | 20   | Footprint / KYC work.                                                                                          |
| `cashier`      | 30   | Approves redemptions ≤ $1k.                                                                                    |
| `cashier_lead` | 40   | Approves redemptions ≤ $10k.                                                                                   |
| `marketing`    | 50   | Edits CMS, packages (request flow TBD), promos, emails.                                                        |
| `game_ops`     | 60   | Provider + game catalog.                                                                                       |
| `manager`      | 100  | Most edits including suppression overrides, redemptions ≤ $50k.                                                |
| `master`       | 1000 | Everything, including staff CRUD, terms publishing, safety caps.                                               |

### Permission helpers

Don't open-code `role === 'master'`. Use the named helpers in
`packages/core/src/auth/permissions.ts`:

```ts
hasAtLeast(role, 'manager')
canManageStaff(role)
canReadAuditLog(role)
canViewIntegrations(role)
canViewSettings(role)
canManageBonuses(role)
canViewBonuses(role)
canManageSuppression(role)
canDeleteSuppression(role)
canEditContent(role)
canSendOneOffEmail(role)
canSendNotification(role)
canOverrideSuppression(role)
canEditPackages(role)
canEditTiers(role)
canManageRedemptionRules(role)
canManagePromoCodes(role)
canEditSafetyCaps(role)
canManageBlocklists(role)
canDeleteBlocklists(role)
isHost(role)
canAccessHostPortal(role)
canViewAllVips(role)
canManageVipAssignments(role)
canCreateHost(role)
canDeactivateHost(role)
canAssignBonusAsHost(role)
```

Approval thresholds (cashier amount caps, manual adjust caps) live in
`APPROVAL_THRESHOLDS` in the same file and are the single source of
truth — money-bounded admin actions must consult them rather than
hard-coding limits.

---

## Forced password reset

When `admins.must_reset_password = true`:

1. Login surfaces `{stage: 'reset'}`.
2. The UI redirects to `/admin/reset-password`.
3. After reset, `must_reset_password` is cleared and the normal 2FA
   flow continues.

This is set:

- On staff creation by another admin (the new admin's temp password is
  emailed; first login forces a reset).
- On admin-initiated password resets from the staff page.

Migration `0024_admin_must_reset.sql` added the column.

---

## Host portal — 5-layer auth defense

Every layer denies; an attacker has to defeat all five to reach a host-
restricted surface they aren't entitled to.

1. **Edge middleware** (`apps/web/middleware.ts`): peeks at the role in
   the cookie payload (no signature verify, that's later) and bounces
   non-`host` paths.
2. **RSC layout** (`apps/web/app/(admin)/admin/layout.tsx`): calls
   `requireAdminSession` (full HMAC verify), then chooses
   `<HostShell>` or `<AdminShell>` based on role. A non-host role
   hitting a host-only path is redirected.
3. **Page-level checks**: every server page in `/admin/vips/*` calls
   `canAccessHostPortal(role)` and `isHostAllowedAdminPath(path)`.
4. **API ownership check**: every `/api/admin/host/*` and
   `/api/admin/vips/*` route filters by `assigned_host_id = current
admin id`.
5. **RLS policy**: `host_player_interactions` has a policy that
   restricts SELECTs and INSERTs to rows where `host_admin_id =
app.actor_id` when `app.actor_role = 'host'`.

If you're adding a new host-visible surface, **add it to all five**.
See `09-vip-host-system.md` for the patterns.

---

## Sign-out

- Player: hit `/api/auth/sign-out` (Better Auth handler).
- Admin: `/admin/logout` clears the cookie and revokes the
  `admin_sessions` row (so the same token can't be replayed).

---

## Audit + security events

Every authentication event writes to `audit_log`:

- `auth.player.signup`, `auth.player.login`, `auth.player.logout`,
  `auth.player.password_reset`, `auth.player.password_changed`,
  `auth.player.email_verified`, `auth.player.self_exclude`.
- `auth.admin.login_success`, `auth.admin.login_failed`,
  `auth.admin.logout`, `auth.admin.2fa_enabled`,
  `auth.admin.2fa_disabled`, `auth.admin.password_reset`,
  `auth.admin.session_revoked`, `auth.admin.created` (staff CRUD),
  `auth.admin.deactivated`.

The admin audit page (`/admin/audit`) is the read surface; only
`manager+` can view it (`canReadAuditLog`).

---

## What to read next

- `15-security-and-compliance.md` — RLS, blocked states, RG, KYC tiers.
- `09-vip-host-system.md` — the 5-layer host defense in detail.
- `architecture-diagrams/auth-flow.md` — sequence diagrams.
