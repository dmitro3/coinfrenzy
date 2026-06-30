# Pre-Launch Blockers & Production Hardening Checklist

## Context

This list came from a code audit before handoff. The platform is
architecturally sound (ledger discipline, auth design, webhook patterns
all verified strong). These items are production-hardening gaps that the
incoming team should own, since they require real vendor credentials,
production infrastructure, and long-term money-correctness accountability.

---

## P0 — Must fix before processing real money

### 1. Redemption endpoint request idempotency

- **File**: `apps/web/app/api/player/redemptions/route.ts`
- **Issue**: No request-level idempotency key persisted. Double-submit or
  retry can create duplicate redemption requests = double payout risk.
- **Fix**: Persist an idempotency key per redemption request, return
  existing on conflict.
- **Risk if unfixed**: Financial loss from duplicate payouts.

### 2. RLS enforcement at runtime

- **Issue**: RLS policies are defined in schema but reportedly bypassed at
  runtime (app may connect as a role that bypasses RLS).
- **Fix**: Verify the application DB connection respects RLS. Confirm the
  app role is NOT a superuser/bypass role. Test that a host genuinely
  cannot query another host's data at the DB level.
- **Risk if unfixed**: Host could potentially access other hosts' VIP
  data; security boundary is weaker than designed.

### 3. Idempotency index includes `created_at`

- **Issue**: Ledger idempotency unique constraint reportedly includes
  `created_at`, which would allow the same `(source, sourceId)` at
  different timestamps to bypass duplicate detection.
- **Fix**: Verify the idempotency unique index is on
  `(source, sourceId)` ONLY, not including `created_at`.
- **Risk if unfixed**: Duplicate ledger writes = balance corruption.

### 4. Hot-path money writes skip safety wrappers

- **Issue**: Some money-write paths reportedly skip `writeWithRetry` and
  insufficient-balance checks.
- **Fix**: Audit EVERY ledger write path. Ensure all go through
  `core.ledger.write()` with retry + balance validation.
- **Risk if unfixed**: Lost writes under contention, or negative balances.

---

## P1 — Must fix before public launch

### 5. SendGrid webhook verification (HMAC → ECDSA)

- **File**: `packages/core/src/adapters/sendgrid/verify-webhook.ts`
- **Issue**: Uses shared-secret HMAC; SendGrid production spec requires
  ECDSA public-key signature verification (per
  `docs/05_webhooks.md`).
- **Fix**: Implement ECDSA verification against SendGrid public key.
  Decision needed: dual-mode (ECDSA + legacy HMAC) transition, or
  strict ECDSA cutover.
- **Requires**: Real SendGrid account + signing key.

### 6. Reconciliation false-drift bug

- **File**: `apps/worker/src/jobs/reconcile-wallets.ts`
- **Issue**: Compares a 30-day ledger slice against full all-time wallet
  balance — will always show false drift for players older than 30 days.
- **Fix**: Either compare full ledger history to balance, or compare
  30-day ledger delta to 30-day balance delta. Pick the correct
  reconciliation window.
- **Risk if unfixed**: Drift alerts are pure noise, real drift gets
  missed.

### 7. Reconciliation drift doesn't page

- **File**: `apps/worker/src/jobs/reconcile-wallets.ts`
- **Issue**: Detects drift but only logs, doesn't page PagerDuty.
- **Fix**: Wire PagerDuty alert on confirmed drift (after fixing #6 so
  alerts are real).
- **Requires**: PagerDuty account + integration key.

### 8. CI does not gate deploys

- **Issue**: Tests exist (246 passing) but don't block bad deploys.
- **Fix**: Add CI workflow that runs typecheck + lint + test on PR and
  blocks merge to main on failure.

### 9. Missing doc-09 security controls

- **Issue**: Rate limits, CSP headers, two-person approval flows, full
  role union partially implemented or missing.
- **Fix**: Complete the controls specified in `docs/09`. Prioritize rate
  limiting on auth + money endpoints, CSP headers, two-person approval
  for large redemptions.

---

## P2 — Must fix before scaling past single instance

### 10. Redis is in-memory only

- **File**: `packages/core/src/ledger/redis.ts`
- **Issue**: Balance cache is in-memory; won't work across multiple
  server instances.
- **Fix**: Wire Upstash Redis for shared balance cache.
- **Requires**: Upstash Redis account. Only matters at multi-instance
  scale.

### 11. Ledger partition auto-provisioning

- **Issue**: If `ledger_entries` is date-partitioned, next partition
  isn't auto-created.
- **Fix**: Add a scheduled job to provision upcoming partitions ahead
  of need.
- Only matters at high write volume.

### 12. Inngest dispatch failures are silent + no stuck-webhook recovery

- **Issue**: Failed Inngest dispatches fail silently; no job to recover
  stuck webhooks.
- **Fix**: Add error handling + alerting on dispatch failures + a
  recovery job for stuck webhooks.

---

## Already fixed during audit (do not redo)

- Race condition in pending bonus claims
  (`packages/core/src/bonus/claim-pending.ts`)
- Twilio client fails fast on missing config
- SendGrid client fails fast on missing config

---

## Integration testing note

The full test suite requires Docker + `TEST_DATABASE_URL`. The incoming
team should run the complete integration + property suite in CI to
validate scale-path behavior. 246 unit tests pass; integration tests
were skipped in the audit environment.

---

## Verdict from audit

- **Dev handoff readiness**: YES — structure is strong, consistent with
  docs.
- **3rd-party wiring**: Mostly ready, SendGrid webhook is the gap.
- **Scale (tens of thousands of players)**: Architecturally yes,
  operationally needs Redis + PagerDuty + idempotency + test-env
  closure.
