# Cutover Night Runbook

The night you move from Gamma to the new platform.

This document is the literal checklist your team follows. Print it out.
Have it on the wall.

---

## Before cutover night

This is NOT the first time. By cutover night you've done at least 3 full
rehearsals on staging. You've given Gamma 30 days notice. Dual-webhook
capture has been running for 30 days.

Cutover-night team:
- **Captain** (the founder) — final call authority
- **Engineer 1** — runs the import + DNS scripts
- **Engineer 2** — runs the smoke tests + monitors
- **Cashier on-call** — answers support tickets in real-time
- **Claude consultant** — available on chat for architecture questions

Set a 4-hour maintenance window. Communicate to players 7 days, 24 hours,
1 hour in advance.

---

## T-7 days

- [ ] Final dry-run import passes all validations
- [ ] DNS TTL lowered to 60 seconds (from default 3600) — allow 1 day for propagation
- [ ] Maintenance window announced on status page + email + SMS
- [ ] Hot-standby Vercel deployment confirmed green
- [ ] All on-call team confirmed availability
- [ ] War room Slack channel created: `#cutover-YYYY-MM-DD`
- [ ] Rollback plan reviewed by team

## T-24 hours

- [ ] Final daily Gamma snapshot pulled successfully
- [ ] Webhook capture confirmed working (check `pending_webhooks` count)
- [ ] All integration health green
- [ ] Status page set to "Scheduled maintenance" with countdown
- [ ] Smoke test list (20 random players) prepared
- [ ] PagerDuty on-call shift confirmed
- [ ] Rollback plan re-confirmed

## T-1 hour

- [ ] Team in war room
- [ ] Final email/SMS to players: "maintenance starts in 1 hour"
- [ ] All laptops, credentials ready
- [ ] Snack break

## T-0 — CUTOVER BEGINS

```
T+0:00   Set Gamma to maintenance mode (Gamma admin)
         → all player writes now blocked on Gamma

T+0:05   Pull final Gamma snapshot
         → Engineer 1 runs the pull script
         → Verify all expected CSVs present in R2

T+0:15   Begin import on production Neon
         → Engineer 1 runs import script
         → Captain monitors progress in admin UI

T+0:45   Import complete
         → Verify final row counts match expected

T+1:00   Run all hard validations
         → If any fail: STOP. Convene team. Decide rollback vs fix.
         → If all pass: continue

T+1:15   Spot-check 20 random players
         → Engineer 2 logs into admin
         → Opens 20 random players from the test list
         → Verifies balance + history matches Gamma
         → If any wrong: STOP. Convene team.

T+1:30   Replay captured webhooks
         → Engineer 1 runs replay tool for the snapshot→now window
         → Verify all replays process successfully

T+1:45   Run reconciliation again
         → Wallet sum = ledger sum for every wallet
         → If any drift: STOP.

T+2:00   DNS FLIP
         → Captain initiates DNS change
         → coinfrenzy.com → new Vercel deployment
         → admin.coinfrenzy.com → new Vercel deployment

T+2:05   Smoke test
         → Engineer 2 runs the checklist (next section)
         → If ANY fails: ROLLBACK

T+2:15   Open to 10% of traffic
         → Cloudflare traffic ramp at 10%
         → Monitor error rate for 5 min
         → If error rate > 0.5%: pause ramp, investigate

T+2:30   Ramp to 50%
T+2:45   Ramp to 100%
T+3:00   Full traffic; monitor for 1 hour
T+4:00   Maintenance window officially ends
         → Status page: "Resolved"
         → War room stays staffed for 4 more hours
         → On-call rotation begins
```

---

## Smoke test checklist (T+2:05)

Engineer 2 runs through this in order. Every item MUST pass.

- [ ] Test player can log in (use a known test account)
- [ ] Balance displays correctly (matches expected)
- [ ] Purchase history displays correctly
- [ ] Redemption history displays correctly
- [ ] Game lobby loads
- [ ] Test player launches a game (Alea sandbox)
- [ ] Test player places a 1 SC bet
- [ ] Bet writes ledger entries (verified in admin)
- [ ] Wallet decremented correctly
- [ ] Admin login works (2FA prompt)
- [ ] Admin can search players
- [ ] Admin dashboard shows real-time numbers
- [ ] Pending redemption queue displays
- [ ] CRM dashboard loads
- [ ] Self-excluded test player can NOT log in (test with one known to be excluded)
- [ ] Footprint webhook arrives (trigger a test via Footprint dashboard)
- [ ] Finix webhook arrives (trigger a test transaction)
- [ ] Integrity page shows all green

If any item fails: **ABORT**. Engineer 1 initiates rollback.

---

## Rollback plan

If anything fails between T+0 and T+2:45:

```
1. Captain: "Rollback initiated"
2. Engineer 1: DNS flip back to Gamma
   → 60s TTL means recovery in ~60 seconds
3. Captain: Gamma maintenance mode lifted
4. Captain: post on status page "Cutover postponed, restoring service"
5. War room stays in session for post-mortem
6. Schedule new cutover window for 7+ days out
```

After T+2:45 (50% traffic ramped), partial rollback is harder. Decision
becomes: complete the cutover and fix issues in place, OR full rollback
with potential data loss (any plays on the new platform are lost on
rollback).

---

## What success looks like

- T+4:00: maintenance window ended
- 100% traffic on new platform
- Error rate < 0.5%
- No SEV-1 incidents
- Admin team logged in and functional
- Players logging in and playing
- Test redemption end-to-end works

If you're here: open champagne. You replaced Gamma.

---

## After cutover

Per Doc 13 §8:

**First 24 hours**: all hands. Hourly reconciliation. PagerDuty SEV-1 for any anomaly.

**First week**: daily reconciliation against Gamma's last-known totals. Daily VIP check. Performance monitoring.

**First month**: full audit log review. Player retention analysis. Optimove cancellation. Gamma data archive.

**Long-term**: regular operations per the deploy + incident response runbooks.

---

## Final note

You built something here. The platform handles money, real people, real
regulations. Take this seriously. Sleep before cutover night. Don't try
to be a hero — call for help when you need it. Most of all: have the
docs open. Everything you need is in them.
