# Runbook · Deploy to Production

The merge-to-main path. Vercel + Fly deploys fire automatically; you
manually run migrations only if the PR includes them.

---

## Preconditions

- [ ] PR has been reviewed and approved.
- [ ] CI green on the latest commit.
- [ ] Preview deploy verified (`runbooks/deploy-to-staging.md`).
- [ ] No active sev-1 incident.
- [ ] Window is acceptable (12-3 am ET is safest; avoid Fri evenings).
- [ ] If migrations are in the PR: dry-run already done on staging.

---

## Steps

### 1. Merge to main

```bash
gh pr merge <PR#> --squash --delete-branch
```

This triggers:

- `.github/workflows/ci.yml` (CI re-runs on main; ~8 min).
- `.github/workflows/deploy.yml` jobs `deploy-web` (Vercel) and
  `deploy-worker` (Fly).

Watch the Actions tab in GitHub. Both jobs should turn green within
~15 minutes.

### 2. If the PR has migrations: run `db-migrate.yml`

Open https://github.com/<org>/<repo>/actions/workflows/db-migrate.yml

a. Click "Run workflow".
b. **First run with `dry_run = true`**.
c. Confirm the pending list matches your expectation.
d. Re-run with `dry_run = false`.
e. Watch the logs; it should complete in seconds for typical changes.

### 3. Confirm web deploy

- Vercel dashboard → project → check the latest production deployment
  is the merge commit.
- Visit `https://coinfrenzy.com` → loads.
- Visit `https://coinfrenzy.com/admin` → login screen renders.

### 4. Confirm worker deploy

```bash
flyctl status --app coinfrenzy-worker
flyctl releases --app coinfrenzy-worker | head
flyctl logs --app coinfrenzy-worker | tail -50
```

- One machine running.
- Latest release matches the merge commit.
- Logs show `[worker] listening on :3030`.

### 5. Smoke check

- `/admin` dashboard counters tick (Pusher channel is live).
- `/admin/integrity` shows mock badges where expected.
- Run a single test purchase via `/mock-vendors/finix` (staging) or
  via a real $1 purchase (prod).
- Confirm the player's wallet updates within ~2 seconds.
- Confirm a new row exists in `ledger_entries` for the purchase.

### 6. Monitor for 30 minutes

- Sentry: no new error spikes on the release tag.
- Axiom: log volume normal.
- Grafana: ledger write p95 within budget.
- PagerDuty: no incidents fired.

### 7. Announce

Post in the team channel:

```
✅ Deployed <commit-short-sha> to prod
- web: <vercel deployment URL>
- worker: release v<N>
- migrations: <list applied or "none">
- smoke: passed
```

---

## If something goes wrong

Immediately follow `runbooks/rollback.md`. Don't try to fix forward
under pressure.

---

## Done when

- [ ] Both `deploy-web` and `deploy-worker` jobs green.
- [ ] Migrations applied (if any).
- [ ] Smoke passed.
- [ ] 30-minute monitoring window clean.
- [ ] Announcement posted.
