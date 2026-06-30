# Frenzy Creator — Codebase Snapshot

Clean snapshot of both git branches of the Frenzy Creator (CoinFrenzy Affiliate / Creator Portal) codebase. Generated on demand for sharing context with another AI assistant or collaborator.

## What's in here

```
Frenzy-Creator-Codebase/
├── README.md          ← you are here
├── main/              ← live production branch (deploys to coinfrenzy-creators on Vercel)
└── staging/           ← isolated staging branch (deploys to coinfrenzy-creators-staging on Vercel)
```

Both folders contain **only committed source code** — no `node_modules/`, no `.git/`, no `.env` files, no build artifacts, no Vercel project metadata. Pure, shareable, self-contained.

## Branch state at snapshot time

### `main/` (production)
- **Commit:** `fde3991a9901f0fed5eff355e97f44032b46e5d3`
- **Last commit date:** 2026-05-11 22:17:56 -0400
- **Last commit message:** `api/partner/earnings: chunk ngr_data OR query for partners with 1k+ refs`
- **Files:** 89

### `staging/` (isolated test environment)
- **Commit:** `416af675b43f6d5a4116660e707afc91f8887452`
- **Last commit date:** 2026-05-04 13:06:48 -0400
- **Last commit message:** `chore(staging): trigger first deploy on dedicated coinfrenzy-creators-staging project`
- **Files:** 84

`main` is ahead of `staging` — a lot of post-staging work has shipped directly to production (admin VIP tier widgets, partner dashboard design overhaul, autofill fixes, Total Play "What is this?" explainer, lifetime earnings hero fix, large-partner ngr_data chunking, etc.). Staging has been used sparingly since.

## Repo at a glance

The codebase is a hybrid:

- **Static frontend** — vanilla HTML/CSS/JS files at the root (`partner.html`, `admin.html`, `admin-login.html`, marketing pages, etc.). No build step, no framework. Each file is self-contained with inline `<style>` and `<script>` blocks.
- **Serverless backend** — `api/` directory contains Vercel serverless functions (Node.js, CommonJS) that talk to Supabase, CoinFrenzy webhooks, and email/SMS providers.
- **Data layer** — Supabase PostgreSQL with row-level security and idempotent SQL migrations under `supabase/migrations/`.
- **Deployment** — `vercel.json` at the root drives both Vercel projects (`coinfrenzy-creators` for production, `coinfrenzy-creators-staging` for staging).

## Top-level surface area

```
admin.html              Admin dashboard (player table, VIP tracking, payouts, integrity tab)
partner.html            Affiliate / Creator partner portal (earnings, campaigns, playbook)
admin-login.html        Admin auth gate
api/                    Serverless functions (Node 18+, CommonJS)
  partner/              Partner-facing endpoints (earnings, campaigns, profile)
  admin/                Admin-only endpoints (gated by admin token)
  webhook/              CoinFrenzy webhook receivers (player registration, NGR sync)
  _lib/                 Shared utilities (auth, ledger, NGR schema, CORS, pagination)
supabase/migrations/    Idempotent SQL migrations for the canonical schema
STAGING.md              How staging is provisioned and accessed
.env.example            Required environment variables (no secrets)
package.json            Dependencies (@supabase/supabase-js, etc.)
vercel.json             Routing + headers for both Vercel projects
```

## What's intentionally NOT in this snapshot

- `node_modules/` — run `npm install` to restore (~11M)
- `.git/` — this is a flat snapshot, not a git repo. Original repo lives at https://github.com/chrisnycvillage-cyber/coinfrenzy-creators
- `.env` / `.env.local` — secrets stay with the operator; `.env.example` shows the required keys
- `.vercel/` — local Vercel project linkage (regenerated on `vercel link`)
- `.venv/` — Python virtualenv from old experimental scripts; not part of the runtime
- `assets/` user-pasted screenshots — would inflate the snapshot

## To pick this up in a new context

1. Drop the folder into a chat with the new assistant.
2. Point them at `main/` for the current production state and `staging/` for what's deployed to the isolated test environment.
3. The interesting design + business-logic surfaces:
   - `partner.html` — single biggest file (~16k lines, hero earnings widget, ambient gold flow, blackjack-style "What is this?" panel, status pill, wallet strip, referrals table, campaigns, playbook)
   - `admin.html` — single biggest admin file (player aggregation, VIP tier widgets, payout flow, integrity tab)
   - `api/_lib/ledger.js` — canonical earnings/owed math (treat as source of truth; never recompute downstream)
   - `api/partner/earnings.js` — partner dashboard data endpoint (recently hardened with chunked ngr_data fetch for partners with 1k+ referrals)
   - `api/webhook/player-registration.js` — CoinFrenzy → us inbound webhook for new players

## Snapshot generation

This snapshot was produced with:

```bash
git archive --format=tar main    | tar -x -C ./main/
git archive --format=tar staging | tar -x -C ./staging/
```

`git archive` only includes content actually committed to the branch, so anything in `.gitignore` (secrets, node_modules, etc.) is excluded by construction.
