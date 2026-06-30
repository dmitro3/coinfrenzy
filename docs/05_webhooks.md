# CoinFrenzy Platform — Webhook Architecture

**Document:** 05 of 13
**Reads:** Doc 01 (Architecture), Doc 02 (Core Service Layer), Doc 03 v2 (Data Model), Doc 04 (Ledger)
**Read before:** Doc 06 (Bonus Engine), Doc 07 (Redemption + KYC)
**Purpose:** The exact webhook receiver pattern, per-vendor event handling, idempotency at the receiver level, signature verification, health monitoring. The integration surface where the platform meets the outside world.

---

## 1. The five webhook integrations

| Provider | What we receive | Volume estimate (at scale) | Critical events |
| --- | --- | --- | --- |
| **Finix** | Payment lifecycle | 50-200/min | `transfer.succeeded`, `transfer.failed`, `dispute.created` |
| **Alea** | Game round outcomes + session events | 2,000-10,000/min | round outcomes |
| **Footprint** (via Svix) | KYC verification + AML | 5-20/min | `footprint.onboarding.completed`, `footprint.user.manual_review`, `footprint.watchlist_check.completed` |
| **Radar** | Track API events (location + fraud) | Mostly polled, some pushed | fraud signal changes |
| **SendGrid + Twilio** | Email/SMS delivery events | 100-500/min | `delivered`, `bounced`, `opened`, `clicked`, inbound STOP |

Each lives behind a versioned URL:
```
/api/webhooks/finix/v1
/api/webhooks/alea/v1
/api/webhooks/footprint/v1
/api/webhooks/radar/v1
/api/webhooks/sendgrid/v1
/api/webhooks/twilio/v1
```

Versioning matters because providers occasionally change payload shapes. We can stand up `/v2` while `/v1` keeps running, migrate the subscription, then retire `/v1` on a schedule.

---

## 2. The universal receiver pattern

Every webhook handler follows this exact pattern. No exceptions.

```typescript
// apps/web/app/api/webhooks/[provider]/v1/route.ts

export async function POST(req: Request) {
  const startedAt = Date.now();
  const ctx = createContext({ request: req, actorKind: 'system' });
  
  try {
    // ─────────────────────────────────────────────────────────
    // STEP 1 — Read the raw body (BEFORE any parsing)
    // Signatures are computed over the raw bytes; if we parse first,
    // some adapters re-serialize differently and signature breaks.
    // ─────────────────────────────────────────────────────────
    const rawBody = await req.text();
    const headers = Object.fromEntries(req.headers.entries());
    
    // ─────────────────────────────────────────────────────────
    // STEP 2 — Verify signature (vendor-specific)
    // ─────────────────────────────────────────────────────────
    const verification = await verifySignature(provider, rawBody, headers);
    if (!verification.ok) {
      await audit.write(ctx, {
        action: 'webhook.signature_failed',
        resource_kind: 'webhook',
        provider,
        reason: verification.error,
      });
      return new Response('Invalid signature', { status: 401 });
    }
    
    // ─────────────────────────────────────────────────────────
    // STEP 3 — Extract idempotency key (vendor-specific)
    // For each provider, we have a unique-per-event ID we can use.
    // ─────────────────────────────────────────────────────────
    const idempotencyKey = extractIdempotencyKey(provider, rawBody, headers);
    
    // ─────────────────────────────────────────────────────────
    // STEP 4 — Receiver-level idempotency check
    // BEFORE we even queue work, check if we've seen this event ID.
    // This protects against the case where the same webhook arrives
    // multiple times in rapid succession (provider retry storm).
    // ─────────────────────────────────────────────────────────
    const existing = await ctx.db.pending_webhooks.findOne({
      provider,
      idempotency_key: idempotencyKey,
    });
    if (existing) {
      // Already received; acknowledge but don't re-queue
      await updateIntegrationHealth(provider, 'duplicate_received');
      return new Response('OK', { status: 200 });
    }
    
    // ─────────────────────────────────────────────────────────
    // STEP 5 — Persist the raw event BEFORE processing
    // This is the "webhook capture" insurance pattern from Doc 13.
    // If our handler crashes during processing, the event is preserved
    // and the worker can retry later.
    // ─────────────────────────────────────────────────────────
    await ctx.db.pending_webhooks.insert({
      id: randomUUID(),
      provider,
      idempotency_key: idempotencyKey,
      received_at: new Date(),
      raw_body: rawBody,
      raw_headers: headers,
      event_type: extractEventType(provider, rawBody),
      status: 'received',
    });
    
    // ─────────────────────────────────────────────────────────
    // STEP 6 — Dispatch to Inngest for async processing
    // The HTTP response to the provider is independent of whether
    // our internal processing has finished. We acknowledge receipt
    // synchronously; processing happens in the background with retries.
    // ─────────────────────────────────────────────────────────
    await ctx.inngest.send({
      name: `webhook/${provider}.received`,
      data: { idempotencyKey, eventType: extractEventType(provider, rawBody) },
    });
    
    // ─────────────────────────────────────────────────────────
    // STEP 7 — Update health metrics
    // ─────────────────────────────────────────────────────────
    await updateIntegrationHealth(provider, 'received', {
      latency_ms: Date.now() - startedAt,
    });
    
    // ─────────────────────────────────────────────────────────
    // STEP 8 — Acknowledge to the provider
    // ─────────────────────────────────────────────────────────
    return new Response('OK', { status: 200 });
    
  } catch (error) {
    // Any unhandled error → log + 500 → provider retries
    ctx.logger.error('webhook_unhandled_error', { provider, error });
    await updateIntegrationHealth(provider, 'error');
    return new Response('Internal error', { status: 500 });
  }
}
```

**Why this pattern works:**
- **Persistence before processing** means we never lose a webhook
- **Async dispatch via Inngest** decouples receipt from processing — slow handlers don't cause provider timeouts
- **Receiver-level idempotency** prevents duplicate work even at the receipt layer
- **Signature verification first** means we 401 bad requests before they consume any database resources
- **Raw body persistence** means we can replay events later (debugging, audit, migration scenarios)

### 2.1 The `pending_webhooks` table

```sql
create table pending_webhooks (
  id              uuid primary key default gen_random_uuid(),
  provider        text not null,
  idempotency_key text not null,
  event_type      text not null,
  
  raw_body        text not null,
  raw_headers     jsonb not null,
  
  received_at     timestamptz not null default now(),
  
  status          text not null default 'received',
  -- 'received' | 'processing' | 'completed' | 'failed' | 'replayed_for_migration'
  
  processing_attempts int not null default 0,
  last_attempt_at timestamptz,
  last_error      text,
  
  processed_at    timestamptz,
  
  unique (provider, idempotency_key)
);

create index pending_webhooks_status_idx on pending_webhooks(status, received_at) 
  where status in ('received', 'processing', 'failed');
create index pending_webhooks_provider_idx on pending_webhooks(provider, received_at desc);
create index pending_webhooks_event_idx on pending_webhooks(event_type, received_at desc);

-- Partition by month at scale (~5-50M rows/month)
```

This table is the operational nerve center. Health dashboards query it. Migration replay reads from it. Failed webhook recovery reprocesses from it.

### 2.2 The Inngest dispatcher

Each provider has an Inngest function that consumes the `webhook/{provider}.received` event:

```typescript
// apps/worker/src/inngest/webhook-finix.ts

export const processFinixWebhook = inngest.createFunction(
  {
    id: 'process-finix-webhook',
    concurrency: { limit: 100 },     // up to 100 in parallel
    retries: 5,                       // 5 retries with exponential backoff
  },
  { event: 'webhook/finix.received' },
  async ({ event, step }) => {
    const { idempotencyKey } = event.data;
    
    const pw = await step.run('fetch-event', async () =>
      db.pending_webhooks.findOneOrFail({
        provider: 'finix',
        idempotency_key: idempotencyKey,
      })
    );
    
    await step.run('mark-processing', async () =>
      db.pending_webhooks.update(pw.id, {
        status: 'processing',
        processing_attempts: pw.processing_attempts + 1,
        last_attempt_at: new Date(),
      })
    );
    
    const payload = JSON.parse(pw.raw_body);
    
    await step.run('dispatch-by-event-type', async () => {
      switch (pw.event_type) {
        case 'transfer.succeeded':       return handleFinixTransferSucceeded(payload);
        case 'transfer.failed':          return handleFinixTransferFailed(payload);
        case 'transfer.created':         return handleFinixTransferCreated(payload);
        case 'authorization.succeeded': return handleFinixAuthorizationSucceeded(payload);
        case 'authorization.failed':    return handleFinixAuthorizationFailed(payload);
        case 'dispute.created':          return handleFinixDisputeCreated(payload);
        case 'dispute.updated':          return handleFinixDisputeUpdated(payload);
        case 'merchant.updated':         return handleFinixMerchantUpdated(payload);
        // ... other event types as needed
        default:
          logger.warn('unknown_finix_event_type', { eventType: pw.event_type });
      }
    });
    
    await step.run('mark-complete', async () =>
      db.pending_webhooks.update(pw.id, {
        status: 'completed',
        processed_at: new Date(),
      })
    );
  }
);
```

Inngest handles the retry policy automatically: if the function throws, it retries with exponential backoff (default: 30s, 2min, 10min, 30min, 2hr). After 5 retries, the function marks the event as `failed` and pages on-call.

### 2.3 Why split receipt from processing

The receipt handler must return 200 quickly (within 5-10 seconds, depending on provider). If we did all the ledger work synchronously, slow ledger operations would cause provider timeouts, which trigger provider retries, which trigger duplicate processing if we're not careful. Decoupling means:
- Receipt is always fast (~50ms) — just signature verify + DB insert + Inngest send
- Processing has its own retry policy independent of provider retries
- We can replay processing later without re-receiving (e.g. for migration cutover per Doc 13 §6.2)

---

## 3. Finix webhooks

### 3.1 Subscribed event types

We subscribe to these via the Finix dashboard or `POST /webhooks`:

```
authorization.created
authorization.succeeded
authorization.failed
authorization.captured
authorization.voided

transfer.created
transfer.succeeded
transfer.failed
transfer.canceled
transfer.reversed

dispute.created
dispute.updated
dispute.evidence_required
dispute.lost
dispute.won

settlement.created
settlement.funded

payment_instrument.created
payment_instrument.updated
payment_instrument.disabled
```

We do NOT subscribe to (out of scope for v1):
- Merchant onboarding events (we have one merchant — Lucky Labz LLC)
- Settlement queue events (we use auto-settlement)
- Compliance form events (handled in dashboard, not webhook-driven)

### 3.2 Signature verification

Finix signs webhooks with HMAC-SHA256. The signing key is configured per webhook in their dashboard and stored in our Doppler as `FINIX_WEBHOOK_SECRET`.

```typescript
// packages/core/src/webhooks/verify-finix.ts

import { createHmac, timingSafeEqual } from 'crypto';

export async function verifyFinix(
  rawBody: string,
  headers: Record<string, string>
): Promise<VerifyResult> {
  const signature = headers['finix-signature'] || headers['x-finix-signature'];
  if (!signature) return { ok: false, error: 'missing_signature_header' };
  
  const expected = createHmac('sha256', env.FINIX_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  
  // Timing-safe comparison
  const sigBuf = Buffer.from(signature, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length) return { ok: false, error: 'length_mismatch' };
  if (!timingSafeEqual(sigBuf, expBuf)) return { ok: false, error: 'signature_mismatch' };
  
  return { ok: true };
}
```

### 3.3 Idempotency key extraction

Finix events carry a unique `id` on the entity referenced:

```typescript
function extractFinixIdempotencyKey(rawBody: string, headers: Record<string, string>): string {
  const body = JSON.parse(rawBody);
  // Finix structures events as { id, type, ... } at top level
  // The event ID is globally unique
  return body.id;
}
```

We store this as `pending_webhooks.idempotency_key`. The ledger writes that downstream handlers perform additionally use `(source='finix_webhook', source_id=body.id)` so duplicate webhook reprocessing produces zero duplicate ledger entries.

### 3.4 Event handlers — what each does

**`transfer.succeeded` for a purchase** — the main event:

```typescript
async function handleFinixTransferSucceeded(payload: FinixEvent) {
  const transfer = payload.entity;  // the Transfer object
  
  // 1. Find our internal purchase record
  // We link Finix transfers to purchases via tags.purchase_id
  // (set when we create the transfer from the player's buy intent)
  const purchaseId = transfer.tags?.purchase_id;
  if (!purchaseId) {
    logger.error('finix_transfer_no_purchase_id', { transferId: transfer.id });
    return;
  }
  
  const purchase = await db.purchases.findById(purchaseId);
  if (!purchase) {
    logger.error('finix_transfer_purchase_not_found', { purchaseId });
    return;
  }
  
  // 2. Validate amount matches what we expected
  if (transfer.amount !== purchase.amount_cents) {
    logger.error('finix_transfer_amount_mismatch', {
      expected: purchase.amount_cents,
      received: transfer.amount,
    });
    // Don't crash — just flag for review. The transfer succeeded;
    // someone needs to look at the discrepancy.
    await db.compliance_flags.insert({
      player_id: purchase.player_id,
      flag_type: 'fraud',
      severity: 'warn',
      reason: 'Finix transfer amount mismatch',
    });
    return;
  }
  
  // 3. Update purchase status
  await db.purchases.update(purchase.id, {
    status: 'completed',
    finix_transfer_id: transfer.id,
    completed_at: new Date(),
    finix_3ds_result: transfer.network_details?.threeds_result,
    finix_avs_result: transfer.address_verification,
  });
  
  // 4. Write the ledger entries per Doc 04 §3.1
  //    (purchases write 6 ledger entries: external→house_bank USD,
  //     house_winnings_gc→player_wallet GC, house_winnings_sc→player_wallet SC)
  await ledger.write(ctx, {
    source: 'purchase',
    sourceId: purchase.id,
    entries: buildPurchaseLedgerEntries(purchase),
  });
  
  // 5. Award any package-linked bonus (per Doc 06)
  if (purchase.package_id) {
    const pkg = await db.packages.findById(purchase.package_id);
    if (pkg.bonus_id) {
      await bonusEngine.award(ctx, {
        playerId: purchase.player_id,
        bonusId: pkg.bonus_id,
        sourceKind: 'purchase',
        sourceId: purchase.id,
      });
    }
  }
  
  // 6. Emit player event for CRM (per Doc 11 §1.3)
  await events.emit(ctx, {
    name: 'player.purchase.succeeded',
    data: {
      playerId: purchase.player_id,
      amountUsd: purchase.amount_cents / 100,
      packageId: purchase.package_id,
    },
  });
  
  // 7. Send Pusher push to update player's UI in real-time
  await pusher.trigger(
    `private-player-${purchase.player_id}`,
    'balance-update',
    { reason: 'purchase' }
  );
}
```

**`transfer.failed` for a purchase:**

```typescript
async function handleFinixTransferFailed(payload: FinixEvent) {
  const transfer = payload.entity;
  const purchaseId = transfer.tags?.purchase_id;
  if (!purchaseId) return;
  
  await db.purchases.update(purchaseId, {
    status: 'failed',
    finix_transfer_id: transfer.id,
    failure_reason: transfer.failure_code,
    failure_message: transfer.failure_message,
    completed_at: new Date(),
  });
  
  // No ledger writes — no money moved
  
  await events.emit(ctx, {
    name: 'player.purchase.failed',
    data: { playerId: ..., reason: transfer.failure_code },
  });
}
```

**`transfer.succeeded` for a payout (redemption)** — the OTHER direction:

```typescript
async function handleFinixPayoutSucceeded(payload: FinixEvent) {
  const transfer = payload.entity;
  
  // Distinguish purchase vs payout via Finix's operation_key:
  //   CARD_NOT_PRESENT_SALE = purchase
  //   PUSH_TO_ACH           = payout (redemption)
  if (transfer.operation_key !== 'PUSH_TO_ACH') {
    return handleFinixTransferSucceeded(payload);  // purchase path
  }
  
  const redemptionId = transfer.tags?.redemption_id;
  if (!redemptionId) return;
  
  const redemption = await db.redemptions.findById(redemptionId);
  
  await db.redemptions.update(redemption.id, {
    status: 'paid',
    finix_transfer_id: transfer.id,
    paid_at: new Date(),
  });
  
  // Write the 4 ledger entries per Doc 04 §3.8
  // (debit pending_redemption SC, credit external SC,
  //  debit house_bank USD, credit external USD)
  await ledger.write(ctx, {
    source: 'redemption_paid',
    sourceId: redemption.id,
    entries: buildRedemptionPaidLedgerEntries(redemption),
  });
  
  // CRM event
  await events.emit(ctx, {
    name: 'player.redemption.paid',
    data: { playerId: redemption.player_id, amountUsd: redemption.amount_usd },
  });
  
  // Pusher push + email receipt
  await pusher.trigger(`private-player-${redemption.player_id}`, 'redemption-update', {
    redemptionId: redemption.id,
    status: 'paid',
  });
  
  await notifications.sendRedemptionPaidReceipt(redemption);
}
```

**`dispute.created`** — chargeback initiation:

```typescript
async function handleFinixDisputeCreated(payload: FinixEvent) {
  const dispute = payload.entity;
  const purchaseId = await findPurchaseByTransferId(dispute.transfer);
  
  // Create our internal dispute record
  await db.disputes.insert({
    id: randomUUID(),
    purchase_id: purchaseId,
    finix_dispute_id: dispute.id,
    reason_code: dispute.reason_code,
    amount_usd: dispute.amount,
    status: 'pending',
    response_due_at: dispute.respond_by,
  });
  
  // Flag the player for manager review
  const purchase = await db.purchases.findById(purchaseId);
  await db.compliance_flags.insert({
    player_id: purchase.player_id,
    flag_type: 'dispute',
    severity: 'warn',
    reason: `Chargeback opened on $${dispute.amount/100}`,
  });
  
  // Notify cashier team
  await pusher.trigger('admin-cashier-alerts', 'dispute-created', {
    disputeId: dispute.id,
    playerId: purchase.player_id,
    amountUsd: dispute.amount / 100,
  });
  
  // CRM event for engagement model
  await events.emit(ctx, {
    name: 'player.purchase.disputed',
    data: { playerId: purchase.player_id, disputeId: dispute.id },
  });
}
```

The clawback ledger entries (Doc 04 §3.10) happen later — they fire when the dispute is lost OR when an admin confirms the clawback, NOT when the dispute is created (the money may still come back if we win the dispute).

### 3.5 The 3DS, AVS, and security check capture

Finix's webhook payload includes detailed payment risk data we want to preserve for fraud forensics:

```typescript
// Stored on purchases table when we update on transfer.succeeded:
{
  finix_3ds_result: transfer.network_details?.threeds_result,
  //   e.g. 'AUTHENTICATED' / 'NOT_AUTHENTICATED' / 'ATTEMPTED'
  finix_3ds_eci: transfer.network_details?.eci,
  //   '05' = full liability shift, '06' = attempt liability shift
  finix_avs_result: transfer.address_verification,
  //   'POSTAL_CODE_AND_STREET_MATCH' / 'POSTAL_CODE_MATCH' / 'NO_MATCH' / etc
  finix_cvv_result: transfer.security_code_verification,
  //   'MATCHED' / 'NOT_MATCHED' / 'NOT_PROCESSED'
  finix_card_last4: transfer.payment_instrument?.last_four,
  finix_card_brand: transfer.payment_instrument?.brand,
}
```

This data is the foundation of the chargeback rebuttal template from earlier — when a chargeback comes in, we already have the 3DS authentication record proving the cardholder authenticated, and the AVS match proving the billing address was correct. Major operators win 70%+ of disputes with this data; we set ourselves up for the same.

---

## 4. Footprint webhooks (via Svix)

### 4.1 Subscribed event types

Three events:

```
footprint.onboarding.completed     # KYC terminal status
footprint.user.manual_review       # Staff status change on a user
footprint.watchlist_check.completed # AML continuous monitoring
```

We do NOT subscribe to (handled synchronously via SDK callback or polled):
- `footprint.user.created` — synchronous via SDK
- `footprint.onboarding.started` — informational, we trigger this ourselves

### 4.2 Signature verification via Svix

Svix uses HMAC-SHA256 with a base64-encoded secret. The `svix` npm package handles verification:

```typescript
// packages/core/src/webhooks/verify-footprint.ts

import { Webhook } from 'svix';

export async function verifyFootprint(
  rawBody: string,
  headers: Record<string, string>
): Promise<VerifyResult> {
  try {
    const wh = new Webhook(env.FOOTPRINT_WEBHOOK_SECRET);
    // Svix verifies signature, timestamp, and replay window in one call
    wh.verify(rawBody, {
      'svix-id':        headers['svix-id'],
      'svix-timestamp': headers['svix-timestamp'],
      'svix-signature': headers['svix-signature'],
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
```

The Svix library checks:
- Signature is valid HMAC-SHA256
- Timestamp is within 5 minutes of current time (replay protection)
- Multiple signatures are supported for key rotation

### 4.3 Idempotency key

The `svix-id` header is a globally unique event ID. We use it directly:

```typescript
function extractFootprintIdempotencyKey(rawBody: string, headers: Record<string, string>): string {
  return headers['svix-id'];
}
```

### 4.4 Event handlers

**`footprint.onboarding.completed`** — KYC terminal status:

```typescript
async function handleOnboardingCompleted(payload: FootprintEvent) {
  const { data } = payload;
  // data.fp_id = Footprint's user ID
  // data.status = 'pass' | 'fail' | 'none'
  // data.timestamp = ISO timestamp
  
  // Find our player by the Footprint user ID we stored at onboarding start
  const kycRecord = await db.kyc_status.findOne({ footprint_user_id: data.fp_id });
  if (!kycRecord) {
    logger.error('footprint_unknown_fp_id', { fpId: data.fp_id });
    return;
  }
  
  // Map Footprint status to our KYC level
  let newKycLevel: number;
  let footprintStatus: string;
  
  switch (data.status) {
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
  }
  
  await db.transaction(async (tx) => {
    await tx.kyc_status.update(kycRecord.id, {
      footprint_status: footprintStatus,
      footprint_completed_at: new Date(),
    });
    
    await tx.players.update(kycRecord.player_id, {
      kyc_level: newKycLevel,
      kyc_verified_at: data.status === 'pass' ? new Date() : null,
    });
  });
  
  // CRM event
  const eventName = data.status === 'pass' 
    ? 'player.kyc.verified'
    : 'player.kyc.failed';
  await events.emit(ctx, { name: eventName, data: { playerId: kycRecord.player_id } });
  
  // If KYC verified AND player has a pending redemption that was waiting for KYC,
  // auto-progress it to the cashier queue
  if (data.status === 'pass') {
    await processPendingRedemptionsAwaitingKyc(kycRecord.player_id);
  }
  
  // Push UI update so player sees status change in real-time
  await pusher.trigger(`private-player-${kycRecord.player_id}`, 'kyc-update', {
    status: footprintStatus,
    level: newKycLevel,
  });
}
```

**`footprint.user.manual_review`** — staff (theirs or ours) changed status:

```typescript
async function handleManualReview(payload: FootprintEvent) {
  const { data } = payload;
  // We don't know the new status from the webhook itself; we must fetch
  
  const kycRecord = await db.kyc_status.findOne({ footprint_user_id: data.fp_id });
  if (!kycRecord) return;
  
  // Fetch fresh status from Footprint API
  const userDetails = await footprint.getUser(data.fp_id);
  // Returns: { status, manual_review_status, ... }
  
  await db.kyc_status.update(kycRecord.id, {
    footprint_manual_review_status: userDetails.manual_review_status,
    footprint_status_last_synced: new Date(),
  });
  
  // If manual review resulted in approval, bump KYC level
  // If denial, drop KYC level and add compliance flag
  if (userDetails.manual_review_status === 'approved') {
    await db.players.update(kycRecord.player_id, {
      kyc_level: 2,
      kyc_verified_at: new Date(),
    });
  } else if (userDetails.manual_review_status === 'denied') {
    await db.players.update(kycRecord.player_id, { kyc_level: 0 });
    await db.compliance_flags.insert({
      player_id: kycRecord.player_id,
      flag_type: 'kyc_failed',
      severity: 'block',
      reason: 'KYC manual review denied',
    });
  }
  
  await audit.write(ctx, {
    action: 'kyc.manual_review_synced',
    resource_kind: 'player',
    resource_id: kycRecord.player_id,
    after: { manual_review_status: userDetails.manual_review_status },
  });
}
```

**`footprint.watchlist_check.completed`** — AML continuous monitoring result:

```typescript
async function handleWatchlistCheck(payload: FootprintEvent) {
  const { data } = payload;
  // data.fp_id, data.status ('pass' | 'fail'), data.checked_at
  
  const kycRecord = await db.kyc_status.findOne({ footprint_user_id: data.fp_id });
  if (!kycRecord) return;
  
  await db.kyc_status.update(kycRecord.id, {
    watchlist_last_check_at: new Date(),
    watchlist_last_status: data.status,
  });
  
  if (data.status === 'fail') {
    // === This is the "block redemption + manager review" path ===
    
    // 1. Add the compliance flag (redemption-only block, not full suspension)
    await db.compliance_flags.insert({
      player_id: kycRecord.player_id,
      flag_type: 'aml_watchlist',
      severity: 'block',
      reason: 'AML watchlist hit detected during continuous monitoring',
      // Custom: redemption-only block, not full account suspension
      metadata: {
        scope: 'redemption_only',
        footprint_checked_at: data.checked_at,
      },
    });
    
    // 2. Move any pending redemptions into AML hold sub-status
    await db.redemptions.update(
      { player_id: kycRecord.player_id, status: 'pending_review' },
      { status: 'aml_hold' }
    );
    
    // 3. Add to AML Hold Review queue (Manager+ role visibility)
    await db.aml_review_queue.insert({
      player_id: kycRecord.player_id,
      footprint_event_id: payload.event_id,
      created_at: new Date(),
      status: 'open',
    });
    
    // 4. Page on-call (SEV-2 — needs action within 48h)
    await pagerduty.trigger({
      severity: 'warning',
      title: `AML watchlist hit: player ${kycRecord.player_id}`,
      sla_hours: 48,
    });
    
    // 5. Audit log
    await audit.write(ctx, {
      action: 'aml_watchlist.flagged',
      resource_kind: 'player',
      resource_id: kycRecord.player_id,
      actor_kind: 'system',
    });
  }
  // If status='pass', just log; no action needed
}
```

The AML hold queue surfaces in admin per Doc 08 §7 — there'll be an "AML Hold" sub-tab in the Cashier section.

### 4.5 The KYC level progression model

Doc 03 v2 §2 defines `players.kyc_level` 0-3:

| Level | Meaning | Required for |
| --- | --- | --- |
| 0 | None / failed | Nothing — can't redeem, can play GC only |
| 1 | Basic (email + phone verified) | Reserved for future use |
| 2 | Verified (Footprint pass) | Redemption, SC play |
| 3 | Enhanced (manual review pass at high LTV) | High-value redemptions ($X+) |

Footprint webhook events drive transitions between 0 and 2. Level 3 is triggered by an internal rule: if player's lifetime deposits exceed $10K, the cashier flow asks them to complete an Enhanced Due Diligence flow before approving a redemption. Doc 07 covers this.

---

## 5. Alea webhooks

### 5.1 The integration model

Alea's integration model is API-driven for session launches and webhook-driven for round outcomes. The launch endpoint is the one you provided:

```
https://c21f969b5f03d33d-0.aleaplay.com
```

Where `c21f969b5f03d33d` is the operator identifier for CoinFrenzy.

### 5.2 Game session launch (NOT a webhook — included here for completeness)

When a player clicks "Play" on a game in the lobby:

```typescript
// packages/core/src/games/launch.ts

export async function launchGame(ctx: Context, playerId: string, gameId: string) {
  // 1. Validate eligibility (jurisdiction, RG, KYC level for SC play)
  const eligibility = await checkPlayEligibility(ctx, playerId, gameId);
  if (!eligibility.allowed) return err({ reason: eligibility.reason });
  
  // 2. Create a game session record
  const session = await db.game_sessions.insert({
    id: randomUUID(),
    player_id: playerId,
    game_id: gameId,
    currency: 'SC',  // or 'GC' depending on player choice
    started_at: new Date(),
    status: 'active',
  });
  
  // 3. Call Alea's launch API to get a session token
  const aleaSession = await alea.client.createSession({
    casinoSessionId: session.id,  // OUR session ID is what we get back later in webhooks
    playerId: playerId,
    gameId: gameId,
    currency: 'SC',
    balance: await wallets.getBalance(ctx, playerId, 'SC'),
    locale: 'en_US',
    returnUrl: `${env.PLAYER_BASE_URL}/games`,
  });
  
  // 4. Store Alea's reference IDs on our session
  await db.game_sessions.update(session.id, {
    alea_session_token: aleaSession.token,
    alea_play_url: aleaSession.playUrl,
  });
  
  // 5. Return the iframe URL for the frontend to load
  return ok({
    sessionId: session.id,
    playUrl: aleaSession.playUrl,
  });
}
```

The critical thing: **`casinoSessionId` is our internal session ID**, and Alea echoes it back in every subsequent round webhook. This is how we attribute rounds to sessions and players.

### 5.3 Subscribed webhook events

Alea fires webhooks for each game round outcome. The event taxonomy (we'll confirm exact names from the wiki during build):

```
round.bet           # Player placed a bet
round.win           # Round resolved with a win
round.refund        # Round refunded (rare — game error)
round.adjustment    # Operator-side adjustment

session.opened      # Game session started on Alea's side
session.closed      # Game session ended

balance.query       # Alea asking for player balance (synchronous response required)
balance.adjust      # Alea-side balance adjustment (rare)
```

**Important note about `balance.query`:** this is the only "webhook" that's actually synchronous and requires a response. Alea calls us when it needs to know a player's current balance (some games require this before each spin to prevent over-betting). The response must be returned within ~500ms.

This is NOT the same receiver pattern as other webhooks — it's an RPC call dressed as a webhook. We handle it on its own endpoint:

```typescript
// apps/web/app/api/webhooks/alea/v1/balance-query/route.ts

export async function POST(req: Request) {
  const rawBody = await req.text();
  const headers = Object.fromEntries(req.headers.entries());
  
  // Signature verification (same as other Alea webhooks)
  const verification = await verifyAlea(rawBody, headers);
  if (!verification.ok) return new Response('Invalid signature', { status: 401 });
  
  const { playerId, currency, casinoSessionId } = JSON.parse(rawBody);
  
  // Fast balance read (Redis-cached per Doc 04 §6)
  const balance = await wallets.getBalance(ctx, playerId, currency);
  
  return Response.json({
    balance: balance.current_balance,
    currency,
    timestamp: new Date().toISOString(),
  });
}
```

### 5.4 Signature verification

Alea uses HMAC-SHA256 with a shared secret (configured in their dashboard, stored in `ALEA_WEBHOOK_SECRET`):

```typescript
export async function verifyAlea(rawBody: string, headers: Record<string, string>): Promise<VerifyResult> {
  const signature = headers['x-alea-signature'];
  const timestamp = headers['x-alea-timestamp'];
  if (!signature || !timestamp) return { ok: false, error: 'missing_headers' };
  
  // Reject if timestamp is older than 5 minutes (replay protection)
  const age = Date.now() - parseInt(timestamp);
  if (age > 5 * 60 * 1000) return { ok: false, error: 'stale_timestamp' };
  
  // Signed payload: timestamp + raw body
  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = createHmac('sha256', env.ALEA_WEBHOOK_SECRET)
    .update(signedPayload)
    .digest('hex');
  
  if (!timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
    return { ok: false, error: 'signature_mismatch' };
  }
  
  return { ok: true };
}
```

**Verify this signature pattern against Alea's actual wiki during the build.** This is my best guess based on industry standard; the exact header names may differ.

### 5.5 Round event handlers

**`round.bet` and `round.win`** — the two events that drive the ledger:

```typescript
async function handleAleaRoundBet(payload: AleaEvent) {
  const { roundId, casinoSessionId, playerId, gameId, amount, currency } = payload;
  
  // 1. Idempotency check at the round level
  const existingRound = await db.game_rounds.findOne({ external_round_id: roundId });
  if (existingRound) {
    logger.info('alea_round_bet_duplicate', { roundId });
    return;
  }
  
  // 2. Find or create our session record
  const session = await db.game_sessions.findById(casinoSessionId);
  if (!session) {
    logger.error('alea_round_unknown_session', { casinoSessionId, roundId });
    // Don't crash — Alea will retry. May have arrived before session.opened.
    throw new Error('session_not_found_retry');
  }
  
  // 3. Insert the round record (bet leg)
  const round = await db.game_rounds.insert({
    id: randomUUID(),
    session_id: session.id,
    player_id: playerId,
    game_id: gameId,
    external_round_id: roundId,
    bet_amount: amount,
    win_amount: 0,  // will update on win event
    currency: currency,
    status: 'bet_placed',
    bet_at: new Date(),
  });
  
  // 4. Write the bet ledger entries per Doc 04 §3.2
  //    pair_id = round.id (will be reused for the matching win)
  await ledger.write(ctx, {
    source: 'bet',
    sourceId: round.id,
    pairId: round.id,
    entries: [
      { account: playerWallet(playerId, currency), leg: 'debit',  amount, subBucket: drainOrder(playerId, currency) },
      { account: houseWinnings(currency),          leg: 'credit', amount },
    ],
  });
  
  // 5. Per-bonus playthrough tracking (Doc 06)
  //    Each contributing bet against a player's active bonus advances playthrough
  await bonusEngine.recordBet(ctx, {
    playerId,
    amount,
    currency,
    gameId,
    roundId: round.id,
  });
  
  // 6. CRM event (high-volume — only emit per N to avoid flooding player_events)
  if (shouldSampleBetEvent(playerId)) {  // e.g. every 10th bet
    await events.emit(ctx, {
      name: 'player.game.bet',
      data: { playerId, gameId, amount: amount.toString(), currency },
    });
  }
}

async function handleAleaRoundWin(payload: AleaEvent) {
  const { roundId, amount, currency } = payload;
  
  // 1. Find our round record (must exist from prior bet event)
  const round = await db.game_rounds.findOne({ external_round_id: roundId });
  if (!round) {
    // Win without a matching bet — SEV-1, see Doc 04 §9.6
    logger.error('alea_round_win_without_bet', { roundId });
    await pagerduty.trigger({ severity: 'critical', title: 'Alea win event without matching bet' });
    return;
  }
  
  // 2. Update round record
  await db.game_rounds.update(round.id, {
    win_amount: amount,
    status: 'resolved',
    won_at: new Date(),
  });
  
  // 3. Write the win ledger entries per Doc 04 §3.3
  //    Same pair_id as the bet → bet+win are one logical "round" in the ledger
  if (amount > 0) {
    await ledger.write(ctx, {
      source: 'win',
      sourceId: round.id,
      pairId: round.id,
      entries: [
        { account: houseWinnings(currency),                       leg: 'debit',  amount },
        { account: playerWallet(round.player_id, currency),       leg: 'credit', amount, subBucket: 'earned' },
      ],
    });
  }
  
  // 4. Big win detection — fires special CRM flow
  if (amount > BIG_WIN_THRESHOLD_SC) {
    await events.emit(ctx, {
      name: 'player.game.big_win',
      data: { playerId: round.player_id, gameId: round.game_id, amount: amount.toString() },
    });
  }
  
  // 5. Real-time UI update
  await pusher.trigger(`private-player-${round.player_id}`, 'balance-update', {
    reason: 'win',
  });
}
```

**The big invariant: every `round.win` must reference a `round.bet` we previously received.** If Alea sends a win without a prior bet (impossible under normal operation), it's a SEV-1 and pages on-call. Doc 04 §9.6 covers this in more detail.

**Out-of-order delivery:** if `round.win` arrives before `round.bet` (rare, but possible if events fan out across different routes), the win handler's "round not found" path throws an exception → Inngest retries with backoff. By the second or third retry, the bet event has arrived and persisted, and the win handler succeeds.

### 5.6 Reconciliation

Per Doc 04 §7.2, a nightly job pulls Alea's round history for the previous day and compares to ours. Any divergence (missing rounds on our side, amount mismatches) triggers SEV-1 and a replay.

---

## 6. Radar — the polled + pushed hybrid

### 6.1 Why Radar is different

Radar isn't really webhook-first for our use case. We use Radar's REST API directly at three points:

**Synchronous calls (most usage):**
- At signup: `GET /v1/geocode/ip` to determine state/country from request IP
- At purchase: same call, refusing if state is blocked
- At redemption request: same call + check fraud signals

**Webhook events (lower volume):**
- If you set up geofence-based fraud rules in the Radar dashboard, certain user actions can trigger webhooks. For v1 we don't use geofences this way.

### 6.2 The synchronous IP geocode pattern

```typescript
// packages/core/src/adapters/radar/geocode.ts

export async function geocodeRequestIp(request: Request): Promise<GeoResult> {
  const clientIp = extractClientIp(request);
  
  const response = await fetch(
    `https://api.radar.io/v1/geocode/ip?ip=${clientIp}`,
    { headers: { Authorization: env.RADAR_SECRET_KEY } }
  );
  
  if (!response.ok) {
    // If Radar is down, we don't want to block all signups/purchases.
    // Use a degraded mode: fall back to MaxMind GeoLite2 lookup,
    // or accept the request and flag for review.
    logger.warn('radar_geocode_failed_falling_back');
    return { state: null, country: null, proxy: false, degraded: true };
  }
  
  const data = await response.json();
  
  return {
    state: data.address?.stateCode,
    country: data.address?.countryCode,
    city: data.address?.city,
    proxy: data.proxy ?? false,
    ip: clientIp,
  };
}
```

### 6.3 Track API integration for fraud signals

Radar's Track API is more about ongoing fraud signal collection. When a player logs in, we send a track event:

```typescript
// On every player login
await fetch('https://api.radar.io/v1/track', {
  method: 'POST',
  headers: { Authorization: env.RADAR_SECRET_KEY },
  body: JSON.stringify({
    userId: playerId,
    deviceId: clientDeviceId,
    latitude: null,  // we don't ask for GPS; just use IP
    longitude: null,
    accuracy: null,
    metadata: {
      action: 'login',
    },
  }),
});
```

The response includes the `fraud` object Radar maintains for that user:

```json
{
  "fraud": {
    "proxy": false,
    "mocked": false,
    "compromised": false,
    "inaccurate": false,
    "jumped": false,
    "sharing": false,
    "lastProxyAt": null,
    "lastMockedAt": null
  }
}
```

We store these signals on `geo_history` per Doc 03 v2 and they feed into the redemption risk score in Doc 07.

### 6.4 No webhook handler needed for v1

For v1, Radar interaction is API-only. If we later set up geofence-based fraud triggers, we'll add a webhook handler then.

---

## 7. SendGrid and Twilio webhooks

These are simpler — engagement signals fed into the CRM event taxonomy (Doc 11 §1.8).

### 7.1 SendGrid events

```
delivered       # Email accepted by receiving server
opened          # Pixel tracking fired
clicked         # Link in email clicked
bounced         # Email rejected
spamreport      # Recipient marked as spam
unsubscribe     # Recipient unsubscribed
```

Verified via signed webhook (`X-Twilio-Email-Event-Webhook-Signature` header) using SendGrid's verification public key.

Handler updates `crm_message_log` with the new status + emits a `player.email.*` CRM event. Unsubscribe events flip `players.email_consent = false` immediately and add to `crm_suppression` per Doc 11 §7.2.

### 7.2 Twilio events

```
sent
delivered
failed
undelivered
```

Plus the critical **inbound SMS event** — when a player replies to a marketing SMS with STOP, HELP, etc.:

```typescript
async function handleTwilioInbound(payload: TwilioEvent) {
  const { From, Body } = payload;
  const upper = Body.trim().toUpperCase();
  
  // STOP / UNSUBSCRIBE handling — TCPA compliance
  if (['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'].includes(upper)) {
    const player = await db.players.findOne({ phone: From });
    if (player) {
      await db.players.update(player.id, { sms_consent: false });
      await db.crm_suppression.insert({
        email_or_phone: From,
        reason: 'TCPA STOP keyword',
        source: 'tcpa_stop',
      });
    }
    // Twilio auto-sends a confirmation reply for STOP keywords; we don't have to
    return;
  }
  
  if (upper === 'HELP') {
    // Twilio also auto-replies to HELP; we just log
    return;
  }
  
  // Other inbound messages → route to support ticket
  await db.support_tickets.insert({
    channel: 'sms',
    from: From,
    message: Body,
    status: 'unassigned',
  });
}
```

---

## 8. Health monitoring

Per Doc 08 §13 (Integrity page), we maintain real-time health stats per integration:

```sql
-- integration_health table from Doc 03 v2 §11
create table integration_health (
  provider                  text primary key,
  status                    text not null,     -- 'green' | 'yellow' | 'red'
  last_seen_at              timestamptz,
  last_success_at           timestamptz,
  last_failure_at           timestamptz,
  error_count_1h            int not null default 0,
  p99_latency_ms_1h         int,
  consecutive_failures      int not null default 0,
  updated_at                timestamptz not null default now()
);
```

Every webhook receipt (success OR failure) updates this table. The dashboard subscribes via SSE and tiles re-color when status changes.

Thresholds:
- **Green** — last successful event within 5 minutes, error rate < 1%
- **Yellow** — last success within 30 minutes OR error rate 1-5%
- **Red** — no success in 30+ minutes OR error rate > 5% OR 3+ consecutive failures

Red status triggers PagerDuty. Yellow status posts to Slack `#ops-alerts`.

---

## 9. Failure modes and recovery

### 9.1 Webhook arrives but our handler crashes

The raw event is already in `pending_webhooks` (Step 5 of universal receiver). The Inngest function fails → retries with exponential backoff → eventually succeeds or marks as `failed` after 5 attempts.

Failed events surface in the Integrity page as a counter. Admin can manually trigger reprocess from there.

### 9.2 Provider sends a flood of duplicates

Rare but possible during provider-side incidents. The receiver-level idempotency check (Step 4) short-circuits duplicates within ~1ms. We acknowledge to the provider, do no further work. The `integration_health.duplicate_count_1h` metric ticks up.

### 9.3 Provider goes silent

Our health monitoring catches it. If Finix stops sending events for 30+ minutes, status goes red. PagerDuty pages on-call. Investigation: check Finix status page, check our endpoint logs, check Finix dashboard for delivery failures (they often retry into the abyss when our endpoint is misconfigured).

Recovery mechanisms:
- **Finix:** has a "replay events" feature in their dashboard. Use it to resend the missed window.
- **Footprint:** Svix dashboard has a retry mechanism per event ID.
- **Alea:** has a "fetch missed rounds" API; the reconciliation job catches missed rounds nightly anyway.

### 9.4 Signature verification fails

Either our secret is wrong (config issue), the provider is misconfigured, or someone is attacking us. In all three cases:
- Return 401
- Log to audit with raw headers (for debugging)
- Increment a `signature_failure_count` metric
- If > 10 failures in 5 minutes from the same provider, PagerDuty alert

### 9.5 The "webhook never arrived for a transaction we expected" problem

The cleanest defense: **don't depend on webhooks for state we already know.** When we create a Finix transfer, we know we created it. We track its status synchronously initially, and only RELY on the webhook for FINAL state confirmation. A poller runs every 5 minutes for any Finix transfer in `pending` status older than 10 minutes:

```typescript
// apps/worker/src/jobs/poll-stuck-transfers.ts

export const pollStuckTransfers = inngest.createFunction(
  { id: 'poll-stuck-transfers' },
  { cron: '*/5 * * * *' },
  async () => {
    const stuck = await db.purchases.find({
      status: 'pending',
      created_at: { lt: subMinutes(new Date(), 10) },
    });
    
    for (const p of stuck) {
      const transfer = await finix.getTransfer(p.finix_transfer_id);
      if (transfer.state === 'SUCCEEDED' || transfer.state === 'FAILED') {
        // Webhook was lost; manually fire the handler
        await handleFinixTransferSucceeded({ entity: transfer });
      }
    }
  }
);
```

Same pattern for redemptions. Same pattern for KYC verifications. Belt and suspenders.

---

## 10. The replay tool

For Doc 13 (Migration) cutover, we need to replay 30 days of captured webhooks. The replay tool is:

```typescript
// packages/core/src/migration/replay-webhooks.ts

export async function replayCapturedWebhooks(
  fromTimestamp: Date,
  toTimestamp: Date,
  options: { dryRun?: boolean } = {}
) {
  const events = await db.pending_webhooks.find({
    received_at: { gte: fromTimestamp, lt: toTimestamp },
    status: { in: ['received', 'processing'] },  // not yet processed
  });
  
  logger.info('replay_starting', { count: events.length });
  
  for (const event of events) {
    if (options.dryRun) {
      logger.info('replay_would_process', { id: event.id, type: event.event_type });
      continue;
    }
    
    // Send to Inngest as if newly received
    // The receiver-level idempotency in our handlers means already-processed
    // events are no-ops
    await inngest.send({
      name: `webhook/${event.provider}.received`,
      data: { idempotencyKey: event.idempotency_key, eventType: event.event_type },
    });
  }
  
  // Mark these events as replayed (status updates after Inngest processes)
  await db.pending_webhooks.update(
    { id: { in: events.map(e => e.id) } },
    { status: 'replayed_for_migration' }
  );
}
```

Used cutover night per Doc 13 §6.2. Tested 3+ times on staging before cutover.

---

## 11. Cross-references

- **Doc 02 §6** — transport layer pattern that all webhook handlers follow
- **Doc 03 v2 §11** — `integration_health` table
- **Doc 03 v2 (new section)** — `pending_webhooks` table (add to v3 patch)
- **Doc 04 §3** — ledger transaction types invoked by webhook handlers
- **Doc 04 §5** — idempotency model that webhook handlers leverage
- **Doc 06** — bonus engine called by purchase/round handlers
- **Doc 07** — redemption flow called by Finix payout handler
- **Doc 08 §13** — Integrity page that visualizes integration_health
- **Doc 09** — security model for webhook secret rotation, HMAC patterns
- **Doc 11 §1** — CRM event taxonomy that webhook handlers emit
- **Doc 13 §6** — webhook replay for migration cutover

---

## 12. What's next

Doc 06 (Bonus Engine & Playthrough) is next. It builds on the bet/win ledger pattern here and the round.bet event handler to drive playthrough progression.
