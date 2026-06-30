# 14 · Recommended Next Work

A prioritised backlog for the incoming team. Each item: why it matters,
estimated effort (S = ½ day, M = 1-3 days, L = 1 week, XL = 2+ weeks),
dependencies, acceptance criteria.

Cross-reference with `13-known-gaps.md` for the longer list of gaps and
their context.

---

## P0 — Blockers for production launch

### 1. Wire live Finix credentials

- **Why**: until `USE_MOCK_FINIX=false`, no real money moves.
- **Effort**: S (assuming contract is signed and creds in hand).
- **Dependencies**: signed Finix contract, Doppler access.
- **Acceptance**:
  - Live API key + application id + webhook secret in Doppler `prod`.
  - `NEXT_PUBLIC_FINIX_ENVIRONMENT=live`.
  - `USE_MOCK_FINIX=false` in prod.
  - End-to-end smoke: a real $1.00 purchase succeeds, webhook acks,
    ledger updates, wallet pings.

### 2. Wire live Alea credentials + reconciliation smoke

- **Why**: until real Alea is connected, no real games launch.
- **Effort**: S.
- **Dependencies**: Alea contract + portal access.
- **Acceptance**:
  - Live `ALEA_API_BASE` + `ALEA_API_KEY` + `ALEA_WEBHOOK_SECRET` in
    Doppler `prod`.
  - `USE_MOCK_ALEA=false`.
  - At least one real game launches; bet + win webhooks land; ledger
    matches Alea's report after the first `reconcile-alea` nightly.

### 3. 1099-MISC vendor selection + integration

- **Why**: regulatory deadline of Jan 31 following any year with
  > $600/payee redemptions.
- **Effort**: M (after vendor decision).
- **Dependencies**: operator decision (Track1099 vs TaxBandits vs
  alternative).
- **Acceptance**:
  - Adapter built under `packages/core/src/adapters/<vendor>/`.
  - `core.redemption.tax-rollup` generates the source payload.
  - Filing endpoint stubbed for dry-run; PDF preview works in
    `/admin/reports/tax`.

### 4. Pen-test (external firm)

- **Why**: real money + PII + regulatory exposure. Don't launch
  without one.
- **Effort**: M (work to remediate findings) on top of vendor
  engagement.
- **Dependencies**: contract with a pen-test firm.
- **Acceptance**:
  - Scope covers: player + admin + host + webhook + auth + 2FA + RLS.
  - All sev-1/sev-2 findings remediated.
  - Re-test confirms clean.

### 5. Separate staging environment

- **Why**: dry-run migrations and load tests without touching prod.
- **Effort**: M.
- **Dependencies**: Neon branch + Vercel project + Fly app.
- **Acceptance**:
  - `staging.coinfrenzy.com` resolves to a Vercel project pointing at a
    Neon staging branch.
  - GitHub Actions `deploy.yml` adds a `staging` target.
  - Migrations dry-run on staging first, gated manual promote to prod.

### 6. CSP (Content-Security-Policy) header

- **Why**: defense in depth; current `vercel.json` is missing it.
- **Effort**: S.
- **Dependencies**: confirmed allow-list (Alea iframe domains, Finix
  Hosted Fields, Pusher).
- **Acceptance**: CSP header set in `vercel.json` headers block; no
  console errors in any flow.

---

## P1 — Ship within first month of launch

### 7. Permissions consolidation

- **Why**: open-coded role checks risk drift; named helpers exist.
- **Effort**: S.
- **Dependencies**: none.
- **Acceptance**: every route handler uses a named helper from
  `packages/core/src/auth/permissions.ts`; CI lint catches new
  `role === '…'` patterns in route files.

### 8. `crm.getMessage` partition-key fix

- **Why**: cross-partition scan today; will get slow.
- **Effort**: S.
- **Dependencies**: none.
- **Acceptance**: `getMessage(id, createdAt)`; admin UI passes
  `createdAt` through the URL; verified plan with partition prune.

### 9. Notification Center compose dialog

- **Why**: mirror Email Center's polish.
- **Effort**: S (~2 hours per report §8 estimate).
- **Acceptance**: compose dialog with recipient picker + template
  loader; filtered inbox; detail dialog with timeline.

### 10. Suppression list ops UI

- **Why**: today removal is webhook/manager-only; ops needs a clean UI.
- **Effort**: S.
- **Acceptance**: `/admin/crm/suppression` supports search, view, and
  remove (master-only); audited.

### 11. TIER_CAPS in system_config

- **Why**: ops shouldn't deploy code to bump a cap.
- **Effort**: S.
- **Acceptance**: `system_config` row read at runtime; admin UI for
  master at `/admin/settings/safety-caps`; cap changes audited.

### 12. Email body storage decision + implementation

- **Why**: 200-char preview limits the audit story.
- **Effort**: M.
- **Acceptance**: stored full body via R2 reference (recommended) OR
  on-demand re-render path; admin detail dialog shows full body.

### 13. Partition pruning crons

- **Why**: `player_events` + `crm_message_log` grow forever otherwise.
- **Effort**: S each.
- **Acceptance**: nightly Inngest function drops partitions older
  than the retention threshold; alerts on failure.

### 14. Mobile polish push

- **Why**: player traffic will be mostly mobile.
- **Effort**: M.
- **Dependencies**: design review of remaining issues in
  `docs/ux-polish-audit.md`.
- **Acceptance**: every player surface scores > 90 in Lighthouse
  Mobile; no jitter on big-win overlay.

### 15. Performance indexes pass

- **Why**: a couple of `WHERE` patterns added in the last pass would
  benefit from partial indexes.
- **Effort**: S.
- **Acceptance**: `pnpm -F @coinfrenzy/db db:verify` extended to flag;
  new indexes added in a migration.

### 16. Pusher fan-out load test

- **Why**: live wins ticker + balance pill fan-out untested at scale.
- **Effort**: S.
- **Acceptance**: synthetic load (2x projected concurrent players)
  with sub-200 ms publish-to-receive p95.

### 17. Realtime monitoring dashboards

- **Why**: budget targets exist; dashboards confirm we're in budget.
- **Effort**: M.
- **Acceptance**: Grafana dashboards for ledger write p95, balance
  cache hit, Pusher publish lag, webhook receive p95.

### 18. Backup verification drill

- **Why**: untested backups are paper backups.
- **Effort**: S.
- **Acceptance**: quarterly Neon PITR restore to a throwaway branch,
  basic smoke run.

### 19. Disaster recovery runbook

- **Why**: complement to `incident_response.md`.
- **Effort**: S.
- **Acceptance**: runbook covering Neon region outage, Vercel outage,
  Fly outage, with manual steps.

### 20. Playwright E2E suite

- **Why**: today there are 0 E2E tests.
- **Effort**: L (initial suite covering signup → purchase → play →
  redeem).
- **Dependencies**: staging env (#5).
- **Acceptance**: CI runs Playwright on every PR against a
  preview-deploy URL; fails the build on regressions.

### 21. Internal RG wording cleanup

- **Why**: `players.rg_deposit_limit_*` uses the forbidden word.
- **Effort**: S.
- **Acceptance**: column renamed via migration; code references
  updated; tests pass.

---

## P2 — Ship within first quarter

### 22. Affiliate management portal

- **Why**: data + payouts work; affiliates have no self-serve.
- **Effort**: L.
- **Acceptance**: affiliate signup, per-affiliate dashboard, payout
  history, tax docs.

### 23. Tournament system

- **Why**: high-engagement growth lever.
- **Effort**: XL.
- **Acceptance**: leaderboards driven by `game_rounds`; admin UI for
  configuring; player UI for participation.

### 24. Player chat support (in-house, not Intercom)

- **Why**: own the player relationship; cost.
- **Effort**: XL.
- **Acceptance**: chat widget on player surface; admin agent inbox;
  routing to support role.

### 25. CMS markdown parser cleanup

- **Why**: duplication across three files.
- **Effort**: S.
- **Acceptance**: extracted to a leaf sub-package OR retained with
  comments + CI lint to keep in sync.

### 26. Welcome packages → cohort-based

- **Why**: binary first/not-first is limiting.
- **Effort**: M.
- **Acceptance**: package eligibility computed from `crm_segments` or
  a per-package eligibility predicate.

### 27. Tier reorder atomic single-update

- **Why**: simpler + faster.
- **Effort**: S.
- **Acceptance**: `DEFERRABLE INITIALLY DEFERRED` on the unique
  constraint; single `UPDATE … CASE` in one tx.

### 28. Accessibility audit

- **Why**: AA compliance reduces legal exposure + improves UX.
- **Effort**: M.
- **Acceptance**: AXE clean on all player + key admin pages.

### 29. Index of cron jobs in admin UI

- **Why**: ops would benefit from seeing job last-run + next-run.
- **Effort**: S.
- **Acceptance**: `/admin/integrity/jobs` shows every Inngest function
  with last success + next scheduled run + failure count.

---

## P3 — Future roadmap

- Internationalisation (en-CA, fr-CA likely first).
- Native mobile wrapper (Capacitor or thin native).
- Tournaments + jackpot mode (the operator has expressed interest +
  doubt; deferred).
- Crypto on-ramp / off-ramp (regulatory work first).
- Game studio aggregation beyond Alea.

---

## How to use this list

1. Pick the next P0/P1 item that aligns with your current sprint.
2. Read the relevant `HANDOFF/*.md` doc for context.
3. Read the docs/\* file the workstream maps to (use `00_index.md`).
4. Build, test (vitest + manual), deploy via the runbook.
5. Update this file to mark the item done.

---

## What to read next

- `13-known-gaps.md` — the broader gap list (context for these items).
- `12-deployment.md` — how shipping works.
- `runbooks/` — operational procedures.
