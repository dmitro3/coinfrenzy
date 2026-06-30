# Staging Environment

This repository now has a dedicated `staging` branch and a long-lived staging
deployment so the dev team can push and test changes without touching the
production site at `frenzycreator.com`.

---

## TL;DR for developers

- **Where you push:** the `staging` branch (`git push origin staging`).
- **Where it deploys:** every push gets auto-deployed by Vercel to a stable
  staging URL — see "Staging URL" below.
- **How you know you're on staging:** every page shows an orange `STAGING`
  banner across the top with the active branch + commit SHA. Production
  (`frenzycreator.com`) never shows the banner.
- **Promoting to production:** once a change is verified on staging, open a
  PR from `staging` → `main`. Merging to `main` is what ships to real users.

```bash
# typical day-in-the-life
git checkout staging
git pull origin staging
# … make changes …
git push origin staging       # auto-deploys to staging URL in ~60s
# verify on the staging URL, then:
gh pr create --base main --head staging
```

---

## Staging URL

Vercel automatically gives every non-`main` branch a deterministic preview URL
of the form:

```
https://coinfrenzy-creators-git-staging-<vercel-team-slug>.vercel.app
```

After the first push to the `staging` branch, the exact URL will appear in
the Vercel dashboard under **Deployments**. To pin a friendlier alias
(e.g. `staging-frenzycreator.vercel.app` or `staging.frenzycreator.com`),
follow **Step 4** below.

---

## One-time setup checklist (Vercel dashboard, ~10 minutes)

You need to do these once. None of them require running any commands.

### 1. Confirm the staging branch deploys

- Open https://vercel.com/dashboard → **coinfrenzy-creators** project.
- Click **Deployments**. After we push the `staging` branch you should see a
  new deployment with the branch name `staging` and the orange "Preview"
  pill. That deployment's URL is your staging URL.
- Click into the deployment and verify the orange `STAGING` banner appears
  at the top of the page.

### 2. CRITICAL — point staging at a separate Supabase project

This is the single most important step. Without it, staging writes to the
**same database production reads from**, which means a developer testing a
new feature can corrupt real affiliate balances, attribution, or NGR rows.

1. In **Supabase** → **New Project** → name it `frenzycreator-staging`.
2. Run every migration in `supabase/migrations/` against the new project so
   the schema matches production. From the Supabase SQL editor, paste the
   contents of each `.sql` file in numerical order and run them.
3. Optional but recommended: copy a small snapshot of production data
   (users + a handful of players + a handful of NGR rows) into staging so
   the dashboard isn't completely empty when developers test.
4. Grab the staging project's `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
5. In **Vercel** → **coinfrenzy-creators** → **Settings** → **Environment
   Variables**, add both values and tick **only** the **Preview** checkbox
   (leave Production unchecked). For both env vars, also click "Edit" →
   "Git Branch" and type `staging` so the override only applies to that
   branch, not other random preview deployments.

   The result you want is:

   | Var                          | Production       | Preview (`staging`) |
   |------------------------------|------------------|---------------------|
   | `SUPABASE_URL`               | …prod project…   | …staging project…   |
   | `SUPABASE_SERVICE_ROLE_KEY`  | …prod key…       | …staging key…       |

6. Trigger a redeploy of the `staging` branch (Deployments → click the
   latest staging deployment → ⋯ menu → **Redeploy**) so it picks up the
   new env vars.

### 3. CRITICAL — point staging at staging-only secrets

Repeat the same per-branch override pattern for these so test pushes from
the dev team can't fire real CoinFrenzy webhooks or be confused with real
admin/partner sessions:

- `COINFRENZY_CRON_API_KEY` — ask CoinFrenzy for a sandbox / test API key
  if they have one. If not, use the same prod key but flag this as a
  follow-up (see "Known limitations" at the bottom).
- `FRENZY_CREATOR_API_KEY` — generate a fresh secret for staging
  (`openssl rand -hex 32`) and give the new value to CoinFrenzy so they
  can configure their staging webhook to point at the staging URL.
- `ADMIN_SESSION_SECRET` — fresh `openssl rand -hex 32` so a stolen prod
  admin token cannot log into staging and vice versa.
- `PARTNER_SESSION_SECRET` — fresh `openssl rand -hex 32` for the same
  reason.
- `ALLOWED_ORIGIN` — set to the staging URL (e.g.
  `https://coinfrenzy-creators-git-staging-<team>.vercel.app` or, if you
  set up a custom subdomain in step 4, that subdomain). This stops the
  prod browser from being able to call the staging API.

### 4. (Optional) Custom staging subdomain

If `coinfrenzy-creators-git-staging-…vercel.app` is too long, you can point
a friendlier hostname at the staging branch:

1. In Vercel → **coinfrenzy-creators** → **Settings** → **Domains**, add
   either:
   - `staging-frenzycreator.vercel.app` (free, no DNS change), or
   - `staging.frenzycreator.com` (requires adding a CNAME at your DNS host
     pointing to `cname.vercel-dns.com`).
2. When prompted "Which Git Branch should this domain serve?" choose
   `staging`.
3. After the domain is live, append it to `PROD_HOSTS` is **not** needed —
   the env-banner script already treats anything that isn't
   `frenzycreator.com` / `www.frenzycreator.com` as non-production.
4. Update `ALLOWED_ORIGIN` (preview override) to the new domain.

### 5. (Optional) Tell CoinFrenzy about the staging webhook

If you want CoinFrenzy to also POST player-registration / NGR data into
staging, give them the staging webhook URL plus the new
`FRENZY_CREATOR_API_KEY` you generated in step 3. Otherwise staging will
just have whatever data you seeded manually plus any rows the dev team
inserts via the admin UI.

---

## How the staging banner works

`env-banner.js` is loaded by every public HTML page. It runs in the browser
and checks `window.location.hostname`:

- `frenzycreator.com` / `www.frenzycreator.com` → **no banner**
- `localhost`, `127.0.0.1` → blue `LOCAL DEV` banner
- `…git-staging…` or `…-staging…` or `staging.…` → orange `STAGING` banner
- any other `*.vercel.app` URL → purple `PREVIEW` banner
- anything else → red `NON-PROD` banner

The banner also calls `/api/_meta/environment` (read-only, no secrets) and
appends `env=…  branch=…  sha=…` so devs can verify the exact deployment
without opening DevTools.

If you ever want to silence the banner on a specific staging URL (e.g.
because you're recording a demo), click it once — it dismisses for the
rest of the page session.

---

## Promotion flow (staging → production)

```
   feature work          test on staging      ship to users
        │                       │                    │
        ▼                       ▼                    ▼
   feature/foo  ──merge──►  staging  ──PR + merge──►  main
                                                       │
                                              auto-deploys to
                                              frenzycreator.com
```

- Always start work on a feature branch off `staging` (or off `main`).
- Land it into `staging` first.
- Verify on the staging URL with seeded test data.
- Open a PR from `staging` → `main` to ship.
- Don't push directly to `main` unless it's a hotfix.

---

## Known limitations / follow-ups

1. **CoinFrenzy outbound calls**: until CoinFrenzy issues a sandbox API key,
   any call from staging that hits `dev2-cron.coinfrenzy.com` (e.g. promo
   code creation) will create real records on the live CoinFrenzy side. Tell
   the dev team not to test promo-code creation flows on staging until the
   sandbox key is provisioned, or expect to clean up test promo codes
   afterwards.
2. **Supabase migrations**: there's no automated migration runner in this
   repo. If a developer adds a migration on the `staging` branch they need
   to run it manually against the staging Supabase project before merging.
3. **Vercel env-var overrides per-branch**: Vercel only honors per-branch
   env-var overrides on Preview deployments, not on Production. The staging
   branch is always treated as Preview, so this works. Don't change the
   staging branch's "Production Branch" setting in Vercel.
