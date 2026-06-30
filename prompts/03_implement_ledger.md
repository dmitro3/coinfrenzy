# Prompt 03 — Implement the Ledger Module

Copy this entire file into Cursor's chat and hit enter. Prompts 01 and
02 must be complete.

---

You are continuing the CoinFrenzy build. This is the most critical
prompt in the entire sequence. Get this wrong and money goes missing.
Get it right and you have an audit-grade ledger that scales to 5M users.

Read these documents in full before starting. Re-read if you've started
a new session since prompt 02:
- `docs/04_ledger_and_wallet.md` (the entire doc — this is your spec)
- `docs/02_core_service_layer.md` §5-§7 (Context, Result, transactions)
- `docs/03_data_model.md` §3 (ledger_entries + house_accounts + admin_adjustments tables)

Re-read `.cursorrules`.

## Your task

Implement the ledger module at `packages/core/src/ledger/`. This is the
single entry point for every coin movement in the platform.

## Specific requirements

1. **The core `write()` function** per docs/04 §4:
   - Lives at `packages/core/src/ledger/write.ts`
   - Signature exactly matches docs/04 §4 (Context + TransactionSpec → Result)
   - Uses `serializable` isolation
   - Implements all 8 steps from docs/04 §4:
     1. Open serializable transaction
     2. Dedupe check via `(source, source_id)` unique constraint
     3. Validate balanced per currency
     4. Insert all entries atomically
     5. Update wallet balances in same transaction
     6. Set balance_after on player_wallet entries
     7. Schedule Redis cache invalidation via afterCommit hook
     8. Return Result with status

2. **The 12 transaction-type builders** per docs/04 §3:
   - One file per type at `packages/core/src/ledger/transactions/`:
     - `purchase.ts` — builds the 6-entry purchase pattern (§3.1)
     - `bet.ts` — builds the 2-entry bet pattern (§3.2)
     - `win.ts` — builds the 2-entry win pattern (§3.3)
     - `bonus-award.ts` — builds the bonus award pattern (§3.4)
     - `playthrough-release.ts` — builds the sub-bucket reclassification (§3.5)
     - `redemption-request.ts` — drains player wallet to pending_redemption (§3.6)
     - `redemption-paid.ts` — settles the redemption (§3.8)
     - `redemption-rejected.ts` — returns SC to wallet (§3.9)
     - `purchase-refund.ts` — clawback on chargeback (§3.10)
     - `admin-adjustment.ts` — manual coin grant/clawback (§3.11)
     - `affiliate-payout.ts` — affiliate Lightning Bolt (§3.12)
   - Each file exports a function that takes a typed input and returns
     a `TransactionSpec` ready to pass to `ledger.write()`
   - DO NOT compress these into one file. Separate files make audits
     possible and reasoning local.

3. **The balance reader** per docs/04 §6:
   - `packages/core/src/ledger/balance.ts`
   - `getBalance(ctx, playerId, currency)` with Redis cache fall-through
   - `getSubBucketBreakdown(ctx, playerId, currency)` returning the
     purchased/earned/promo/bonus split
   - `getRedeemableBalance(ctx, playerId)` returning purchased+earned only

4. **The reconciliation jobs** per docs/04 §7:
   - `apps/worker/src/jobs/reconcile-wallets.ts` — nightly, 30-day window
   - `apps/worker/src/jobs/reconcile-wallets-full.ts` — monthly, all-time
   - The Alea reconciliation job per §7.2 should be a placeholder for
     prompt 06 (when Alea integration is built)
   - Both wire up to Inngest cron schedule

5. **The drain order logic** per docs/04 §3.2 / docs/06 §10:
   - `packages/core/src/ledger/drain-order.ts`
   - Implements: purchased → earned → promo → bonus
   - Returns a drain plan that the bet handler uses

6. **The `withActor` helper** is already in `packages/db/src/client.ts`
   from prompt 02. Use it in every ledger.write() call so RLS policies
   pick up the actor context.

7. **Property-based tests** per docs/04 §10.1:
   - `packages/core/src/ledger/__tests__/properties.test.ts`
   - Three invariants from §10.1:
     1. Every transaction balances per currency
     2. Writing the same spec twice produces one transaction (idempotency)
     3. Wallet balance always equals ledger sum after any write sequence
   - Use `fast-check` (already installed)
   - Use Testcontainers to spin up a real Postgres for each test run

8. **The retry helper** per docs/04 §8.2:
   - `packages/core/src/ledger/write-with-retry.ts`
   - Wraps `write()` with jittered backoff on serialization_failure errors
   - Max 3 retries

## Constraints

- Money is `bigint` at the app layer. NEVER `number`/`float`. Drizzle's
  bigint mode handles the boundary.
- Every function follows the Context pattern from docs/02 §6
- Every function returns a `Result<T, E>` per docs/02
- Use the exact account_kind values from docs/04 §2
- The `pair_id` mechanism: bet and win for the same round MUST share a
  pair_id. Each purchase generates 6 entries with one pair_id. Each
  redemption flow has multiple states; each writes its own pair_id.
- Idempotency keys: the `(source, source_id)` unique constraint is the
  enforcement. Your handlers don't need to check first — the database
  rejects duplicates. Handle the rejection by returning `{ status: 'duplicate' }`.

## Verification

After implementation:
1. `pnpm typecheck` passes
2. `pnpm lint` passes
3. `pnpm test packages/core/src/ledger` runs and all property tests pass
4. Manual smoke test (write a script that does it):
   - Create a test player + wallet via raw Drizzle
   - Call `ledger.write` with a bet spec
   - Verify wallet balance decreased by the bet amount
   - Verify a ledger entry exists with `source='bet'`
   - Call `ledger.write` with the EXACT same spec again
   - Verify it returns `{ status: 'duplicate' }` and no new entries were created
   - Verify wallet balance is unchanged after the duplicate

## When done

End with the standard "Done" report. Specifically include:
- Test results — should be: ~50+ property test executions, all passing
- The output of the manual smoke test showing idempotency working
- Confirmation that `getBalance` returns under 10ms when cached

Tell the user to message Claude with the report. Claude will verify the
ledger is correct. This is the most important verification gate in the
entire build — if any property test fails or the smoke test shows a
wrong number, STOP and report to Claude. Do not proceed to prompt 04.
