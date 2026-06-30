# Prompt 11 — Build the Gamma Migration Pipeline

Continuing. Read:
- `docs/13_migration_from_gamma.md` (the entire doc)

## Your task

Build the import pipeline that brings Gamma's data into our system.
Test it 3+ times on staging with real snapshots BEFORE giving Gamma
their 30-day notice.

## Specific requirements

1. **Gamma snapshot fetcher**:
   - Worker job `apps/worker/src/jobs/pull-gamma-snapshot.ts`
   - Runs daily
   - Downloads all available exports from Gamma admin (the user must
     provide their Gamma admin credentials in Doppler: GAMMA_USERNAME,
     GAMMA_PASSWORD)
   - For v1, this can be a manual upload to R2 if Gamma's admin doesn't
     allow API access; ask the user

2. **R2 storage of snapshots** per docs/13 §3.1:
   - `gamma-snapshots/YYYY-MM-DD/{file}.csv`

3. **The import pipeline** per docs/13 §3:
   - `packages/core/src/migration/import.ts`
   - Reads from R2
   - Uses `migration_column_mappings` table for translations
   - All transforms from docs/13 §3.2
   - Strict order of operations per docs/13 §3.4

4. **The rsg freetext parser** per docs/13 §4.3:
   - `packages/core/src/migration/transforms/rsg.ts`

5. **Synthetic migration bonus** per docs/13 §4.5

6. **Validation gates** per docs/13 §5.1:
   - All 7 hard checks
   - Hard fail on any drift

7. **The replay tool** per docs/05 §10:
   - For replaying captured webhooks during cutover

8. **Dual-webhook capture setup** per docs/13 §6.1:
   - Configure Finix/Footprint/Alea to fire to both Gamma and us in T-30 window
   - Captured events stored in `pending_webhooks` with status='received' (not processed)

9. **Migration admin UI**:
   - `/admin/migration` page (Master only)
   - View latest snapshot stats
   - Trigger dry-run import to staging
   - View validation results
   - View import history
   - Replay captured webhooks for a window

## Verification

1. All checks pass
2. Manual test:
   - Drop today's Gamma CSV exports into R2 manually
   - Trigger import on staging
   - Wait for completion (target: < 30 min for current data size)
   - Run all hard validations → all pass
   - Spot check 20 random players in admin → balances match Gamma exactly
   - Run import again → verify idempotency (no doubled data)

## When done

Standard report. The user should run this on 3+ different days' snapshots
before giving Gamma notice. Each run should pass all validations cleanly.
