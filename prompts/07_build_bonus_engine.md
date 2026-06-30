# Prompt 07 — Build the Bonus Engine

Copy this entire file into Cursor's chat and hit enter. Prompts 01-06
must be complete.

---

Continuing the CoinFrenzy build. Read:
- `docs/06_bonus_engine_playthrough.md` (the entire doc)
- `docs/04_ledger_and_wallet.md` §3.4, §3.5 (bonus award and playthrough release ledger transactions)
- `docs/03_data_model.md` §5 (bonus tables)

Re-read `.cursorrules`.

## Your task

Implement the variable-playthrough bonus engine. This is the
product-differentiating feature versus Gamma.

## Specific requirements

1. **The award path** at `packages/core/src/bonus/engine.ts` per docs/06 §4:
   - The 10-step `award(ctx, spec)` function
   - All eligibility checks
   - Idempotency via (source_kind, source_id)
   - Config snapshotting at award time
   - Ledger writes via prompt 03's ledger module

2. **Award amount computation** per docs/06 §5:
   - `packages/core/src/bonus/compute-amount.ts`
   - All formula types (pct_of_purchase, tier_match, tier_pct_of_purchase, fixed_with_streak_multiplier)

3. **The bet handler** per docs/06 §6:
   - `packages/core/src/bonus/playthrough.ts`
   - `recordBet(ctx, spec)` — called from prompt 06's Alea round.bet handler
   - Per-bonus contribution with min/max bet checks
   - Game weight computation per docs/06 §7
   - Auto-release on playthrough completion per docs/06 §8

4. **Game weight computation** per docs/06 §7

5. **Playthrough release transaction** per docs/06 §8 / docs/04 §3.5

6. **The expiry job** per docs/06 §9:
   - `apps/worker/src/jobs/expire-bonuses.ts` — hourly cron

7. **The 14 trigger locations** per docs/06 §13:
   - Wire each trigger to call `bonusEngine.award()` with appropriate context
   - For `welcome`: in the purchase webhook handler after first successful purchase
   - For `tier_up`: in the tier progression module
   - For `weekly_tier` / `monthly_tier`: in cron jobs
   - For `package`: in the purchase handler if `packages.bonus_id` is set
   - For `daily`: in the player login handler
   - For `jackpot`: in the Alea win handler when amount > threshold
   - For `referral`: in the affiliate referral module (stub for now — full affiliate work later)
   - For `affiliate`: in the affiliate payout cron job
   - For `promotion`: triggered manually via admin UI
   - For `amoe`: in the EasyScam poll handler (replaces stub from prompt 06)
   - For `admin_added_sc`: manual admin adjustment from admin UI
   - For `crm_promocode` / `purchase_promocode`: in the promo code redeem path

8. **Promo code redemption** per docs/06 §12:
   - `packages/core/src/bonus/redeem-promo.ts`
   - All validity checks
   - Variable playthrough via promo-specific overrides
   - Connect to the player UI: promo code field in the purchase flow

9. **Admin bonus management UI**:
   - Build out the Bonus section pages from prompt 04 stubs per docs/08 §8
   - Bonus templates CRUD with the variable-playthrough config form
   - Active bonuses list
   - Playthrough tracking per player
   - Manual award form

10. **Player bonus display**:
    - Wire up the `/bonuses` page from prompt 05 to show active bonuses
    - Per-bonus playthrough progress bar
    - Expiry countdown
    - Terms link

11. **Anti-abuse mechanisms** per docs/06 §15:
    - Min-bet enforcement
    - Max-bet flagging
    - Game-weight overrides

12. **Tests**:
    - Unit tests for the playthrough math (with fast-check)
    - Integration test for the full flow: award bonus → simulate bets →
      verify playthrough completion → verify release transaction

## Verification

1. `pnpm typecheck`, `pnpm lint`, `pnpm test` all pass
2. Manual test:
   - Sign up new player (welcome bonus auto-awarded with 3x playthrough)
   - Simulate bets via Alea sandbox until playthrough complete
   - Verify SC moved from `balance_bonus` to `balance_earned`
   - Verify redemption is now possible against the formerly-bonus SC
   - Create a custom bonus template with 1x playthrough + 7-day window
   - Manually award it from admin
   - Verify it expires correctly after 7 days

## When done

Standard report. The bonus engine is the second-most-critical module
after the ledger. Claude will verify thoroughly before approving prompt 08.
