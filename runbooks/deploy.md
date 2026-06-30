# Deploy Runbook

How to deploy CoinFrenzy. Read once. Reference as needed.

---

## What deploys where

| Component | Where it deploys | How |
| --- | --- | --- |
| `apps/web` (Next.js) | Vercel | Push to `main` → preview build → manual promote |
| `apps/worker` (Inngest worker) | Fly.io | GitHub Actions on push to `main` |
| Database migrations | Neon Postgres | `pnpm db:migrate` from a CI runner with prod DATABASE_URL |

---

## First-time deploy setup

### Vercel

1. Connect the GitHub repo
2. Import the project, root directory = `apps/web`
3. Framework preset = Next.js
4. Set environment variables (all secrets from Doppler):
   - Use the Doppler CLI integration: `doppler integrations create vercel`
   - This auto-syncs Doppler secrets to Vercel env
5. Custom domains:
   - `coinfrenzy.com` (or whichever your apex domain is)
   - `admin.coinfrenzy.com`
6. Verify the `middleware.ts` is doing host-based routing (per Doc 10 §3.1)

### Fly.io

1. From the repo root:
   ```
   cd apps/worker
   fly launch --copy-config --no-deploy
   ```
2. Set secrets:
   ```
   fly secrets set $(doppler secrets download --no-file --format env)
   ```
3. Deploy:
   ```
   fly deploy
   ```
4. Verify the Inngest worker is registered in the Inngest dashboard

### Neon

1. The `pnpm db:migrate` ran during prompt 02 against your dev branch
2. For production, create a branch in Neon called "production"
3. CI runs `pnpm db:migrate` against the production branch on every push to `main`
4. Manual migration if needed:
   ```
   DATABASE_URL=<prod-url> pnpm db:migrate
   ```

---

## Normal deploy cycle

1. Open PR → automatic preview deploy
2. Merge to `main` → automatic preview deploy + Fly.io worker deploy
3. Run migrations if schema changed (CI does this automatically)
4. Manual promote in Vercel dashboard to push the preview to production

### Promotion checklist

Before clicking "Promote to Production":

- [ ] PR has been reviewed
- [ ] CI passed
- [ ] Migrations (if any) tested on staging branch first
- [ ] No active SEV-1 incident
- [ ] Window is not during peak hours (12-3am ET is safest)

---

## Rollback

### Code rollback

In Vercel:
1. Deployments tab → find previous good deployment
2. "Promote to Production"
3. Site is back in ~30 seconds

### Migration rollback

Drizzle migrations are forward-only by default. If a migration causes
problems:
1. Roll back the code first (see above)
2. The new code runs against the new schema (forward-compatible code
   should be the rule)
3. If the schema change is breaking, write a forward migration that
   reverses the change, deploy through normal flow

This is why every migration must be reviewed for backward compatibility
before merge. Breaking schema changes need a multi-deploy plan:
- Deploy 1: Add new column (nullable), code writes both old + new
- Deploy 2: Backfill, code reads new
- Deploy 3: Drop old column

### Worker rollback

```
fly releases
fly releases rollback <version>
```

---

## Status page

We use Statuspage.io for the public-facing status page.
- Components: API, Web App, Game Lobby, Payments, KYC, Database
- Auto-incident creation from PagerDuty incidents
- Manual incidents during maintenance windows
