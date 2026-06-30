# Runbook · Deploy to Staging

> Note: a dedicated staging environment is on the recommended-next-work
> list (`14-recommended-next-work.md` #5). Until it lands, "staging" =
> a Vercel preview deploy + a Neon staging branch (manually created).
> This runbook documents the steps that apply today.

---

## Preconditions

- [ ] Your branch is up to date with `main`.
- [ ] CI is green on the latest commit.
- [ ] Schema changes (if any) have a corresponding SQL migration in
      `packages/db/src/migrations/`.

---

## Steps

### 1. Open the PR

```bash
git push -u origin <branch>
gh pr create --base main --title "<title>"
```

Vercel will start a preview build automatically (~5-10 min).

### 2. Verify the preview build

- In the PR page, click the "Vercel" check → "Visit preview".
- Smoke check:
  - `/lobby` renders with seed data.
  - `/admin/login` accepts your account.
  - `/admin/integrity` shows expected mock-mode badges.

### 3. (Optional) Promote a Neon branch as a staging DB

If you need an isolated DB for migration testing:

```bash
# Via Neon dashboard:
#   Project → Branches → "+ Branch"
#   Name: pr-<number>
#   Parent: production (or main dev branch)
# Copy the pooled + direct URLs.
```

Then point your preview at this branch:

```bash
# Vercel project → Settings → Environment Variables
# Add to "Preview" scope:
#   DATABASE_URL=<pooled url for pr-<number>>
#   DATABASE_URL_DIRECT=<direct url for pr-<number>>
# Trigger a redeploy by pushing a no-op commit.
```

### 4. Apply pending migrations to the staging DB

```bash
DATABASE_URL=<direct url for pr-<number>> \
  pnpm -F @coinfrenzy/db db:migrate:status

DATABASE_URL=<direct url for pr-<number>> \
  pnpm -F @coinfrenzy/db db:migrate
```

### 5. Smoke-test the new feature on the preview URL

- Walk the feature end-to-end.
- Watch for runtime errors in Sentry (use the preview's release tag).
- Confirm `/admin/integrity` is still green.

### 6. Request review

```bash
gh pr ready
gh pr review --request <reviewer>
```

---

## Rollback

For a preview deploy:

- Just push another commit. The preview redeploys.

For a staging DB:

- Drop the Neon branch (`pr-<number>`).
- Re-create from `production` parent.

---

## Done when

- [ ] Preview URL is up.
- [ ] Smoke check passed.
- [ ] Review requested.
- [ ] No new Sentry errors on the preview release.
