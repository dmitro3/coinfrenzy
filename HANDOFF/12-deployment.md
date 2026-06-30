# 12 · Deployment

How the platform ships. Three services, three deploy paths.

| Component               | Host              | Trigger                                             | Tool                                             |
| ----------------------- | ----------------- | --------------------------------------------------- | ------------------------------------------------ |
| `apps/web` (Next.js)    | **Vercel**        | GitHub Actions on push to `main`                    | `vercel deploy --prebuilt --prod`                |
| `apps/worker` (Inngest) | **Fly.io** (IAD)  | GitHub Actions on push to `main`                    | `flyctl deploy --remote-only --strategy rolling` |
| Database migrations     | **Neon Postgres** | Manual GitHub Actions workflow with dry-run default | Custom `migrate.ts` via `pnpm db:migrate:ci`     |

The workflows live in `.github/workflows/{ci,deploy,db-migrate}.yml`.

---

## CI (`ci.yml`)

Runs on every PR and push to `main`. Fails the build if any of:

```
pnpm typecheck   # all six packages
pnpm lint        # ESLint across all packages
pnpm test        # Vitest in packages/core (246 tests as of handoff)
```

Build time: ~5–8 minutes with cache, ~12 minutes cold.

---

## Web deploy (`deploy.yml` → `deploy-web`)

Triggers:

- Auto on push to `main`.
- Manual via workflow dispatch (`target: web | all`).

Steps:

1. Checkout.
2. Setup pnpm 11.1.1, Node 20.
3. `pnpm install --frozen-lockfile`.
4. Install Vercel CLI globally.
5. `vercel pull --yes --environment=production --token $VERCEL_TOKEN`.
6. `vercel build --prod --token $VERCEL_TOKEN`.
7. `vercel deploy --prebuilt --prod --token $VERCEL_TOKEN`.

The Vercel project is configured in `apps/web/vercel.json` with the
build command pointing back at the monorepo:

```json
"buildCommand": "cd ../.. && pnpm install --frozen-lockfile && pnpm -F @coinfrenzy/web build"
```

Required GitHub secrets:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Env vars on Vercel come from Doppler via the Doppler↔Vercel integration
(per `runbooks/deploy.md`). Pull manually if needed:

```bash
doppler secrets download --no-file --format env > apps/web/.env.local
```

---

## Worker deploy (`deploy.yml` → `deploy-worker`)

Triggers:

- Auto on push to `main`.
- Manual via workflow dispatch (`target: worker | all`).

Steps:

1. Checkout.
2. Install `flyctl` via the official action.
3. `flyctl deploy --config fly.toml --dockerfile Dockerfile --remote-only --strategy rolling --wait-timeout 600` (cwd `apps/worker`).

Fly app: `coinfrenzy-worker`. Region: `iad`. Single machine
(`shared-cpu-1x`, 1 GB). Auto-stop disabled, auto-start enabled,
`min_machines_running = 1`. Rolling deploys with a `/healthz` health
check (15 s interval).

Required GitHub secret:

- `FLY_API_TOKEN` (org-scoped recommended)

Secrets are pushed to Fly via Doppler:

```bash
doppler run -- flyctl secrets import --app coinfrenzy-worker < secrets.env
```

---

## Database migrations (`db-migrate.yml`)

**Manual only**. Never auto-applied. Default mode is dry-run.

Trigger: workflow_dispatch in GitHub UI → "Run workflow".

Inputs:

- `dry_run` (boolean, default `true`) — lists what would apply via
  `pnpm -F @coinfrenzy/db db:migrate:status`. Apply only when set to
  `false`.

Steps when applying:

1. Checkout.
2. Setup pnpm + Node 20.
3. `pnpm install --frozen-lockfile`.
4. `pnpm -F @coinfrenzy/db db:migrate:status` — print pending list.
5. `pnpm -F @coinfrenzy/db db:migrate:ci` — apply.

Required GitHub secret:

- `NEON_DATABASE_URL_MIGRATE` — the un-pooled Neon URL with the
  elevated role used by migrations (separate from the runtime role
  that RLS pins).

Migration ordering: SQL files in `packages/db/src/migrations/` apply
lex-sorted (0000, 0001, …, 0025). The runner records applied names in
`_app_migrations` and skips already-applied files.

---

## Environments

| Env               | Branch | Web                              | Worker                                    | DB                                 |
| ----------------- | ------ | -------------------------------- | ----------------------------------------- | ---------------------------------- |
| Local dev         | any    | `pnpm dev`                       | `pnpm dev` (worker watches)               | Local Neon branch via `.env.local` |
| Preview / staging | PR     | Vercel preview URL (per-PR)      | Same Fly app (single environment for now) | Neon branch (manual snapshot)      |
| Production        | `main` | `coinfrenzy.com` (custom domain) | `coinfrenzy-worker.fly.dev`               | Neon `production` branch           |

For preview environments to run end-to-end:

- Vercel preview gets `USE_MOCK_*=true` for all vendors.
- The worker is shared with production; preview events go through it
  with a synthetic prefix.
- Pusher channels are namespaced with the env name to avoid
  cross-env subscription leaks.

(Staging as a true separate environment is **planned** — see
`13-known-gaps.md`. Today preview ≈ staging.)

---

## Deploy cycle (happy path)

1. Open PR.
2. CI passes (typecheck + lint + tests).
3. Vercel preview URL is generated automatically.
4. Reviewer + product check the preview.
5. Merge to `main`.
6. Auto-deploys fire for `deploy-web` and `deploy-worker`.
7. If the PR has migrations:
   - Open `db-migrate.yml` in GitHub Actions.
   - Run with `dry_run = true` → confirm the pending list matches your
     expectation.
   - Run again with `dry_run = false` → apply.
   - Monitor `/admin/integrity` for vendor noise.
8. Smoke check `/admin/` → dashboard counters tick → walk a player
   signup → buy a package via Finix mock → win at Alea mock → check
   the ledger.

Promotion checklist before deploy (from `runbooks/deploy.md`):

- [ ] PR reviewed.
- [ ] CI passed.
- [ ] Migrations (if any) tested on a preview / staging branch first.
- [ ] No active sev-1 incident.
- [ ] Outside peak hours (12-3am ET is safest).

---

## Rollback

See `runbooks/rollback.md` for step-by-step.

In short:

- **Web**: Vercel dashboard → Deployments → Promote previous good
  deployment.
- **Worker**: `fly releases list` then `fly releases rollback <version>`.
- **Database**: forward-only. Roll back code first; if the schema
  change is genuinely incompatible, write a follow-up migration that
  reverses it.

This is why every migration must be reviewed for backward
compatibility before merge. Breaking changes need a multi-deploy plan:

- **Deploy 1**: add new column (nullable), code writes both old + new.
- **Deploy 2**: backfill; code reads new.
- **Deploy 3**: drop old column.

---

## Custom domains + DNS

Production custom domain config lives in Vercel for `apps/web`:

- `coinfrenzy.com` (apex) — A/AAAA records to Vercel.
- `www.coinfrenzy.com` — CNAME to Vercel.

Optional admin host split (`admin.coinfrenzy.com`) is not currently
configured. To turn it on:

1. Add the domain to the Vercel project.
2. In `middleware.ts`, branch on `request.headers.get('host')` to
   restrict `/admin/*` to the admin host (and reject `/admin/*` on the
   player host).

---

## Observability dashboards

After every deploy, glance at:

- **Vercel deployment logs** for any obvious build warnings.
- **Sentry** — release-tagged errors.
- **Axiom** — log volume + error rate.
- **Grafana Cloud** — perf budget dashboards (ledger write p95, balance
  cache hit rate, Pusher publish latency).
- **PagerDuty** — incidents (none expected).

---

## Status page

Statuspage.io maintains the public status page. Components:

- API, Web App, Game Lobby, Payments, KYC, Database.
- Auto-incident creation from PagerDuty.
- Manual incidents during planned windows.

---

## Required GitHub repo secrets (consolidated)

For CI/CD to work, set these in GitHub → Settings → Secrets → Actions:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `FLY_API_TOKEN`
- `NEON_DATABASE_URL_MIGRATE`
- (optional) `DOPPLER_TOKEN` — if you want CI to push Fly secrets
  from Doppler automatically.

---

## What to read next

- `runbooks/deploy-to-staging.md`, `runbooks/deploy-to-production.md`,
  `runbooks/rollback.md`.
- `13-known-gaps.md` — staging env not yet separate.
- `20-credentials-and-access.md` — full secret inventory.
