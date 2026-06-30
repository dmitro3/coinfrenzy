# 13 · Known Gaps

This is the honest list of what is NOT done as of handoff. Read it
before promising a timeline. Grouped by category. Severity tags:

- **P0** — blocker for production launch.
- **P1** — should ship within the first month of launch.
- **P2** — nice-to-have, ship within first quarter.
- **P3** — future roadmap / not committed.

Cross-reference with `14-recommended-next-work.md` for prioritised
action items.

---

## Integration stubs

### 1099-MISC PDF generation [P0]

- Status: **vendor not yet selected** (Track1099 vs TaxBandits).
- What's built: the data (per-player, per-year YTD rollups via
  `annual-tax-rollup.ts` and `redemption/tax-rollup.ts`), the admin UI
  (`/admin/reports/tax`, per-player YTD on the player detail).
- What's missing: PDF rendering + filing endpoint. The integration
  adapter stub is in `packages/core/src/adapters/` — needs to be
  created once the vendor is picked.
- Deadline: Jan 31 following any year with > $600 in redemptions per
  payee.

### Live payment provider credentials [P0]

- Finix sandbox is wired. **Live Finix needs a signed contract +
  credentials** in Doppler before the `USE_MOCK_FINIX=false` flip can
  happen.
- Same for Alea live credentials (we have sandbox).

### Intercom live chat [P2]

- `/live-support` is built as a placeholder.
- `INTERCOM_ACCESS_TOKEN` env var exists.
- Widget script not yet embedded. Needs an Intercom account + token.

### EasyScam (AMOE) [P1]

- Mock is wired; the poller exists.
- Live integration needs credentials + a smoke test with a real
  postal/email entry.

### Phoenix (or equivalent) debit-push [P0]

- The Finix Transfer call covers ACH; for instant-debit redemption
  we'll likely route through APT Debit / Phoenix's rails. The Finix
  adapter has the call shape but the operator needs to confirm the
  partner integration.

---

## Feature gaps (built-but-not-finished)

### Notification Center one-off compose [P1]

- Email Center is fully built; Notification Center has CRUD + log but
  the compose dialog mirroring Email Center's polish is still on the
  to-do (see report 2026-05-19 §8).
- Pattern is identical; ~2 hours of work.

### Suppression list management UI [P1]

- `/admin/email-center/suppression` and `/admin/crm/suppression` exist;
  but the ops surface for **viewing + removing** entries from the
  suppression list could be richer (today it's webhook-write only on
  some paths). See report 2026-05-19 §8.

### Permissions consolidation [P1]

- Several routes still open-code `role === 'marketing' ||
hasAtLeast(role, 'manager')` despite the named helpers now existing.
- See report 2026-05-19 §4.1 — list of opportunities.

### Tier safety caps hardcoded [P1]

- `TIER_CAPS` in `packages/core/src/tiers/admin.ts` is a constant.
- Decision pending: live in `system_config` (operator-tunable) or stay
  in code with a deploy.
- Report 2026-05-19 §4.2.

### Email body storage [P1]

- `crm_message_log.body_preview` stores first 200 chars only.
- Decision pending: full HTML in row (huge), R2 reference, or
  on-demand re-render from template + captured player context.
- Report 2026-05-19 §4.5.

### CMS markdown parser duplicated [P2]

- Three copies of the ~50-line parser (canonical core + admin client
  renderer + public renderer).
- Decision pending: split into a leaf package or accept duplication.
- Report 2026-05-19 §4.3.

### Welcome packages are binary [P2]

- "Before first purchase → welcome only, after first purchase →
  standard only" is the rule today.
- Cohort-based welcomes (second-purchase booster, A/B different
  welcomes) would require a `cohort_eligibility` field rather than a
  binary flag.
- Report 2026-05-19 §4.7.

### Tier reorder requires double-renumber [P2]

- The atomic two-step bump-then-assign works but is awkward.
- `DEFERRABLE INITIALLY DEFERRED` on the unique constraint would let
  us do a single `UPDATE ... CASE` inside one transaction. Worth a
  migration if reorder gets hot.
- Report 2026-05-19 §4.8.

### Affiliate management [P2]

- `affiliates` table exists; attribution columns on `players` exist;
  payouts via ledger `affiliate_payout` source exist.
- No affiliate-facing portal or per-affiliate report yet.

### Tournament system [P2]

- Not built. Currently outside the v1 scope. A "feature win" race or
  "biggest hit this week" leaderboard would be a high-engagement v2
  add.

### Player-side live support / chat [P2]

- Intercom hook only. No first-party chat fallback.

### Affiliate self-serve dashboard [P3]

- See above; affiliate portal needs design + build.

---

## Performance gaps

### Partition-key WHERE on `crm_message_log.getMessage` [P1]

- The `getMessage(id)` call doesn't include `createdAt` in the WHERE,
  so Postgres can't prune partitions. Plans across all partitions.
- Works today; will get slow as partitions accumulate.
- Fix: pass `createdAt` (already on every list row) through to the
  call. Report 2026-05-19 §4.4.

### Partition pruning crons [P1]

- Old partitions on `player_events` and `crm_message_log` are not
  automatically dropped. Manual procedure exists (`DROP TABLE
player_events_2024_01 …`) but should be a cron.

### Realtime fan-out load test [P1]

- Pusher fan-out hasn't been load-tested with the projected concurrent
  player count. Probably fine; verify before launch.

### Index audit [P2]

- Several `WHERE` patterns added in the last hardening pass might
  benefit from new partial indexes. `pnpm -F @coinfrenzy/db db:verify`
  is the entry point; expand the linter.

---

## Compliance gaps

### Pen-test [P0]

- Not yet done. **Strongly recommended before launch.** External firm
  - scoped test of player + admin + webhook surfaces.

### CSP header [P1]

- `vercel.json` sets HSTS + frame + content-type headers but no
  Content-Security-Policy.
- A strict CSP with iframe allowlist for Alea + Finix domains is
  recommended before launch.

### "Deposit" wording in RG column names [P2]

- `players.rg_deposit_limit_*` columns still use the legal-forbidden
  word "deposit" internally.
- Rename via migration + code sweep. Surfaces as "purchase limit" in
  UI today, so customer-facing copy is correct, but internal
  consistency matters for new engineers.

### Data retention crons [P2]

- Retention policy is documented in `15-security-and-compliance.md`.
- Pruners for `player_events` and `crm_message_log` older than
  threshold are **not implemented**.

### SOC 2 / PCI [P3]

- Out of scope for v1. Finix Hosted Fields keeps us out of PCI scope.
- SOC 2 would require external audit + ~6 months of evidence
  collection.

---

## Test coverage gaps

| Area                       | Today                                    | Goal                                                          |
| -------------------------- | ---------------------------------------- | ------------------------------------------------------------- |
| `packages/core/ledger`     | Heavy (~1,900 fast-check cases)          | maintain                                                      |
| `packages/core/bonus`      | Good                                     | maintain                                                      |
| `packages/core/redemption` | Decent                                   | add property tests for the auto-approve engine                |
| `packages/core/crm`        | Compiler well-covered; flow runner light | add flow integration tests                                    |
| `packages/core/vip`        | Some                                     | add 5-layer-defense test                                      |
| `packages/core/auth`       | Light                                    | add session HMAC / replay tests                               |
| `apps/web` (E2E)           | 0                                        | Playwright suite for player signup → purchase → play → redeem |
| `apps/worker`              | 0 unit                                   | wire vitest                                                   |

E2E is the biggest gap. There is no Playwright suite. The pattern is
documented but the suite hasn't been written.

---

## URL / route inconsistencies [P3]

A few admin / player URL pairs grew side-by-side during the build and
should be consolidated when someone is in the area. None affect
functionality — they're all reachable, all rendered correctly. They just
make navigation confusing for someone learning the codebase.

- `/admin/vip` (the host-team workspace — assignments, hosts, all-vips)
  vs `/admin/vips` (a separate VIP list view, with `[playerId]` detail).
  Two real surfaces with different intents but a confusing singular /
  plural URL split. Suggested fix: fold `/admin/vips` into
  `/admin/vip/list` and 301 the old URL.
- `/admin/promo-codes/block-list` (a 4-line redirect to
  `/admin/promo-codes/restrictions`, kept for Gamma URL parity) vs
  `/admin/promocode-blocking` (a separate per-player promo blocklist).
  The two share a topic but have inconsistent URL convention. Suggested
  fix: rename the second to `/admin/promo-codes/blocked-players` and
  redirect the old path.
- Player-side `/games` (catalog list) vs `/casino-games` (category-tab
  redesign). Both real, both linked from different parts of the UI. Pick
  the canonical one and redirect the other.

These were left in place at handoff because the safe rename touches
roughly 30 link references each and is the kind of cleanup the new team
should own once they're comfortable in the codebase.

---

## UX polish pending

Several items from `docs/ux-polish-audit.md` are still open:

- Big-win celebration sequencing on mobile (slight jitter).
- Lobby skeleton states (currently shows blank then pops).
- Form error animations (use existing motion-primitives more
  consistently).
- A few inconsistent dialog footer paddings in admin.

The doc has the full list with code paths.

---

## Mobile responsive gaps

- Admin is **desktop-first**. Mobile admin is usable for the dashboard
  and a few key list pages, but most CRUD forms are not adapted. The
  operator expectation is that admins use desktop.
- Player UI is fully mobile-first; remaining mobile issues are minor
  polish (see UX polish above).

---

## Accessibility

- No formal AXE audit done. The shadcn primitives are accessible by
  default; custom components likely have AA issues.
- Recommend an audit pass before launch.

---

## i18n / localization

- **Not built**. en-US only.
- Adding i18n would be `next-intl` or `next-i18next`; modest effort.
- Outside v1 scope.

---

## Operational gaps

### No separate staging environment [P0]

- Today preview ≈ staging. Recommended: a dedicated Neon branch +
  Vercel project + Fly app for staging so we can dry-run migrations
  and load tests without touching prod.

### Backup verification [P1]

- Neon does PITR + daily backups automatically. We have not run a
  restore drill. Recommend a quarterly restore drill.

### Disaster recovery runbook [P1]

- `runbooks/incident_response.md` covers application-level incidents.
- A separate DR runbook for Neon outage / region failover doesn't
  exist.

### CI on draft PRs [P3]

- CI runs on every PR by default; consider skipping draft PRs to save
  minutes.

---

## Documentation gaps in this folder

- A few code paths referenced here are summaries; the dev firm may
  find a slight mismatch as they go deeper. Each doc footer points at
  the source files — please use those as the ground truth, and update
  the docs when you find drift.

---

## What to read next

- `14-recommended-next-work.md` — these gaps with effort estimates +
  priorities.
- `16-testing.md` — current test surface.
- `docs/_reports/2026-05-19_admin_backoffice_pass.md` — the latest
  session report.
