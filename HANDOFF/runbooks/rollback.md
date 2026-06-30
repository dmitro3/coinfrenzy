# Runbook · Rollback

When a deploy is broken. Three independent rollback paths; pick the
one(s) that apply.

---

## Decide what to roll back

1. **Is web broken?** → §A (Vercel rollback).
2. **Is worker broken?** → §B (Fly rollback).
3. **Did a migration cause it?** → §C (DB considerations).
4. **All of the above?** → All three sections; web first.

If you're unsure, roll back web first — it's the safest, fastest, and
covers most "bad code" scenarios.

---

## A. Web rollback (Vercel)

### Steps

1. Open Vercel dashboard → project `coinfrenzy-web` → Deployments.
2. Find the last known-good production deployment (look at git sha).
3. Click the `…` menu on that deployment → **Promote to Production**.
4. Vercel re-points the production alias to that deployment in
   ~30 seconds.
5. Verify:
   - `coinfrenzy.com` loads.
   - The Vercel "Production" indicator shows the rolled-back deploy.

### CLI alternative

```bash
vercel ls coinfrenzy-web
vercel promote <deployment-url> --token "$VERCEL_TOKEN"
```

### Time to recover

< 1 minute.

---

## B. Worker rollback (Fly.io)

### Steps

```bash
flyctl releases list --app coinfrenzy-worker
# Identify the last good release version (e.g. v42)

flyctl releases rollback v42 --app coinfrenzy-worker
```

This re-deploys the prior image as a rolling deploy. Health checks
gate the cutover; if the old image was healthy, the new machine takes
over within ~30 seconds.

### Verify

```bash
flyctl status --app coinfrenzy-worker
flyctl logs --app coinfrenzy-worker | tail -50
```

- Latest release matches the rolled-back version.
- `[worker] listening on :3030` in logs.
- `/healthz` returns `ok`.

### Time to recover

~1 minute.

---

## C. Database migration considerations

**Drizzle migrations are forward-only.** There's no "rollback" command.
Decide between three paths:

### C1. Forward-compatible code rollback (most common)

If the failed deploy applied a migration but the schema is
backward-compatible (the previous code can read the new schema):

1. Roll back code (§A and/or §B).
2. The previous code now runs against the new schema; that's fine for
   forward-compatible changes (added nullable columns, new indexes,
   new tables).
3. No DB action needed.

### C2. Reverse migration (breaking change)

If the migration was breaking (dropped a column, narrowed a type,
renamed without alias), you must write a forward-direction migration
that reverses it.

1. Roll back code first (§A and/or §B). Site will likely 500 until §3.
2. Write a new migration in `packages/db/src/migrations/<NN+1>_revert_<name>.sql`
   that reverses the schema change.
3. Open a PR, merge, deploy, run `db-migrate.yml`.
4. Confirm the site is back.

This is why **every migration must be reviewed for backward
compatibility before merge**. Breaking changes need a multi-deploy
plan:

- Deploy 1: add new column (nullable). Code writes old + new.
- Deploy 2: backfill. Code reads new.
- Deploy 3: drop old column.

### C3. PITR (last resort)

If the migration corrupted data and you can't reverse logically:

1. Sev-1 incident; page on-call.
2. Pause writes (put admin into maintenance via a feature flag if you
   have one; otherwise rate-limit drastically).
3. Use Neon PITR (Point-in-Time Recovery) to branch from a timestamp
   just before the bad migration.
4. Swap `DATABASE_URL` to the PITR branch.
5. Re-apply only the migrations that should have happened.
6. Replay any missed events from `pending_webhooks`.

This is a real procedure but should never be necessary if migrations
are reviewed properly.

---

## Communicate

After rollback:

1. Update the team in the operator channel:
   ```
   ⏪ Rolled back <area> to <commit-or-release>
   Reason: <one-line>
   Impact: <user-visible / internal>
   Next steps: <fix forward plan>
   ```
2. If user-impacting: post on the status page.
3. Open a ticket for the root cause + fix.

---

## Post-incident

- [ ] Sentry / Axiom show no new errors.
- [ ] Smoke check passes (`/admin` dashboard ticks, a purchase
      completes via mock).
- [ ] Status page updated (resolved).
- [ ] Sev-1 / Sev-2 incidents trigger a post-mortem within 48 h.

---

## Done when

- [ ] Production is on the last-known-good version.
- [ ] Smoke check passes.
- [ ] Team has been told.
- [ ] Status page reflects reality.
- [ ] A ticket exists for the fix-forward work.
