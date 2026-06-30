# 09 · VIP / Host System

Built in milestone M4. Two intertwined concepts:

1. **VIP status** — a state on a player based on lifetime spend.
2. **Host portal** — a dedicated contractor portal where hosts (a
   special admin role) manage a small book of assigned VIPs.

---

## VIP qualification

A player becomes a VIP when their lifetime purchase USD crosses the
configured threshold.

| Constant                    | Default                           | Where                                                                       |
| --------------------------- | --------------------------------- | --------------------------------------------------------------------------- |
| VIP qualification threshold | **$1,000 lifetime spend**         | `packages/core/src/vip/qualification.ts` (configurable in `system_config`). |
| Worker cron                 | nightly `vipQualificationNightly` | `apps/worker/src/jobs/vip-qualification.ts`.                                |

The cron re-scores every active player every night. New qualifiers
move `players.vip_status` from `none` → `vip` and set
`vip_qualified_at`. They become eligible for host assignment.

`players.vip_status` values: `none`, `candidate`, `vip`, `high_roller`
(CHECK-enforced).

---

## Host role

`host` is a special admin role (rank 5, below `support` deliberately —
see `05-authentication.md`). A host:

- Has a dedicated portal layout (`HostShell` instead of `AdminShell`).
- Sees a restricted left nav (~4 entries vs the full ~25).
- Can only see + act on **their assigned VIPs**.
- Can award bonuses up to a weekly cap.
- Cannot access any of the rest of the admin (player list, cashier,
  reports, CRM, settings, etc.) — both at the route and the API.

Hosts are contractors. They get paid (usually) on a revenue-share of
the VIPs they manage; the platform doesn't enforce or compute their
pay (out of scope for v1).

---

## Where the code lives

### Core

```
packages/core/src/vip/
├── qualification.ts      Re-score players against threshold
├── host-bonus.ts         Host-restricted bonus award + weekly cap enforcement
├── interactions.ts       host_player_interactions CRUD
└── index.ts
```

### DB

```
packages/db/src/schema/vip.ts    host_player_interactions + helpers
packages/db/src/migrations/0010_vip_hosts.sql
```

VIP fields on `players`: `vip_status`, `vip_qualified_at`,
`assigned_host_id`, `host_assigned_at`.

### Admin UI

```
apps/web/app/(admin)/admin/
├── vip/                  Master / manager view
│   ├── page.tsx          VIP overview (all VIPs, all hosts)
│   ├── _data.ts
│   ├── all-vips/         Full VIP list
│   ├── assignments/      Assign / reassign VIPs to hosts
│   ├── hosts/            Host CRUD
│   └── [playerId]/       Individual VIP detail (admin view)
├── vips/                 Host view (intentional plural)
│   ├── page.tsx          Host's VIP queue
│   └── [playerId]/       Player detail (host view, RLS-filtered)
├── host-shell.tsx        The host portal shell
└── _host-dashboard.tsx   Host dashboard
```

### API

```
apps/web/app/api/admin/
├── host/                 Host-only endpoints (interactions, bonus)
└── vips/                 Master/manager VIP admin endpoints
```

---

## The two URL paths — intentional dual route

This is the part operators (and devs) trip over. **There are two routes
that look almost identical**:

| URL                     | Audience                                                           | Component                         |
| ----------------------- | ------------------------------------------------------------------ | --------------------------------- |
| `/admin/vip` (singular) | Master / manager — operator overview of _every_ VIP and every host | `app/(admin)/admin/vip/page.tsx`  |
| `/admin/vips` (plural)  | Host — the host's own VIP queue                                    | `app/(admin)/admin/vips/page.tsx` |

It is **deliberate**. Hosts hitting `/admin/vip` are redirected to
`/admin/vip/all-vips`, where the master view will (by RLS) hide rows
that aren't theirs.

Hosts' main entry is `/admin/vips` plural. The HostShell sidebar links
there.

---

## The 5-layer auth defense

Hosts must be allowed only into the host portal. Five overlapping
layers; each one denies independently.

### Layer 1 — Edge middleware

`apps/web/middleware.ts` peeks at the admin role in the (unverified)
cookie payload and:

- Allows `/admin`, `/admin/logout`, and any path under
  `HOST_ALLOWED_PATH_PREFIXES = ['/admin/vips', '/admin/messages',
'/admin/bonus', '/admin/account']`.
- Anything else → 302 to `/admin?restricted=1&from=<original>`.

For API: allows `/api/admin/auth/*` and `/api/admin/host/*`. Anything
else → 403 JSON.

### Layer 2 — RSC layout

`apps/web/app/(admin)/admin/layout.tsx`:

1. `requireAdminSession()` — full HMAC verify.
2. If role is `host`, render `<HostShell>`. Else `<AdminShell>`.
3. The shells render different navs so a misrouted request can't
   accidentally expose admin nav items to a host.

### Layer 3 — Page-level checks

Every page under `/admin/vips/*` (and the host-allowed paths) calls
`canAccessHostPortal(role)` and `isHostAllowedAdminPath(path)` from
`packages/core/src/auth/permissions.ts`. A miscategorised page would
fail this check explicitly.

### Layer 4 — API ownership

`/api/admin/host/*` routes filter every query by
`assigned_host_id = ctx.actor.adminId`. Even if a host crafts a request
to see another host's data, the SQL WHERE clause excludes it.

### Layer 5 — Postgres RLS

`host_player_interactions` has a policy:

```sql
create policy host_self_only on host_player_interactions
  for all
  using (
    current_setting('app.actor_role', true) = 'host'
    and host_admin_id = current_setting('app.actor_id', true)::uuid
  );
```

`app.actor_role` is set inside every transaction by the core writer.
A host attempting to read/write another host's row hits the policy
and gets no rows / a permission error.

When you build a new host-visible surface, **add it to all five**
layers. The pattern is:

```ts
// 1. add to HOST_ALLOWED_PATH_PREFIXES in middleware.ts AND in permissions.ts
// 2. wire it under <HostShell>
// 3. call canAccessHostPortal + isHostAllowedAdminPath at page top
// 4. add `assigned_host_id = ?` filter to every query
// 5. add an RLS policy if a new table is involved
```

---

## Host weekly cap

```ts
export const HOST_WEEKLY_BONUS_CAP_SC: bigint = 5_000_000n // = 500 SC
```

(in `packages/core/src/auth/permissions.ts`)

Hosts can award bonuses up to **$500 SC per VIP per rolling 7 days**.
The cap is enforced server-side in `core.vip.host-bonus.ts` when a
host clicks "Send bonus" on a VIP. Anything over requires escalation
to a manager.

The UI surfaces the remaining cap inline so the host sees how much
runway they have for a given player.

---

## Host-available bonus templates

Not every bonus template is host-awardable. Templates have a
`host_available` flag; only those appear in the host's "Send bonus"
picker.

---

## Host portal layout

`HostShell` (`apps/web/app/(admin)/admin/host-shell.tsx`):

- Sidebar:
  - **My VIPs** → `/admin/vips`
  - **Messages** → `/admin/messages`
  - **Bonus** → `/admin/bonus` (filtered to host-available templates)
  - **Account** → `/admin/account`
- Top bar: host name + sign-out.
- No global search, no dashboard counters from the admin set, no other
  nav.

Dashboard (`_host-dashboard.tsx`):

- **Today's KPIs**: messages sent today, bonus awarded today, players
  with no contact in 7d.
- **My VIPs roster** with last-touch date + channel.
- **Quick actions**: open message thread, send bonus.

---

## VIP assignment

`/admin/vip/assignments` (master / manager only):

- Filterable list of VIPs.
- Bulk-assign or per-player.
- Reassignment is audited and notifies the previous host via Pusher +
  the new host via email + Pusher.

Backed by `core.vip.interactions.ts` and writes to
`players.assigned_host_id` + `host_assigned_at`.

---

## Host interactions log

Every host↔VIP communication or bonus award is logged to
`host_player_interactions`:

```
id           uuid pk
host_admin_id uuid fk admins(id)
player_id    uuid fk players(id)
channel      'whatsapp' | 'telegram' | 'phone' | 'email' | 'sms' | 'in_app' | 'bonus_award'
direction    'outbound' | 'inbound'
content      text (nullable)
metadata     jsonb (free-form per-channel state)
occurred_at  tstz
created_at   tstz
```

The host roster (`_host-player-roster.tsx`) shows the latest
interaction per VIP at a glance. RLS ensures hosts only see their own.

WhatsApp / Telegram / phone numbers per player are stored in
`host_interactions.metadata` JSONB (so the schema doesn't get cluttered
with channel-specific columns).

---

## Onboarding a new host

Step-by-step (also in `runbooks/onboard-new-host.md`):

1. Master visits `/admin/staff/new`, creates an admin with role
   `host`.
2. Temp password is emailed; `must_reset_password = true`.
3. Host visits `/admin/login`, signs in.
4. Forced password reset (`/admin/reset-password`).
5. Forced 2FA setup (`/admin/mfa/setup`).
6. Lands on `/admin` → routed to host dashboard.
7. Master visits `/admin/vip/assignments`, assigns initial VIPs.
8. Host sees their roster on `/admin/vips`.

---

## What to read next

- `05-authentication.md` — admin sessions + role model.
- `15-security-and-compliance.md` — RLS in practice.
- `runbooks/onboard-new-host.md` — operational onboarding.
