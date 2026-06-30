# CoinFrenzy Platform — Redemption Flow & KYC Gating

**Document:** 07 of 13
**Reads:** Doc 03 v2, Doc 04 (Ledger §3.6-3.9), Doc 05 (Finix + Footprint webhooks), Doc 06 (playthrough state)
**Read alongside:** Doc 09 (compliance), Doc 08 §7 (cashier UI)
**Purpose:** The end-to-end redemption flow. Footprint KYC integration with onboarding session tokens, validation token exchange, and webhook-driven async status. Finix ACH push for payouts. APT Debit fallback. Cashier review queue. AML hold flow. The thing players use to get their money out.

---

## 1. Why redemption is harder than purchase

Purchases are a one-way street: money in, balance up, done. Redemptions are an N-step state machine across multiple external systems, each with its own latency profile, failure modes, and compliance requirements.

The complexity stack:
- **Eligibility** depends on KYC level, jurisdiction, RG flags, balance composition (Doc 06), AML status
- **Reviewer approval** is required above a threshold — humans involved means SLA matters
- **External payment** via Finix ACH or APT Debit happens asynchronously, with retry semantics
- **Webhook confirmation** of final settlement may arrive minutes to hours after submission
- **Disputes / clawbacks** can happen later if the bank account turns out fraudulent
- **Tax reporting** kicks in over annual thresholds

Get any of this wrong and either players don't get paid (churn) or fraud succeeds (regulatory disaster). Doc 07 is the runbook for getting it right.

---

## 2. The state machine

```
                  ┌───────────────────┐
                  │ player initiates  │
                  └─────────┬─────────┘
                            │
                            ▼
                  ┌─────────────────────┐
                  │   requested         │
                  │ (SC locked in       │◀────────┐
                  │  pending_redemption)│         │
                  └─────────┬───────────┘         │
                            │                     │
              ┌─────────────┼─────────────┐       │
              ▼             ▼             ▼       │
       ┌──────────┐  ┌────────────┐ ┌──────────┐  │
       │  auto-   │  │  pending_  │ │  kyc_    │  │ (re-submit
       │ approved │  │   review   │ │  pending │  │  after KYC
       │ (small + │  │ (cashier   │ │ (waiting │  │  completes)
       │  low risk)│  │  queue)    │ │ for KYC) │  │
       └────┬─────┘  └─────┬──────┘ └──────────┘  │
            │              │              │       │
            └──────┬───────┘              └───────┘
                   │
            ┌──────┴───────┐
            ▼              ▼
       ┌─────────┐   ┌──────────┐
       │approved │   │ rejected │
       └────┬────┘   └────┬─────┘
            │             │
            ▼             ▼
       ┌───────────┐  ┌──────────────────┐
       │ submitted │  │ SC returned to   │
       │ to Finix  │  │ player wallet    │
       └─────┬─────┘  │ (compensating    │
             │        │  ledger entries) │
             ▼        └──────────────────┘
       ┌───────────┐
       │ awaiting_ │
       │ webhook   │
       └─────┬─────┘
             │
       ┌─────┴──────┐
       ▼            ▼
  ┌─────────┐  ┌──────────┐
  │  paid   │  │  failed  │
  └─────────┘  └────┬─────┘
                    │
                    ▼
              ┌─────────────────┐
              │ SC returned     │
              │ + retry option  │
              └─────────────────┘

Also possible from any non-terminal state:
       ▼
  ┌──────────┐
  │ aml_hold │ (continuous monitoring fired post-onboarding)
  └─────┬────┘
        │
   (manager actions: clear / confirm hold / escalate)
```

The states map to `redemptions.status` enum:

```sql
create type redemption_status as enum (
  'requested',
  'pending_review',
  'kyc_pending',
  'approved',
  'submitted',
  'awaiting_webhook',
  'paid',
  'failed',
  'rejected',
  'cancelled',
  'aml_hold'
);
```

---

## 3. Player-facing flow

### 3.1 The redemption request page

`/cashier/redeem` shows:

```
┌─────────────────────────────────────────────────────────────┐
│  Your SC balance              100.00 SC                      │
│                                                              │
│  Available to redeem           70.00 SC ← what player can request
│  Locked in bonuses             30.00 SC                      │
│                                                              │
│  ┌─────────────────────────────────────────────┐           │
│  │  Bonus name             Play X more SC      │           │
│  │  Welcome bonus          25 SC remaining     │           │
│  │  Daily login bonus       5 SC remaining     │           │
│  └─────────────────────────────────────────────┘           │
│                                                              │
│  ─────────────────────────────────────────────────────────  │
│                                                              │
│  Amount to redeem    [   50.00 SC   ]                       │
│                      ($50.00 USD)                            │
│  Min: $1.00 | Max: $X.XX                                    │
│                                                              │
│  Payment method                                              │
│  ⦿ Bank account (ACH) — Chase ****5750                      │
│  ○ Debit card via APT — Visa ****4321                       │
│  ○ + Add new bank account                                    │
│                                                              │
│  Expected timing                                             │
│    ACH: 1-3 business days                                   │
│    APT: Instant (where supported)                            │
│                                                              │
│  [    Request Redemption    ]                                │
└─────────────────────────────────────────────────────────────┘
```

The redeemable amount comes from `wallet.balance_purchased + wallet.balance_earned` per Doc 06 §14. The locked-in-bonuses breakdown comes from active `bonuses_awarded` rows.

### 3.2 The submission path

```typescript
// apps/web/app/api/player/redemptions/route.ts (POST)

export async function POST(req: Request) {
  const ctx = await createPlayerContext(req);
  const body = await req.json();
  const { amount, method, paymentInstrumentId } = body;
  
  // ─────────────────────────────────────────────────────────
  // Eligibility checks — fail fast
  // ─────────────────────────────────────────────────────────
  const eligibility = await checkRedemptionEligibility(ctx, {
    playerId: ctx.actor.playerId,
    amountSc: amount,
    method,
  });
  
  if (!eligibility.allowed) {
    return Response.json({ error: eligibility.reason }, { status: 400 });
  }
  
  // ─────────────────────────────────────────────────────────
  // Create the redemption (ledger lock)
  // ─────────────────────────────────────────────────────────
  const result = await createRedemption(ctx, {
    playerId: ctx.actor.playerId,
    amountSc: amount,
    method,
    paymentInstrumentId,
  });
  
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  
  return Response.json({ redemption: result.value });
}
```

---

## 4. Eligibility checks — the long list

```typescript
// packages/core/src/redemption/eligibility.ts

export async function checkRedemptionEligibility(
  ctx: Context,
  spec: { playerId: string; amountSc: bigint; method: 'finix_ach' | 'apt_debit' }
): Promise<EligibilityResult> {
  
  const player = await ctx.db.players.findById(spec.playerId);
  if (!player) return deny('PLAYER_NOT_FOUND');
  if (player.deleted_at) return deny('ACCOUNT_DELETED');
  if (player.status === 'closed') return deny('ACCOUNT_CLOSED');
  if (player.status === 'self_excluded') return deny('SELF_EXCLUDED');
  if (player.status === 'suspended') return deny('ACCOUNT_SUSPENDED');
  if (player.is_internal_account) return deny('INTERNAL_ACCOUNT_NOT_REDEEMABLE');
  
  // ─────────────────────────────────────────────────────────
  // Jurisdiction check
  // ─────────────────────────────────────────────────────────
  // Two states are checked: the player's registered state AND their current IP-resolved state
  // Both must be allowed
  const ipGeo = await radar.geocodeRequestIp(ctx.request);
  
  if (BLOCKED_STATES.has(player.state)) return deny('REGISTERED_STATE_BLOCKED');
  if (BLOCKED_STATES.has(ipGeo.state))   return deny('CURRENT_LOCATION_BLOCKED');
  
  if (ipGeo.proxy || ipGeo.degraded === false && ipGeo.proxy) {
    return deny('VPN_DETECTED');
  }
  
  // ─────────────────────────────────────────────────────────
  // KYC level check
  // ─────────────────────────────────────────────────────────
  const requiredLevel = computeRequiredKycLevel(player, spec.amountSc);
  if (player.kyc_level < requiredLevel) {
    return deny(`KYC_LEVEL_INSUFFICIENT`, { required: requiredLevel, current: player.kyc_level });
  }
  
  // ─────────────────────────────────────────────────────────
  // Active compliance flags blocking redemption
  // ─────────────────────────────────────────────────────────
  const blockingFlags = await ctx.db.compliance_flags.find({
    player_id: spec.playerId,
    severity: 'block',
    cleared_at: null,
  });
  if (blockingFlags.length > 0) {
    return deny('COMPLIANCE_FLAG_ACTIVE', { flagTypes: blockingFlags.map(f => f.flag_type) });
  }
  
  // ─────────────────────────────────────────────────────────
  // Balance composition check (Doc 06 §14)
  // ─────────────────────────────────────────────────────────
  const wallet = await ctx.db.wallets.findOne({
    player_id: spec.playerId,
    currency: 'SC',
  });
  
  const redeemable = wallet.balance_purchased + wallet.balance_earned;
  if (redeemable < spec.amountSc) {
    return deny('INSUFFICIENT_REDEEMABLE_BALANCE', { available: redeemable.toString() });
  }
  
  // ─────────────────────────────────────────────────────────
  // Amount range
  // ─────────────────────────────────────────────────────────
  if (spec.amountSc < MIN_REDEMPTION_SC) return deny('AMOUNT_BELOW_MINIMUM');
  if (spec.amountSc > MAX_REDEMPTION_SC) return deny('AMOUNT_ABOVE_MAXIMUM');
  
  // ─────────────────────────────────────────────────────────
  // Per-day / per-week / per-month caps
  // ─────────────────────────────────────────────────────────
  const last24h = await ctx.db.redemptions.sumByWindow(spec.playerId, '24h');
  if (last24h + spec.amountSc > MAX_DAILY_REDEMPTION_SC) return deny('DAILY_LIMIT_EXCEEDED');
  
  const last7d = await ctx.db.redemptions.sumByWindow(spec.playerId, '7d');
  if (last7d + spec.amountSc > MAX_WEEKLY_REDEMPTION_SC) return deny('WEEKLY_LIMIT_EXCEEDED');
  
  // ─────────────────────────────────────────────────────────
  // Payment instrument check
  // ─────────────────────────────────────────────────────────
  if (spec.method === 'finix_ach') {
    const inst = await ctx.db.payment_instruments.findOne({
      id: spec.paymentInstrumentId,
      player_id: spec.playerId,
      type: 'bank_account',
    });
    if (!inst) return deny('PAYMENT_INSTRUMENT_NOT_FOUND');
    if (inst.disabled_at) return deny('PAYMENT_INSTRUMENT_DISABLED');
    if (inst.plaid_validation_status !== 'valid') return deny('BANK_ACCOUNT_NOT_VALIDATED');
  }
  
  return { allowed: true };
}
```

### 4.1 KYC level required by amount

```typescript
function computeRequiredKycLevel(player: Player, amountSc: bigint): number {
  // Base requirement: level 2 (Footprint pass) for any redemption
  const base = 2;
  
  // Enhanced due diligence for cumulative annual deposit > $10K
  const cumulativeDeposit = player.cumulative_deposit_lifetime_usd;
  if (cumulativeDeposit > 10_000_00n) return 3;  // bigint cents
  
  // Or for single large redemption > $2,500
  if (amountSc > 2_500_00n) return 3;
  
  return base;
}
```

Level 3 (Enhanced Due Diligence) triggers an in-flow additional verification — typically address verification, source-of-funds questionnaire, and possibly an enhanced Footprint Playbook. For v1, level-3 redemptions auto-route to manager review queue regardless of amount.

---

## 5. Creating the redemption

```typescript
// packages/core/src/redemption/create.ts

export async function createRedemption(
  ctx: Context,
  spec: CreateRedemptionSpec
): Promise<Result<Redemption, RedemptionError>> {
  
  return ctx.db.transaction({ isolationLevel: 'serializable' }, async (tx) => {
    
    // ─────────────────────────────────────────────────────────
    // Compute conversion rate (typically 1 SC = $1 USD)
    // ─────────────────────────────────────────────────────────
    const amountUsd = (spec.amountSc * SC_TO_USD_RATE) / 100n;
    
    // ─────────────────────────────────────────────────────────
    // Determine which sub-buckets to drain (FIFO: purchased then earned)
    // ─────────────────────────────────────────────────────────
    const wallet = await tx.wallets.findOne({
      player_id: spec.playerId,
      currency: 'SC',
    });
    
    const drainPlan = computeDrainPlan(wallet, spec.amountSc);
    // Returns: [{ subBucket: 'purchased', amount: X }, { subBucket: 'earned', amount: Y }]
    
    // ─────────────────────────────────────────────────────────
    // Insert the redemption record
    // ─────────────────────────────────────────────────────────
    const redemption = await tx.redemptions.insert({
      id: randomUUID(),
      player_id: spec.playerId,
      amount_sc: spec.amountSc,
      amount_usd: amountUsd,
      method: spec.method,
      payment_instrument_id: spec.paymentInstrumentId,
      status: 'requested',
      drain_plan: drainPlan,  // preserve for status return / rollback
      requested_at: new Date(),
    });
    
    // ─────────────────────────────────────────────────────────
    // Write the ledger entries per Doc 04 §3.6
    // (debit player_wallet SC from each sub-bucket; credit pending_redemption SC)
    // ─────────────────────────────────────────────────────────
    const pairId = randomUUID();
    const entries = [];
    
    for (const drain of drainPlan) {
      entries.push({
        account: playerWallet(spec.playerId, 'SC'),
        leg: 'debit',
        amount: drain.amount,
        subBucket: drain.subBucket,
      });
    }
    
    entries.push({
      account: pendingRedemption(spec.playerId),
      leg: 'credit',
      amount: spec.amountSc,
    });
    
    await ledger.write(ctx, {
      source: 'redemption_request',
      sourceId: redemption.id,
      pairId,
      entries,
    });
    
    // ─────────────────────────────────────────────────────────
    // Route to next state based on auto-approval rules
    // ─────────────────────────────────────────────────────────
    const nextStatus = await determineNextStatus(ctx, redemption);
    
    await tx.redemptions.update(redemption.id, { status: nextStatus });
    
    // CRM event
    await events.emit(ctx, {
      name: 'player.redemption.requested',
      data: {
        playerId: spec.playerId,
        amountUsd: amountUsd.toString(),
        method: spec.method,
      },
    });
    
    // Audit
    await audit.write(ctx, {
      action: 'redemption.created',
      resource_kind: 'redemption',
      resource_id: redemption.id,
    });
    
    // Push notification update
    ctx.afterCommit(async () => {
      await pusher.trigger(`private-player-${spec.playerId}`, 'redemption-update', {
        redemptionId: redemption.id,
        status: nextStatus,
      });
    });
    
    return ok({ ...redemption, status: nextStatus });
  });
}
```

### 5.1 Auto-approval rules

Small low-risk redemptions can bypass cashier review. The rules:

```typescript
async function determineNextStatus(
  ctx: Context,
  redemption: Redemption
): Promise<RedemptionStatus> {
  
  // High-risk indicators → always review
  const player = await ctx.db.players.findById(redemption.player_id);
  
  // Watchlist hit → aml_hold (terminal until manager clears)
  const amlHold = await ctx.db.compliance_flags.findActive(
    redemption.player_id, 'aml_watchlist'
  );
  if (amlHold) return 'aml_hold';
  
  // KYC enhanced required → manager review
  if (player.kyc_level < 3 && redemption.amount_usd > 2_500_00n) return 'pending_review';
  
  // Recent dispute → review
  const recentDispute = await ctx.db.disputes.recentForPlayer(redemption.player_id, '90d');
  if (recentDispute) return 'pending_review';
  
  // Radar fraud signals → review
  const recentFraudSignals = await ctx.db.geo_history.recentFraudFlags(
    redemption.player_id, '7d'
  );
  if (recentFraudSignals.length > 0) return 'pending_review';
  
  // First redemption ever → review (sanity check on the bank account)
  const previousRedemptions = await ctx.db.redemptions.countByPlayer(
    redemption.player_id, ['paid']
  );
  if (previousRedemptions === 0) return 'pending_review';
  
  // Amount above auto-approval threshold → review
  if (redemption.amount_usd > AUTO_APPROVE_THRESHOLD_USD) return 'pending_review';
  
  // All checks passed → auto-approve
  return 'approved';
}
```

`AUTO_APPROVE_THRESHOLD_USD` is configurable per Doc 09 §3. Default $50.

When auto-approved, the next step (Finix submission) happens immediately via a job; we don't make the player wait.

---

## 6. The Footprint KYC flow

### 6.1 The integration model

When a player needs to complete KYC (typically before their first redemption attempt), we trigger Footprint's hosted onboarding flow. The integration uses Footprint's frontend SDK (`@onefootprint/footprint-js`) with backend-issued session tokens.

```typescript
// packages/core/src/kyc/start-onboarding.ts

export async function startKycOnboarding(
  ctx: Context,
  playerId: string
): Promise<Result<{ onboardingToken: string }, KycError>> {
  
  const player = await ctx.db.players.findById(playerId);
  if (!player) return err({ code: 'PLAYER_NOT_FOUND' });
  
  // ─────────────────────────────────────────────────────────
  // 1. Create or find Footprint user
  // ─────────────────────────────────────────────────────────
  let kycRecord = await ctx.db.kyc_status.findOne({ player_id: playerId });
  
  if (!kycRecord) {
    // First time — create a Footprint user
    // We pre-populate any data we have (email, phone)
    const footprintUser = await footprint.api.createUser({
      // Footprint accepts these to pre-populate; user confirms in flow
      'id.email': player.email,
      'id.phone_number': player.phone,
    });
    
    kycRecord = await ctx.db.kyc_status.insert({
      id: randomUUID(),
      player_id: playerId,
      footprint_user_id: footprintUser.fp_id,
      footprint_status: 'pending',
      created_at: new Date(),
    });
  }
  
  // ─────────────────────────────────────────────────────────
  // 2. Create an onboarding session token
  // ─────────────────────────────────────────────────────────
  // The Playbook ID is the Footprint config we created in their dashboard
  // (defining what data/documents to collect and what checks to run)
  const sessionResponse = await footprint.api.createOnboardingSession({
    playbook_id: env.FOOTPRINT_PLAYBOOK_ID,
    fp_id: kycRecord.footprint_user_id,
  });
  
  // Returns: { token: "obtok_XXXXXXXXXXXX" }
  
  // ─────────────────────────────────────────────────────────
  // 3. Audit + return
  // ─────────────────────────────────────────────────────────
  await audit.write(ctx, {
    action: 'kyc.onboarding_started',
    resource_kind: 'player',
    resource_id: playerId,
  });
  
  await events.emit(ctx, {
    name: 'player.kyc.started',
    data: { playerId },
  });
  
  return ok({ onboardingToken: sessionResponse.token });
}
```

### 6.2 The frontend integration

```tsx
// apps/web/app/(player)/account/kyc/page.tsx (simplified)

'use client';

import footprint from '@onefootprint/footprint-js';
import '@onefootprint/footprint-js/dist/footprint-js.css';

export default function KycPage() {
  const [token, setToken] = useState<string | null>(null);
  
  const startKyc = async () => {
    // Get an onboarding token from our backend
    const res = await fetch('/api/player/kyc/start', { method: 'POST' });
    const { onboardingToken } = await res.json();
    setToken(onboardingToken);
    
    // Launch Footprint's hosted flow
    footprint.init({
      kind: 'verify',
      onboardingSessionToken: onboardingToken,
      onComplete: async (validationToken: string) => {
        // Send validation token to our backend
        await fetch('/api/player/kyc/complete', {
          method: 'POST',
          body: JSON.stringify({ validationToken }),
        });
      },
      onCancel: () => {
        toast('Verification cancelled. You can restart anytime.');
      },
      onError: (error) => {
        Sentry.captureException(error);
        toast.error('Verification error. Please try again or contact support.');
      },
    });
  };
  
  return (
    <div>
      {/* ... explanatory copy about why KYC is required ... */}
      <Button onClick={startKyc}>Start Identity Verification</Button>
    </div>
  );
}
```

### 6.3 Validation token exchange

When Footprint completes, we get a `validationToken` in the `onComplete` callback. The frontend sends it to our backend, which exchanges it with Footprint's API to get the verified data:

```typescript
// apps/web/app/api/player/kyc/complete/route.ts

export async function POST(req: Request) {
  const ctx = await createPlayerContext(req);
  const { validationToken } = await req.json();
  
  // ─────────────────────────────────────────────────────────
  // 1. Exchange validation token for verified result
  // ─────────────────────────────────────────────────────────
  const result = await footprint.api.exchangeValidationToken(validationToken);
  // Returns: { fp_id, status: 'pass' | 'fail' | 'none' | 'pending', login_method }
  
  // ─────────────────────────────────────────────────────────
  // 2. Find our KYC record by fp_id
  // ─────────────────────────────────────────────────────────
  const kycRecord = await ctx.db.kyc_status.findOne({
    footprint_user_id: result.fp_id,
  });
  
  if (!kycRecord || kycRecord.player_id !== ctx.actor.playerId) {
    return Response.json({ error: 'kyc_mismatch' }, { status: 400 });
  }
  
  // ─────────────────────────────────────────────────────────
  // 3. Update status synchronously
  // (if pending, we'll get a webhook later with the final status)
  // ─────────────────────────────────────────────────────────
  let newKycLevel = 0;
  let footprintStatus: string;
  
  switch (result.status) {
    case 'pass':
      newKycLevel = 2;
      footprintStatus = 'verified';
      break;
    case 'fail':
      newKycLevel = 0;
      footprintStatus = 'failed';
      break;
    case 'none':
      newKycLevel = 0;
      footprintStatus = 'incomplete';
      break;
    case 'pending':
      newKycLevel = 0;  // not yet verified — webhook will update
      footprintStatus = 'pending';
      break;
  }
  
  await ctx.db.transaction(async (tx) => {
    await tx.kyc_status.update(kycRecord.id, {
      footprint_status: footprintStatus,
      footprint_completed_at: result.status === 'pending' ? null : new Date(),
    });
    
    await tx.players.update(ctx.actor.playerId, {
      kyc_level: newKycLevel,
      kyc_verified_at: newKycLevel === 2 ? new Date() : null,
    });
  });
  
  // ─────────────────────────────────────────────────────────
  // 4. If verified AND player has redemptions waiting for KYC,
  //    automatically progress them
  // ─────────────────────────────────────────────────────────
  if (result.status === 'pass') {
    await processPendingRedemptionsAwaitingKyc(ctx.actor.playerId);
  }
  
  // CRM event
  await events.emit(ctx, {
    name: result.status === 'pass' ? 'player.kyc.verified' : 'player.kyc.failed',
    data: { playerId: ctx.actor.playerId },
  });
  
  return Response.json({ status: footprintStatus, level: newKycLevel });
}
```

### 6.4 The async pending → completed path

When Footprint returns `pending` synchronously (slower identity vendor in the chain), the player sees "verifying" UI. The final status arrives via the `footprint.onboarding.completed` webhook (Doc 05 §4.4). That webhook handler:

1. Updates `kyc_status` and `players.kyc_level`
2. Calls `processPendingRedemptionsAwaitingKyc(playerId)` if status is pass
3. Emits `player.kyc.verified` CRM event
4. Pushes UI update so the player's KYC page reflects the change in real-time

### 6.5 Pending redemptions waiting for KYC

If a player requests a redemption before completing KYC, the redemption sits in `kyc_pending` status. When KYC completes, we automatically move it forward:

```typescript
async function processPendingRedemptionsAwaitingKyc(playerId: string): Promise<void> {
  const pending = await ctx.db.redemptions.find({
    player_id: playerId,
    status: 'kyc_pending',
  });
  
  for (const redemption of pending) {
    // Re-check eligibility (state may have changed)
    const eligibility = await checkRedemptionEligibility(ctx, {
      playerId,
      amountSc: redemption.amount_sc,
      method: redemption.method,
    });
    
    if (!eligibility.allowed) {
      // KYC passed but something else changed — fail the redemption,
      // return SC to player
      await rejectRedemption(ctx, redemption.id, {
        reason: `Eligibility failed after KYC: ${eligibility.reason}`,
      });
      continue;
    }
    
    // Move to appropriate next state
    const nextStatus = await determineNextStatus(ctx, redemption);
    await ctx.db.redemptions.update(redemption.id, { status: nextStatus });
    
    // If auto-approved, submit to Finix
    if (nextStatus === 'approved') {
      await submitRedemptionToFinix(ctx, redemption.id);
    }
  }
}
```

### 6.6 The Footprint adapter interface

The adapter abstracts Footprint's API calls. Build it in `packages/core/src/adapters/footprint/`. During the build, your devs will fill in the exact endpoint paths and request shapes from the live Footprint docs — the interface below is what the platform expects:

```typescript
// packages/core/src/adapters/footprint/types.ts

export interface FootprintAdapter {
  // Create a Footprint user with pre-populated data
  createUser(data: PrePopulatedUserData): Promise<{ fp_id: string }>;
  
  // Create an onboarding session for an existing fp_id with a specific Playbook
  createOnboardingSession(spec: {
    playbook_id: string;
    fp_id: string;
  }): Promise<{ token: string }>;
  
  // Exchange a validation token (returned from frontend SDK) for verified user info
  exchangeValidationToken(token: string): Promise<{
    fp_id: string;
    status: 'pass' | 'fail' | 'none' | 'pending';
    login_method: string;
  }>;
  
  // Get current user status (used in webhook handlers and polling fallback)
  getUser(fp_id: string): Promise<{
    status: string;
    manual_review_status?: string;
    // ... other fields per Footprint API
  }>;
  
  // Decrypt vaulted fields when admin needs to view them (e.g. SSN for tax reporting)
  // Heavy audit logging on this call
  decryptFields(fp_id: string, fields: string[]): Promise<Record<string, string>>;
}
```

The decrypt endpoint is used sparingly — only by Master admin role, only for specific compliance use cases (tax reporting, regulatory inquiries). Every call is audited and rate-limited.

---

## 7. The cashier review queue (admin side)

Per Doc 08 §7, the cashier UI shows pending redemptions. Action handlers:

### 7.1 Approve

```typescript
// packages/core/src/redemption/approve.ts

export async function approveRedemption(
  ctx: AdminContext,
  redemptionId: string,
  approvalReason?: string
): Promise<Result<void, ApprovalError>> {
  
  const redemption = await ctx.db.redemptions.findById(redemptionId);
  if (!redemption) return err({ code: 'NOT_FOUND' });
  
  // Check admin's role permits this amount
  const threshold = APPROVAL_THRESHOLDS.cashier_redemption_approve[ctx.actor.role];
  if (redemption.amount_usd > threshold.max_usd) {
    return err({ code: 'EXCEEDS_ROLE_LIMIT', max: threshold.max_usd });
  }
  
  if (!['pending_review', 'aml_hold'].includes(redemption.status)) {
    return err({ code: 'INVALID_STATE', current: redemption.status });
  }
  
  // Special handling for aml_hold approval
  if (redemption.status === 'aml_hold' && !canClearAmlHold(ctx.actor)) {
    return err({ code: 'AML_HOLD_REQUIRES_MANAGER' });
  }
  
  await ctx.db.transaction(async (tx) => {
    await tx.redemptions.update(redemptionId, {
      status: 'approved',
      approved_by: ctx.actor.adminId,
      approved_at: new Date(),
      approval_reason: approvalReason,
    });
    
    await audit.write(ctx, {
      action: redemption.status === 'aml_hold' 
        ? 'redemption.aml_cleared' 
        : 'redemption.approved',
      resource_kind: 'redemption',
      resource_id: redemptionId,
      before: { status: redemption.status },
      after: { status: 'approved', approved_by: ctx.actor.adminId },
      reason: approvalReason,
    });
  });
  
  // Trigger Finix submission immediately
  await ctx.inngest.send({
    name: 'redemption/submit-to-finix',
    data: { redemptionId },
  });
  
  return ok();
}
```

### 7.2 Reject

```typescript
export async function rejectRedemption(
  ctx: AdminContext | SystemContext,
  redemptionId: string,
  spec: { reason: string; reasonCategory: string }
): Promise<Result<void, RejectError>> {
  
  const redemption = await ctx.db.redemptions.findById(redemptionId);
  if (!redemption) return err({ code: 'NOT_FOUND' });
  if (redemption.status === 'paid') return err({ code: 'ALREADY_PAID' });
  
  await ctx.db.transaction(async (tx) => {
    // Update status
    await tx.redemptions.update(redemptionId, {
      status: 'rejected',
      rejected_by: ctx.actor.adminId,
      rejected_at: new Date(),
      rejection_reason: spec.reason,
      rejection_category: spec.reasonCategory,
    });
    
    // Return SC to player wallet per Doc 04 §3.9
    // Restore the exact sub-bucket breakdown from drain_plan
    const pairId = randomUUID();
    const entries = [
      { account: pendingRedemption(redemption.player_id), leg: 'debit', amount: redemption.amount_sc },
    ];
    
    for (const drain of redemption.drain_plan) {
      entries.push({
        account: playerWallet(redemption.player_id, 'SC'),
        leg: 'credit',
        amount: drain.amount,
        subBucket: drain.subBucket,
      });
    }
    
    await ledger.write(ctx, {
      source: 'redemption_rejected',
      sourceId: redemption.id,
      pairId,
      entries,
    });
    
    await audit.write(ctx, {
      action: 'redemption.rejected',
      resource_kind: 'redemption',
      resource_id: redemptionId,
      reason: spec.reason,
    });
  });
  
  // Notify player
  await events.emit(ctx, {
    name: 'player.redemption.rejected',
    data: {
      playerId: redemption.player_id,
      redemptionId: redemption.id,
      reason: spec.reason,
    },
  });
  
  await pusher.trigger(`private-player-${redemption.player_id}`, 'redemption-update', {
    redemptionId,
    status: 'rejected',
  });
  
  return ok();
}
```

### 7.3 The AML hold queue (per your decision)

A separate queue visible only to Manager+ role. Each entry surfaces:
- The player's profile summary (link to drill-in)
- Match details from the Footprint webhook (sanctioned name match, score)
- The player's complete redemption history
- Footprint vault data (with audit-logged decrypt for SSN/DOB if needed)
- Three actions:
  - **Clear** (false positive) — clears the `aml_watchlist` flag, redemption returns to `pending_review`
  - **Confirm Hold** — flag stays, redemption stays in `aml_hold`, player kept in monitoring
  - **Escalate to Legal** — flag stays, account status changes to `suspended`, notification routed to legal@coinfrenzy

```typescript
// packages/core/src/redemption/aml-action.ts

export async function actOnAmlHold(
  ctx: AdminContext,
  redemptionId: string,
  action: 'clear' | 'confirm_hold' | 'escalate'
): Promise<Result<void, AmlActionError>> {
  
  if (ctx.actor.role !== 'manager' && ctx.actor.role !== 'master') {
    return err({ code: 'INSUFFICIENT_PERMISSIONS' });
  }
  
  const redemption = await ctx.db.redemptions.findById(redemptionId);
  if (!redemption || redemption.status !== 'aml_hold') {
    return err({ code: 'NOT_AML_HOLD' });
  }
  
  await ctx.db.transaction(async (tx) => {
    switch (action) {
      case 'clear':
        // Manager has verified this is a false positive
        await tx.compliance_flags.update(
          { player_id: redemption.player_id, flag_type: 'aml_watchlist', cleared_at: null },
          { 
            cleared_at: new Date(), 
            cleared_by: ctx.actor.adminId,
            cleared_reason: 'False positive — manager review',
          }
        );
        await tx.redemptions.update(redemptionId, { status: 'pending_review' });
        await tx.aml_review_queue.update(
          { player_id: redemption.player_id, status: 'open' },
          { status: 'cleared', resolved_at: new Date(), resolved_by: ctx.actor.adminId }
        );
        break;
      
      case 'confirm_hold':
        // Flag remains; redemption stays held
        await tx.aml_review_queue.update(
          { player_id: redemption.player_id, status: 'open' },
          { status: 'hold_confirmed', resolved_at: new Date(), resolved_by: ctx.actor.adminId }
        );
        // Optional: pending redemption stays in aml_hold indefinitely
        // until next monthly review cycle
        break;
      
      case 'escalate':
        await tx.players.update(redemption.player_id, { 
          status: 'suspended',
          status_reason: 'AML escalation',
        });
        await tx.aml_review_queue.update(
          { player_id: redemption.player_id, status: 'open' },
          { status: 'escalated_legal', resolved_at: new Date(), resolved_by: ctx.actor.adminId }
        );
        // Notify legal
        await notifications.sendLegalAmlEscalation({
          playerId: redemption.player_id,
          redemptionId,
          adminId: ctx.actor.adminId,
        });
        break;
    }
    
    await audit.write(ctx, {
      action: `aml_hold.${action}`,
      resource_kind: 'redemption',
      resource_id: redemptionId,
    });
  });
  
  return ok();
}
```

---

## 8. Finix ACH submission

Once approved (auto or manual), the redemption is submitted to Finix as a `PUSH_TO_ACH` transfer:

```typescript
// packages/core/src/redemption/submit-to-finix.ts

export async function submitRedemptionToFinix(
  ctx: SystemContext,
  redemptionId: string
): Promise<Result<void, SubmitError>> {
  
  const redemption = await ctx.db.redemptions.findById(redemptionId);
  if (!redemption || redemption.status !== 'approved') {
    return err({ code: 'NOT_APPROVED' });
  }
  
  const player = await ctx.db.players.findById(redemption.player_id);
  const instrument = await ctx.db.payment_instruments.findById(redemption.payment_instrument_id);
  
  // ─────────────────────────────────────────────────────────
  // Create Finix transfer
  // ─────────────────────────────────────────────────────────
  try {
    const transfer = await finix.api.createTransfer({
      operation_key: 'PUSH_TO_ACH',
      amount: redemption.amount_usd,  // in cents
      currency: 'USD',
      source: env.FINIX_HOUSE_MERCHANT_ID,  // our payout source
      destination: instrument.finix_payment_instrument_id,
      idempotency_id: `redemption_${redemption.id}`,  // exactly-once submission
      tags: {
        redemption_id: redemption.id,
        player_id: redemption.player_id,
        // No PII in tags (Finix logs these)
      },
    });
    
    await ctx.db.redemptions.update(redemptionId, {
      status: 'awaiting_webhook',
      finix_transfer_id: transfer.id,
      submitted_to_finix_at: new Date(),
    });
    
    await audit.write(ctx, {
      action: 'redemption.submitted_to_finix',
      resource_kind: 'redemption',
      resource_id: redemptionId,
      after: { finix_transfer_id: transfer.id },
    });
    
    return ok();
    
  } catch (error) {
    // Finix call failed — could be transient or permanent
    if (isTransientError(error)) {
      // Inngest will retry the job
      throw error;
    }
    
    // Permanent failure — fail the redemption and return SC
    await rejectRedemption(ctx, redemptionId, {
      reason: `Finix submission failed: ${error.message}`,
      reasonCategory: 'processor_error',
    });
    
    return err({ code: 'FINIX_PERMANENT_FAILURE' });
  }
}
```

After submission, the redemption sits in `awaiting_webhook` until Finix fires `transfer.succeeded` (→ `paid`) or `transfer.failed` (→ `failed`). Doc 05 §3.4 covers the webhook handler.

### 8.1 The poller fallback

Per Doc 05 §9.5, a 5-minute poller catches redemptions stuck in `awaiting_webhook` beyond a reasonable window:

```typescript
export const pollStuckRedemptions = inngest.createFunction(
  { id: 'poll-stuck-redemptions' },
  { cron: '*/5 * * * *' },
  async () => {
    const stuck = await db.redemptions.find({
      status: 'awaiting_webhook',
      submitted_to_finix_at: { lt: subMinutes(new Date(), 10) },
    });
    
    for (const r of stuck) {
      const transfer = await finix.api.getTransfer(r.finix_transfer_id);
      
      if (transfer.state === 'SUCCEEDED') {
        // Webhook was lost; manually fire the handler
        await handleFinixPayoutSucceeded({ entity: transfer });
      } else if (transfer.state === 'FAILED') {
        await handleFinixTransferFailed({ entity: transfer });
      }
      // Still PENDING — leave it; poller will check again in 5min
    }
  }
);
```

---

## 9. APT Debit fallback

APT (American Payment Transfers) provides instant card-rail payouts when ACH is too slow for the player. For v1, APT is a secondary option exposed in the redemption UI.

The integration shape is similar to Finix but separate:

```typescript
// packages/core/src/adapters/apt/index.ts

export async function submitAptDebit(
  ctx: SystemContext,
  redemption: Redemption
): Promise<Result<void, AptError>> {
  const player = await ctx.db.players.findById(redemption.player_id);
  
  const aptTransfer = await apt.api.createPayout({
    amount: redemption.amount_usd,
    card_number_token: instrument.apt_card_token,  // tokenized debit card
    recipient: {
      first_name: player.first_name,
      last_name: player.last_name,
      address: player.address,
    },
    metadata: {
      redemption_id: redemption.id,
    },
  });
  
  await ctx.db.redemptions.update(redemption.id, {
    apt_transfer_id: aptTransfer.id,
    status: 'awaiting_webhook',  // APT also has async confirmation
  });
}
```

APT's webhooks fire to `/api/webhooks/apt/v1` (Doc 05 pattern). Status mapping is roughly the same as Finix: `succeeded` → `paid`, `failed` → `failed`.

For v1, the cashier UI lets players pick between Finix ACH (1-3 business days) and APT Debit (instant, where supported). APT typically has higher fees so we may surface it only to higher-tier players in year 2.

---

## 10. Tax reporting

US tax law requires sweepstakes operators to issue 1099-MISC forms to any player whose annual redemptions exceed $600.

### 10.1 The annual rollup

A cron job runs each January 15 to compute prior year totals:

```typescript
export const generateAnnualTaxRollup = inngest.createFunction(
  { id: 'annual-tax-rollup' },
  { cron: '0 9 15 1 *' },  // Jan 15 every year at 9am
  async () => {
    const lastYear = getYear(new Date()) - 1;
    
    // Sum all completed redemptions per player for the year
    const recipients = await db.query(`
      SELECT 
        player_id,
        SUM(amount_usd) as total_usd,
        COUNT(*) as redemption_count
      FROM redemptions
      WHERE status = 'paid'
        AND paid_at >= $1 AND paid_at < $2
      GROUP BY player_id
      HAVING SUM(amount_usd) >= 60000  -- $600 in cents
    `, [`${lastYear}-01-01`, `${lastYear+1}-01-01`]);
    
    for (const r of recipients) {
      await db.tax_reports.insert({
        player_id: r.player_id,
        tax_year: lastYear,
        form_type: '1099-MISC',
        total_amount_usd: r.total_usd,
        redemption_count: r.redemption_count,
        status: 'pending_generation',
      });
    }
    
    // Queue Master admin notification — generate forms via tax service integration
    await notifications.notifyMasterAdmins({
      subject: `${recipients.length} 1099-MISC forms required for ${lastYear}`,
    });
  }
);
```

### 10.2 The form generation

Form generation goes through a tax-form service (e.g. Track1099, TaxBandits). The admin UI in `Admin → Reports → Tax` triggers generation, retrieves the forms, and delivers via mail and/or e-delivery (per IRS consent rules).

For v1, this is a Master-only manual workflow. Year 2 would automate the e-delivery and IRS filing.

---

## 11. Performance + scale

Per-redemption operations are not the hot path — at scale we expect ~5,000 redemptions/month, peaking ~50/day. Each redemption:

| Step | Latency target |
| --- | --- |
| Eligibility check | < 200ms |
| Create redemption (ledger write) | < 50ms |
| Auto-approval decision | < 100ms |
| Finix submission (HTTP to Finix) | < 2s typical |
| Webhook receipt + ledger | < 50ms |

The bottleneck is human review time, not system performance. We size for: cashier role can clear ~120 redemptions/hour at peak, so 5 cashiers handle ~600/hour, more than enough for our volume.

---

## 12. Failure modes recap

| Scenario | Recovery |
| --- | --- |
| Footprint flow abandoned mid-way | Redemption stays in `kyc_pending`; player can restart anytime |
| Footprint returns `fail` | Redemption rejected; SC returned; player can dispute via support |
| Footprint webhook lost | Polling fallback in worker job catches it |
| Finix submission fails permanently | Redemption rejected; SC returned; player notified |
| Finix webhook lost | 5-min poller fetches status; manually fires handler |
| Player's bank account turns out fraudulent (ACH return) | Webhook → `failed`; SC returned; bank account disabled; compliance flag |
| AML watchlist hit post-onboarding | `aml_hold` status; manager queue; per §7.3 |
| Chargeback on the funding purchase | Doc 04 §3.10 clawback ledger; redemption may need to be reversed if not yet paid |
| Cashier approves, then realizes mistake before Finix processes | Special "recall" action — possible if Finix transfer is still PENDING |

The "recall" path is rare and worth noting: if a cashier approves a redemption and within ~30 seconds realizes it was a mistake, the Finix transfer may still be PENDING (Finix batches ACH for processing). They can call Finix's reverse-transfer API. After ~30 seconds it's too late; the only recourse is to wait for the ACH to settle, then issue a clawback against the player's account.

---

## 13. Cross-references

- **Doc 02** — Context and Result patterns
- **Doc 03 v2 §3** — `redemptions` table schema with the locked `method` enum
- **Doc 04 §3.6-3.9** — Ledger transactions for redemption_request, redemption_paid, redemption_rejected
- **Doc 05 §3** — Finix webhook handling for transfer.succeeded/failed
- **Doc 05 §4** — Footprint webhook handling
- **Doc 06 §14** — redeemable balance computation
- **Doc 08 §7** — admin UI for cashier review queue
- **Doc 09 §3** — role-based approval thresholds
- **Doc 09 §7** — RG enforcement gating

---

## 14. What's next

All P0 architecture docs are complete with this. Remaining work:
- **Doc 03 v3** — final schema patch incorporating all additions from Docs 05, 06, 07
- **Assembly** — `.cursorrules`, prompts/, runbooks/, README, index
- **Session zero** — walkthrough before you open Cursor
