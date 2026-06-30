# Incident Response Runbook

When something is on fire. Read in calm times. Reference under pressure.

---

## Severity classification

| Severity | Examples | Response time | Channel |
| --- | --- | --- | --- |
| **SEV-1** | Site down, money at risk, suspected breach, ledger drift | 15 min | PagerDuty |
| **SEV-2** | Feature broken, integration down, audit gap | 1 hour | Slack `#ops-alerts` |
| **SEV-3** | Bug affecting some users, recoverable | 1 business day | Jira ticket |

---

## SEV-1 immediate actions

When PagerDuty pages you:

1. **Acknowledge** the page within 5 minutes (resets the escalation timer)
2. **Open the war room** in Slack: `#incident-<date>-<short-name>`
3. **Page Claude** by messaging the architecture chat (the founder relays)
4. **Status page**: post "Investigating" within 15 min
5. **Investigate** using the relevant runbook below

---

## The 8 SEV-1 runbooks

### 1. Wallet ledger drift detected

**Symptom**: PagerDuty fires "Wallet ledger drift detected" with a count
of drifted wallets.

**First actions**:
1. Run: `SELECT * FROM wallet_drift_view` (created during nightly reconciliation)
2. Get the list of affected wallets + the drift amount per wallet
3. STOP all admin adjustments via the kill switch: `SET app.admin_adjustments_disabled=true`

**Investigation**:
1. For each affected wallet, pull the ledger:
   ```sql
   SELECT * FROM ledger_entries 
   WHERE account_id = '<wallet_id>' 
   ORDER BY created_at;
   ```
2. Recompute the sum manually
3. Identify whether wallet or ledger is wrong
4. Look at recent activity around when drift appeared

**Resolution**:
- If wallet drifted HIGH: clawback via `admin_adjustment` with reason "drift correction"
- If wallet drifted LOW: refund via `admin_adjustment`
- Document in post-mortem

**Re-enable**: `SET app.admin_adjustments_disabled=false` only after root cause identified.

---

### 2. Alea round reconciliation divergence

**Symptom**: Nightly job reports rounds missing on our side OR amount mismatches with Alea.

**First actions**:
1. Check Alea status page
2. Pull the divergence report from Slack alert

**Resolution**:
- For rounds missing on our side: the replay worker auto-fires; verify the missing rounds appear in `game_rounds` within 30 minutes
- For amount mismatches: pull both records, compare, decide which is right (Alea is authoritative for game outcomes; we are authoritative for player wallet state — divergence usually means Alea retried after our acknowledgment)

---

### 3-4. Webhook outage (Footprint or Finix)

**Symptom**: Integration health goes red on the Integrity page. No webhooks received in 30+ minutes.

**First actions**:
1. Check provider's status page
2. Check Vercel logs for `/api/webhooks/<provider>` route
3. Verify signature secret is correct in Doppler

**Resolution**:
- The poller fallbacks (Doc 05 §9.5) catch any missed transfers/redemptions
- For Footprint: query `GET /users/{fp_id}` for any KYC-pending users to manually sync
- For Finix: enable replay on Finix dashboard for the missed window

---

### 5. Admin session secret leak suspected

**Symptom**: Someone shares an admin session cookie, or a credential appears on a paste site.

**Immediate**:
1. Rotate `ADMIN_SESSION_SECRET` in Doppler
2. Revoke all admin sessions:
   ```sql
   UPDATE admin_sessions SET revoked_at = NOW() WHERE revoked_at IS NULL;
   ```
3. Force re-login + new 2FA for all admins
4. Audit recent admin actions for suspicious activity

---

### 6. Player password breach suspected

**Symptom**: Email/hash appears on a paste site or HIBP notification.

**Resolution**:
1. Force password reset for affected users
2. Email notification explaining the breach
3. Optionally enforce 2FA on next login for affected users

---

### 7. DDoS in progress

**Symptom**: Sudden traffic spike, latency increase, Cloudflare reporting attack.

**Resolution**:
1. Cloudflare → "I'm Under Attack" mode
2. Tighten rate limits in code (already aggressive per Doc 09 §10.5)
3. If sustained, contact Cloudflare for additional measures

---

### 8. DB primary failover

**Symptom**: Neon dashboard shows failover happening.

**Resolution**:
1. Neon handles this automatically
2. Verify our app reconnects (it should — `pg-pool` retries)
3. Monitor replication lag for 15 minutes after failover
4. PagerDuty will auto-resolve once health checks pass

---

## Post-incident

Every SEV-1 gets a post-mortem within 5 business days:
1. Timeline
2. Root cause
3. Contributing factors
4. What worked
5. What didn't
6. Action items with owners and dates

Stored in `/docs/post-mortems/`. Reviewed in quarterly security review.

---

## When in doubt

Page Claude. The founder has a direct line. Better one extra page than
one missed disaster.
