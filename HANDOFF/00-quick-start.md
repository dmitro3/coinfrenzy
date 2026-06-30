# 00 · Quick Start

Goal: from a fresh clone to a running app on `http://localhost:3000` in
about **30 minutes**, with seeded test data and at least one admin login
that works.

---

## Prerequisites

| Tool                                   | Required version           | How to install                                               |
| -------------------------------------- | -------------------------- | ------------------------------------------------------------ |
| Node                                   | `>=20.0.0`                 | `nvm install 20 && nvm use 20` (or asdf)                     |
| pnpm                                   | `>=11.0.0` (we pin 11.1.1) | `corepack enable && corepack prepare pnpm@11.1.1 --activate` |
| PostgreSQL                             | 15+ (we use **Neon**)      | Sign up at https://neon.tech, create a project               |
| git                                    | any recent                 | obvious                                                      |
| Doppler CLI (optional but recommended) | latest                     | `brew install dopplerhq/cli/doppler`                         |

You do **not** need Docker for the main app. Docker is only needed if
you want to run the integration tests against a real Postgres
container (`packages/core` uses Testcontainers).

---

## Step 1 — Clone and install

```bash
git clone <repo url> coinfrenzy-casino
cd coinfrenzy-casino
pnpm install
```

The install touches every workspace (`apps/web`, `apps/worker`,
`packages/{core,db,ui,config}`). Expect a few minutes the first time;
Turbo + pnpm cache subsequent installs.

---

## Step 2 — Provision a Neon database

1. Sign in at https://neon.tech.
2. Create a project. Anything in `us-east-1` is fine; the production
   project is also `us-east-1`.
3. Copy the **pooled** connection string (looks like
   `postgresql://user:pwd@...neon.tech/neondb?sslmode=require`).
4. Copy the **direct** (un-pooled) connection string too — migrations
   need it because `pgbouncer` doesn't support session-level features
   the migration runner relies on.

---

## Step 3 — Set up environment variables

```bash
cp .env.example apps/web/.env.local
```

Fill in **at minimum**:

```bash
DATABASE_URL=postgres://...   # pooled (apps + reads)
DATABASE_URL_DIRECT=postgres://...   # un-pooled (migrations only)

# 32+ char random strings — generate with `openssl rand -hex 32`
BETTER_AUTH_SECRET=…
ADMIN_SESSION_SECRET=…
ENCRYPTION_KEY_CURRENT=…

# So local mock-vendor pages know where to call back
PLAYER_BASE_URL=http://localhost:3000
WEBHOOK_BASE_URL=http://localhost:3000

# Bootstrap credentials for the first admin (used once by db:seed-admin)
BOOTSTRAP_ADMIN_EMAIL=you@example.com
BOOTSTRAP_ADMIN_PASSWORD=correct-horse-battery-staple
BOOTSTRAP_ADMIN_NAME="Your Name"
```

Every `USE_MOCK_*` flag defaults to `true`, so a fresh clone will not
attempt to reach a real vendor. See `20-credentials-and-access.md` for
the full list of envs and where to source production values.

---

## Step 4 — Apply migrations and seed an admin

```bash
pnpm -F @coinfrenzy/db db:migrate
pnpm -F @coinfrenzy/db db:seed-admin
```

`db:migrate` runs all SQL files under `packages/db/src/migrations/`
in order (0000 → 0025 as of this writing). The runner is idempotent
and records applied migrations in `_app_migrations`.

`db:seed-admin` reads the `BOOTSTRAP_ADMIN_*` env vars and creates a
`master`-role admin. You only need to run this once.

---

## Step 5 — Seed test data (optional but recommended)

Two seed scripts exist; both are safe to re-run.

```bash
# Realistic-looking dataset: players, purchases, redemptions, ledger,
# CRM events, host assignments, bonuses, ~30 days of activity.
pnpm -F @coinfrenzy/db seed:realistic

# Smaller fake-players-only dataset, useful for UI work.
pnpm -F @coinfrenzy/db seed:fake
```

After seeding, the dashboard will have numbers, the player list will
have rows, and the lobby will show live activity.

---

## Step 6 — Start the dev servers

```bash
pnpm dev
```

This launches Turbo, which runs `next dev` for `apps/web` on port
**3000** and `tsx watch` for `apps/worker` on port **3030**.

You should now be able to visit:

| URL                                  | What you'll see                                                                                |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `http://localhost:3000`              | marketing landing for unauthed visitors; redirects to `/lobby` once you have a player session  |
| `http://localhost:3000/lobby`        | player lobby (redirects to `/login` until you create a player — or set `DEV_PLAYER_AUTOLOGIN`) |
| `http://localhost:3000/admin/login`  | admin login                                                                                    |
| `http://localhost:3000/mock-vendors` | local mock-vendor dashboard (Alea/Finix/Footprint test pages)                                  |
| `http://localhost:3030/healthz`      | worker health check (returns `ok`)                                                             |

### Dev shortcut: auto-login as a seeded player

If you don't want to go through Better Auth signup just to browse the
player surface, set this in `apps/web/.env.local`:

```bash
DEV_PLAYER_AUTOLOGIN=true
```

Then `http://localhost:3000/` redirects straight to `/lobby` and you're
auto-impersonated as the most-recently-active seeded player. The bypass
is hard-rejected at runtime when `NODE_ENV=production`, so it cannot leak
into staging/prod. Implementation lives in
`apps/web/lib/player-session.ts` (the `devAutoLoginSession` helper) and
in `apps/web/middleware.ts`.

---

## Step 7 — Log in as admin

1. Visit `/admin/login`.
2. Enter the bootstrap email + password.
3. The first login will redirect you to the **2FA setup wizard**
   (`/admin/mfa/setup`) because every admin must have TOTP enabled
   before they can issue a session.
4. Scan the QR with any authenticator app (1Password, Authy, Google
   Authenticator); save the backup codes.
5. Submit the 6-digit code; you'll land on `/admin`.

**Dev escape hatch**: setting `ADMIN_2FA_OPTIONAL=true` in `.env.local`
allows password-only login (NODE_ENV must NOT be `production`). Use this
only if you're testing flows that don't involve the 2FA enrollment.

---

## Step 8 — Verify things worked

Run these three checks:

```bash
# 1. Typecheck across all packages
pnpm typecheck

# 2. Lint
pnpm lint

# 3. Unit + property tests
pnpm test
```

All three should be green. As of handoff: **246 vitest tests passing**
in `packages/core` (ledger property-based tests dominate). The other
packages currently have placeholder `test` scripts (`echo no tests yet`).

---

## Troubleshooting first-day issues

If you hit something unexpected, jump to `18-troubleshooting.md` — the
top entries are exactly the issues people hit on day one. Highlights:

- **Port 3000 busy**: `lsof -ti:3000 | xargs kill -9`.
- **`Cannot find module` after a pull**: `pnpm install` at the repo root.
- **Migrations fail with `prepared statement already exists`**: you're
  using the pooled URL — set `DATABASE_URL_DIRECT` to the un-pooled
  string and re-run `db:migrate`.
- **`relation "..." does not exist`** in dev: an earlier migration was
  skipped — run `pnpm -F @coinfrenzy/db db:migrate:status` to see what's
  applied.
- **Admin login loops back to `/admin/login`**: cookies are 1st-party
  on `localhost:3000`; if you're on a tunnel (ngrok, cloudflared) make
  sure `BETTER_AUTH_URL` matches the host you're hitting.

---

## What to read next

- `01-project-overview.md` — what we're actually building.
- `03-codebase-tour.md` — the folder map.
- `10-ledger-and-money.md` — the most important file in this package.
