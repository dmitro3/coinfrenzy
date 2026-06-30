# Prompt 08 — Build the Redemption Flow

Continuing the build. Read:
- `docs/07_redemption_and_kyc.md` (the entire doc)
- `docs/04_ledger_and_wallet.md` §3.6-§3.9 (redemption ledger transactions)

Re-read `.cursorrules`.

## Your task

Build the redemption flow end-to-end: player initiates, eligibility
checks, KYC integration with Footprint, cashier review queue, Finix ACH
push, AML hold flow, status updates.

## Specific requirements

1. **The eligibility checker** per docs/07 §4:
   - `packages/core/src/redemption/eligibility.ts`
   - All checks: jurisdiction, KYC level, compliance flags, balance,
     amount range, daily/weekly caps, payment instrument

2. **Create redemption** per docs/07 §5:
   - `packages/core/src/redemption/create.ts`
   - Computes drain plan
   - Locks SC in pending_redemption account
   - Routes to auto-approval or pending_review

3. **Auto-approval rules** per docs/07 §5.1

4. **KYC start flow** per docs/07 §6:
   - `packages/core/src/kyc/start-onboarding.ts`
   - Creates Footprint session token via adapter (built in prompt 06)
   - Frontend page wired to launch Footprint SDK

5. **Validation token exchange** per docs/07 §6.3:
   - API at `apps/web/app/api/player/kyc/complete/route.ts`
   - Updates `kyc_status` and `players.kyc_level`
   - Auto-progresses any kyc_pending redemptions

6. **The cashier review queue UI** per docs/08 §7:
   - Split view in admin: list on left, detail panel on right
   - Approve / Reject / Escalate actions
   - SLA timer
   - Bulk approve for low-risk small redemptions

7. **Approve / Reject handlers** per docs/07 §7.1-§7.2:
   - With role-based threshold enforcement
   - Audit log entries
   - Player notifications

8. **AML hold flow** per docs/07 §7.3:
   - Manager-only queue in admin
   - Clear / Confirm Hold / Escalate actions

9. **Finix submission** per docs/07 §8:
   - Inngest function triggered on `approved` status
   - Calls Finix PUSH_TO_ACH
   - Updates redemption to `awaiting_webhook`
   - Webhook handler from prompt 06 closes the loop

10. **APT Debit fallback** per docs/07 §9:
    - Stub for v1 (real APT integration when user provides credentials)

11. **Tax report generation cron** per docs/07 §10:
    - Annual Jan 15 cron job
    - Identifies players with > $600 lifetime redemptions
    - Creates `tax_reports` rows for Master admin to act on

12. **Player redemption UI** per docs/10 §4.2:
    - `/cashier/redeem` page with sub-bucket display
    - Method picker
    - Submission flow
    - Status display

## Verification

1. All checks pass
2. Manual test:
   - Player without KYC tries to redeem → blocked with prompt to start KYC
   - Complete Footprint sandbox KYC → player.kyc_level updated to 2
   - Player requests $20 redemption → auto-approved (small + low risk) →
     submitted to Finix sandbox → webhook fires → status `paid`
   - Player requests $5000 redemption → goes to cashier queue → cashier
     approves → Finix submission → webhook → `paid`
   - Simulate Footprint watchlist event for a player → AML hold triggers
     → manager clears in admin UI → redemption auto-resumes

## When done

Standard report. Claude will verify before prompt 09.
