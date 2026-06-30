# 18 · Troubleshooting

Issues you'll hit in the first month. Ordered roughly by how often they
come up.

---

## Local dev

### Port 3000 is already in use

```bash
lsof -ti:3000 | xargs kill -9
```

(Or `:3030` for the worker.)

### Stale Next.js cache after pulling

```bash
rm -rf apps/web/.next
pnpm dev
```

### `Cannot find module '@coinfrenzy/...'`

You changed branches or pulled. Re-link the workspace:

```bash
pnpm install
```

If it persists, nuke `node_modules` and reinstall:

```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules
pnpm install
```

### `EPERM` / `EACCES` during install

You probably created the repo as root or installed pnpm as root at some
point. Fix ownership:

```bash
sudo chown -R "$(whoami)" .
```

### Turbo says "No outputs found" on every build

The `.turbo` cache is corrupted. Delete it:

```bash
rm -rf .turbo apps/*/.turbo packages/*/.turbo
```

---

## Database

### Migrations fail with "prepared statement already exists"

You're connecting through the pooled pgbouncer URL. Migrations need the
direct URL. Set `DATABASE_URL_DIRECT` and re-run.

### `relation "<table>" does not exist`

Migrations haven't been applied. Check:

```bash
pnpm -F @coinfrenzy/db db:migrate:status
```

If a migration is pending, apply it:

```bash
pnpm -F @coinfrenzy/db db:migrate
```

### `Neon: project paused`

Free / inactive Neon projects pause after a few minutes. Hit any
endpoint or wake from the Neon dashboard. The first connection after a
pause takes 5-10 seconds.

### `permission denied for table audit_log`

You're running as a runtime role and RLS is denying. Either:

- Your request didn't set `app.actor_*` — make sure you're calling
  through `core` and not raw Drizzle.
- The policy doesn't permit your role — read the policy in
  `0005_rls.sql` and confirm intent.

### `current_setting('app.actor_id') is not set`

You're querying outside a transaction or before the writer set the
config. Always wrap multi-statement work in `db.transaction(...)`.

### `CHECK constraint violation on wallets.balance_sum_check`

The four sub-buckets don't sum to `current_balance`. The ledger writer
shouldn't let this happen — if you see it, there's a bug. Open an
issue with the transaction id.

### Drizzle types don't match the DB after `db:generate`

You changed the schema but didn't regenerate. Or you regenerated but
didn't restart `tsx`. Try:

```bash
pnpm -F @coinfrenzy/db db:generate
pnpm -F @coinfrenzy/db typecheck
```

---

## Auth

### Admin login redirects me back to `/admin/login`

The cookie is being set but the next request can't read it. Common
causes:

- HTTPS vs HTTP mismatch (cookie is `Secure` in prod).
- You're on a tunnel (ngrok / cloudflared) and `BETTER_AUTH_URL`
  doesn't match the host.
- Domain mismatch (cookie is set for `coinfrenzy.com` but you're on
  `www.coinfrenzy.com`).

### "2FA required" loop after first login

You enrolled but the secret didn't save. Check `admins.totp_secret`
in the DB; if empty, re-run `pnpm -F @coinfrenzy/db db:reset-admin`
and start over.

### `ip_mismatch` / `ua_mismatch` after a router change

Your IP/UA shifted. The admin session is IP-bound. Log in again.

### Player can't sign up — "blocked state"

The Radar mock returned a blocked state. Either flip the mock to
return a non-blocked state, or update `BLOCKED_STATES` if intentional.

---

## Webhooks

### "Invalid signature" on a webhook

The corresponding `<VENDOR>_WEBHOOK_SECRET` doesn't match what the
vendor is sending. In dev, the mock-vendor pages sign with the env-
local secret; in prod, set the secret in Doppler to match the vendor
portal config.

### Webhook posts but nothing happens

Check `pending_webhooks` for the event id — was it received? Then
check the Inngest dashboard for the corresponding worker function run.
If the worker isn't running, restart it:

```bash
pnpm -F @coinfrenzy/worker dev
```

### Mock webhook returns 401

The mock-vendor UI calls back into `/api/webhooks/<vendor>` with the
mock-signed payload. If you've set `USE_MOCK_<VENDOR>=false`, the
real adapter's signature verify is in use and the mock signature won't
pass.

---

## Realtime (Pusher)

### Lobby ticker doesn't tick

- Verify `NEXT_PUBLIC_PUSHER_KEY` and `NEXT_PUBLIC_PUSHER_CLUSTER` are
  set (browser side).
- Open browser devtools → Network → WS — confirm a Pusher connection.
- If 403 on the private channel, the `/api/realtime/auth` endpoint
  rejected — usually means no session.

### Balance doesn't update after a win

- The win webhook lands → ledger writes → Pusher publishes to
  `private-player-<uuid>`.
- Failure points:
  - Webhook didn't reach (check `pending_webhooks`).
  - Ledger write failed (check Sentry).
  - Pusher creds missing on server (worker logs).
  - Browser not subscribed (devtools).

---

## Inngest / worker

### "Inngest signing failed"

Either `INNGEST_SIGNING_KEY` is missing on the worker, or it doesn't
match what Inngest is using. In dev, the Inngest local dev server can
run with `--insecure` and no signing.

### `_app_migrations` reports old version after deploy

You didn't run the `db-migrate.yml` workflow. Code shipped, DB didn't.
Open the workflow, dry-run first, then apply.

### Worker keeps restarting

Check `flyctl logs -a coinfrenzy-worker`. Common causes:

- Missing env var (Zod schema rejects → process exits).
- Out of memory (the 1 GB machine fills under load — bump to `2 GB`
  if needed).
- Failing health check (verify `/healthz` returns 200).

---

## Tests

### Tests fail with "Docker not running"

Integration tests need Docker. Either start Docker Desktop or skip:

```bash
SKIP_INTEGRATION_TESTS=1 pnpm test
```

### Property tests hang

A generator is producing a value that the function loops on. Re-run
with seed reported in the failure to reproduce. fast-check prints the
shrunk counterexample — fix the underlying invariant.

### `Cannot find name 'describe'`

Add `"types": ["vitest/globals"]` to the package's `tsconfig.json` if
missing, or `import { describe, test, expect } from 'vitest'` at the
top of the test file.

---

## Build / deploy

### Vercel build fails with "out of memory"

The Next.js build is heavy. Vercel's default is usually enough; if it
fails, bump the build env's Node memory:

```
NODE_OPTIONS="--max_old_space_size=4096"
```

(Set in Vercel project env.)

### Vercel build can't find `@coinfrenzy/core`

The build command is hand-set in `vercel.json` because Vercel doesn't
know it's a monorepo. Verify:

```json
"buildCommand": "cd ../.. && pnpm install --frozen-lockfile && pnpm -F @coinfrenzy/web build"
```

### Fly deploy fails with "release command failed"

The Dockerfile build worked but `node dist/index.js` exits non-zero on
boot. Look at the release logs — almost always a missing env var or a
Postgres connection failure.

### CI fails on lint but works locally

Pull the latest `main` and re-install — pnpm versions can drift. Also
check `.eslintrc.cjs` at the package root for any rule additions.

---

## CRM

### Segment count shows 0 but UI says "10,000 players"

The denormalised attribute cache is stale. Trigger a refresh:

```bash
# From a Node REPL or admin-side button (planned)
core.crm.refreshPlayerStats(ctx)
```

Or wait for the hourly cron.

### Email Center says "suppressed" for a player who should receive

Check `crm_suppression_list` for the recipient + channel. If they're
there for a legitimate reason (unsubscribe, bounce), don't remove
without operator approval. To send anyway, manager+ can compose with
`ignoreSuppression: true` (audited).

### Campaign stuck "Sending"

`crm-campaign-sender` job hasn't picked it up. Check Inngest
dashboard. If the worker is down, restart it.

---

## Production-only

### Alarms firing for high webhook latency

The vendor is slow OR the worker is overwhelmed. Check:

1. Sentry for errors.
2. Vendor status page.
3. Worker CPU/memory in Fly dashboard.

If sustained, bump the worker machine size or add a second machine
(`fly scale count 2`).

### Reconciliation finds drift

A ledger entry exists without a corresponding wallet update (or
vice-versa). The nightly reconciliation job writes to
`compliance_flags` — read the flag for context, then run:

```bash
pnpm -F @coinfrenzy/worker cutover:balance-compare
```

If real drift (not a partition issue), file a sev-1.

---

## When in doubt

1. Check Sentry for the exact error.
2. Check Axiom for surrounding logs (search by `reqId`).
3. Check the relevant section in `docs/`.
4. Ping the founder / `[FILL IN] contact channel`.

Don't guess at causes. Get the error first.

---

## What to read next

- `20-credentials-and-access.md` — confirm secrets are present.
- `runbooks/incident-response.md` — when it's a sev-1.
- `15-security-and-compliance.md` — RLS gotchas.
