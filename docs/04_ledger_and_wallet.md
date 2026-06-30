# CoinFrenzy Platform — Ledger & Wallet

**Document:** 04 of 13
**Reads:** Doc 01 (Architecture), Doc 02 (Core Service Layer), Doc 03 (Data Model)
**Read before:** Doc 05 (Webhooks), Doc 06 (Bonus Engine), Doc 07 (Redemption)
**Purpose:** Define the EXACT write path, idempotency contract, balance reconciliation, and failure recovery for every coin movement. This document is the one a regulator would read first.

---

## 1. The four laws of the ledger

These are non-negotiable. Every decision below derives from them. If a
proposed change contradicts any of these, the change is wrong.

### Law 1: Every coin movement is a balanced double-entry transaction.

For every credit there is an equal and opposite debit. If a player bets
1 SC, that SC moves from `player_wallet` → `house_winnings` (or wherever
the bet flows). The transaction has two ledger entries that sum to zero.

This is how banks have done accounting for 700 years. We do not invent
something new.

### Law 2: The ledger is immutable.

No UPDATE. No DELETE. Ever. Enforced by Postgres rules at the table
level, not by application code. An accidental migration cannot wipe
the ledger. A rogue admin cannot quietly modify a row.

If we make a mistake, we fix it by writing a *correcting entry*, never
by editing or deleting the original.

### Law 3: Every write is idempotent.

The same logical event must produce the exact same ledger state, no
matter how many times its handler runs. Webhooks retry. Workers crash
and resume. Network packets duplicate. The system must produce one
ledger entry regardless.

Idempotency is enforced by a unique key on `(source, source_id, leg)`.
Try to write a duplicate → Postgres rejects it → application no-ops
and moves on.

### Law 4: The wallet balance equals the ledger sum, always.

`wallets.current_balance` is a denormalized cache of
`SUM(ledger_entries.amount WHERE account_id = wallet.id and currency = wallet.currency)`.

It is updated inside the *same Postgres transaction* as the ledger
write. If the wallet update fails, the ledger write rolls back. If the
ledger write fails, the wallet update rolls back. There is no window
where they are out of sync.

A nightly reconciliation job re-computes the sum and compares. Any
drift → SEV-1 page to on-call. We expect zero drift forever.

---

## 2. The account model

Every ledger entry references an *account*. Accounts are typed:

| Account kind             | Description                                                    | Currency  | Who owns         | Sign convention             |
| ------------------------ | -------------------------------------------------------------- | --------- | ---------------- | --------------------------- |
| `player_wallet`          | Player's spendable balance                                     | GC or SC  | one player       | + when balance grows         |
| `pending_purchase`       | USD held while Finix transfer is pending                       | USD       | one player       | + during pending             |
| `pending_redemption`     | SC held while redemption is in review/pending                  | SC        | one player       | + during pending             |
| `house_bank`             | USD revenue (collected from purchases, paid to redemptions)    | USD       | the house        | + when house has money       |
| `house_winnings_gc`      | GC won by the house from player losses                         | GC        | the house        | + when house wins            |
| `house_winnings_sc`      | SC won by the house from player losses                         | SC        | the house        | + when house wins            |
| `bonus_pool_gc`          | GC reserved to fund GC bonus awards                            | GC        | the house        | + when reserved              |
| `bonus_pool_sc`          | SC reserved to fund SC bonus awards                            | SC        | the house        | + when reserved              |
| `amoe_pool_sc`           | SC reserved for AMOE / EasyScam mail-in entries                | SC        | the house        | + when reserved              |
| `affiliate_payable`      | SC the house owes affiliates (Lightning Bolt credits pending)  | SC        | the house        | + when owed                  |
| `internal_account_sink`  | Where comp'd money flows for `is_internal_account = true`      | GC or SC  | the house        | excluded from GGR/NGR        |

**Account IDs:**
- For `player_wallet`, `pending_purchase`, `pending_redemption`: the `account_id` is the player's `wallets.id` (or a virtual ID derived from `players.id + account_kind` for accounts without their own row).
- For house/pool accounts: there's one row each in a `house_accounts` table. IDs are stable across the platform.

**Why typed accounts and not just "player owes house":** because regulators ask things like "show me all SC outstanding to players as of March 1." That query is `SUM(ledger_entries.amount WHERE account_kind = 'player_wallet' AND currency = 'SC' AND created_at <= '2026-03-01')`. The account kind is the filter that makes that query meaningful.

---

## 3. The 12 transaction types — exhaustive list

Every coin movement in the platform is one of these. They are listed by
the `source` field on `ledger_entries`. Adding a 13th type requires
explicit architectural review.

### 3.1 `purchase` — player buys a coin package

When Finix confirms a purchase via webhook:

```
LEG 1 (debit):  house_bank          +USD
LEG 2 (credit): player_wallet GC    +base_gc + bonus_gc
LEG 3 (credit): player_wallet SC    +base_sc + bonus_sc
LEG 4 (debit):  house_winnings_gc   -(base_gc + bonus_gc)   [funding the player]
LEG 5 (debit):  house_winnings_sc   -(base_sc + bonus_sc)
```

Wait — that's 5 entries, not 2. Let me clarify.

**A "transaction" is a `pair_id` group.** A single user-visible event
(one purchase) generates multiple ledger entries within one `pair_id`.
The invariant is that within a `pair_id`, the entries balance to zero
*per currency*. So:

- Within currency USD: `+amount_usd` (house_bank) + `−amount_usd` (player paid) = 0 from the player's external-world perspective
- Within currency GC: `+gc_to_player` (player_wallet) + `−gc_to_player` (house funding) = 0
- Within currency SC: `+sc_to_player` (player_wallet) + `−sc_to_player` (house funding) = 0

But since the USD didn't come from one of our accounts (it came from the
player's bank via Finix), we model the player's USD outflow as a virtual
"external" entry. In practice we record:

```
pair_id = uuid_for_this_purchase
source  = 'purchase'
source_id = purchases.id

Entry 1: debit  external          USD  amount_usd       (player's bank)
Entry 2: credit house_bank        USD  amount_usd       (our settlement account)
Entry 3: debit  house_winnings_gc GC   total_gc_awarded (we fund the GC)
Entry 4: credit player_wallet GC  GC   total_gc_awarded (player receives GC)
Entry 5: debit  house_winnings_sc SC   total_sc_awarded (we fund the SC)
Entry 6: credit player_wallet SC  SC   total_sc_awarded (player receives SC)
```

6 entries per purchase. They share one `pair_id`. They are written
atomically in one Postgres transaction. The `external` account is a
synthetic kind for cash flowing in from outside the system; balances
on it are informational only (not reconciled the same way).

**Sub-bucket assignment for SC entries:**
- Free SC included with package → `sub_bucket = 'purchased'`, playthrough = 1x
- Bonus SC from `bonuses.id` linked to the package → `sub_bucket = 'bonus'`, playthrough = whatever that bonus specifies (default 3x)
- Promo code bonus SC → `sub_bucket = 'promo'`, playthrough per promo code config

Each sub-bucket fills the correspondingly-named column on `wallets`
(e.g. `balance_purchased` += value).

**Internal accounts (`is_internal_account = true`):** the player-wallet
entries route to `internal_account_sink` instead of `player_wallet`,
so internal accounts don't show in GGR/NGR reporting. From an
accounting perspective the entries still balance; from a reporting
perspective they're invisible.

### 3.2 `bet` — player places a bet in a game

```
pair_id = uuid_for_this_round
source  = 'bet'
source_id = game_rounds.id

Entry 1: debit  player_wallet   amount  currency=GC or SC
Entry 2: credit house_winnings  amount  currency=GC or SC
```

Two entries. SC sub-bucket: depends on which sub-buckets the player
currently has SC in. We deduct in a fixed order: `purchased` first,
then `earned`, then `promo`, then `bonus` last. **Bonus SC is spent
last** so playthrough is enforced — the bonus is only "spent" once
the player has used up their purchased/earned/promo SC.

This is the single most common transaction in the system. 100M+ per
month at scale. It is the hot path.

### 3.3 `win` — player wins from a game round

```
pair_id = uuid_for_this_round       (same pair as the bet!)
source  = 'win'
source_id = game_rounds.id

Entry 1: debit  house_winnings  amount  currency=GC or SC
Entry 2: credit player_wallet   amount  currency=GC or SC
```

**Bet and win share the same `pair_id`.** They are written together
when the game round finalizes. From Alea's perspective, the round is
atomic — either both bet and win happen or neither does. We mirror that.

SC sub-bucket for the win: deposited into `earned`. Wins from bonus
play accumulate in `earned`, which can be redeemed *after* playthrough
on the originating bonus completes.

**Free spins / bonus rounds:** the bet leg uses `sub_bucket = 'bonus'`
because the free spin is funded by the bonus. The win leg goes to
`sub_bucket = 'earned'`. Net effect on the bonus balance: it decreases
by the bet (which was zero from the player's POV) and the player gets
the win as earned SC.

### 3.4 `bonus_award` — player receives a bonus

Triggered by signup, tier-up, daily login, manual admin grant, promo
code, etc.

```
pair_id = uuid_for_this_award
source  = 'bonus_award'
source_id = bonuses_awarded.id

Entry 1: debit  bonus_pool_sc   amount  (or _gc)
Entry 2: credit player_wallet   amount  sub_bucket = 'bonus'
```

Simultaneously, `bonuses_awarded.playthrough_required` is set to:
- For SC bonuses: `bonus.playthrough_multiplier * sc_amount` (default 3x)
- For GC bonuses: 0 (GC has no playthrough — it's already non-redeemable)

`wallets.playthrough_required += playthrough_required` and
`wallets.playthrough_progress` stays where it is.

### 3.5 `playthrough_release` — completed playthrough converts bonus SC to purchased SC

When `bonuses_awarded.playthrough_progress >= playthrough_required`,
the remaining `bonus` SC for that award is *reclassified* (not moved
in or out — just relabeled).

```
pair_id = uuid_for_this_release
source  = 'playthrough_release'
source_id = bonuses_awarded.id

Entry 1: debit  player_wallet   amount  sub_bucket = 'bonus'
Entry 2: credit player_wallet   amount  sub_bucket = 'earned'
```

This is the only transaction type where *both* legs hit the same
account. It's a sub-bucket reclassification.

Why model it as a ledger entry instead of just an UPDATE? Because the
ledger is the audit trail. A regulator asking "show me when this
player's bonus became withdrawable" needs to see this event. A
silent UPDATE doesn't leave that trail.

### 3.6 `redemption_request` — player requests cash out

Player asks to redeem N SC. We move it from `player_wallet` to
`pending_redemption`. It's locked from spending while pending.

```
pair_id = uuid_for_this_redemption
source  = 'redemption_request'
source_id = redemptions.id

Entry 1: debit  player_wallet         amount  SC  sub_bucket='earned'+'purchased' (FIFO)
Entry 2: credit pending_redemption    amount  SC
```

Eligibility checks before this transaction can fire:
- Player KYC level ≥ required level (default 2)
- Player not self-excluded or RG-blocked
- Player has sufficient redeemable SC (= `balance_earned + balance_purchased`, NOT bonus or promo)
- Player not in NY
- Redemption amount ≥ minimum (e.g. $1)
- Sub-bucket sum check: only `earned` and `purchased` count toward redeemable

### 3.7 `redemption_approve` — admin or auto-rule approves redemption

The SC stays in pending_redemption; an admin marks it approved. No
ledger entry needed yet — approval just flips `redemptions.status`.

(I'm intentionally NOT writing a ledger entry here because no money
moves. Status change goes to `audit_log` per Doc 09.)

### 3.8 `redemption_paid` — Finix confirms cash out succeeded

```
pair_id = same as redemption_request
source  = 'redemption_paid'
source_id = redemptions.id

Entry 1: debit  pending_redemption  amount  SC
Entry 2: credit external            amount  SC      (SC leaves the system)
Entry 3: debit  house_bank          amount  USD
Entry 4: credit external            amount  USD     (USD leaves to player's bank)
```

The SC is destroyed (returned to nothing) — it has been "converted" to
USD which has been paid out. Both currencies appear because SC→USD
is the realization moment.

### 3.9 `redemption_rejected` — admin rejects, SC returns to player

```
pair_id = same as redemption_request
source  = 'redemption_rejected'
source_id = redemptions.id

Entry 1: debit  pending_redemption  amount  SC
Entry 2: credit player_wallet       amount  SC      (returned to original sub_buckets, preserved on the redemption record)
```

The original sub-bucket breakdown is preserved on the redemption
record so we can restore exactly which bucket the SC came from.

### 3.10 `purchase_refund` — chargeback or reversal

```
pair_id = uuid_for_this_refund
source  = 'purchase_refund'
source_id = purchases.id

Entry 1: debit  player_wallet GC   gc_to_claw_back   (player loses GC)
Entry 2: credit house_winnings_gc  gc_to_claw_back
Entry 3: debit  player_wallet SC   sc_to_claw_back
Entry 4: credit house_winnings_sc  sc_to_claw_back
Entry 5: debit  house_bank         amount_usd
Entry 6: credit external           amount_usd        (USD goes back to player)
```

**Edge case:** what if the player has already spent the SC/GC we're
clawing back? Their wallet balance goes negative. We allow this and
mark the player with a `compliance_flags` entry of severity `block`.
They are frozen from gameplay and redemption until an admin resolves.

This is the single most painful transaction in the system. Doc 07
specs the resolution flow.

### 3.11 `admin_adjustment` — manual coin adjustment by master admin

```
pair_id = uuid_for_this_adjustment
source  = 'admin_adjustment'
source_id = admin_adjustments.id     [new table — see below]

Entry 1: debit  source_account      amount  currency  (e.g. bonus_pool_sc or house_winnings_sc)
Entry 2: credit player_wallet       amount  currency  (or the reverse for clawbacks)
```

**Restricted:** only master admin role can fire. Every adjustment
writes to `audit_log` with the admin's ID, IP, reason, and approval
flow if amount > $1,000.

**New table needed (patch Doc 03):**

```sql
create table admin_adjustments (
  id              uuid primary key default gen_random_uuid(),
  player_id       uuid not null references players(id),
  admin_id        uuid not null references admins(id),
  
  amount          numeric(20,4) not null,
  currency        text not null,
  sub_bucket      text,         -- which sub_bucket on the player_wallet
  
  reason          text not null,
  reason_category text not null, -- 'support_compensation' | 'goodwill' | 'correction' | 'fraud_clawback' | 'comp'
  
  requires_approval boolean not null default false,
  approved_by     uuid references admins(id),
  approved_at     timestamptz,
  
  created_at      timestamptz not null default now()
);
```

### 3.12 `affiliate_payout` — Lightning Bolt credit to affiliate's player account

```
pair_id = uuid_for_this_payout
source  = 'affiliate_payout'
source_id = affiliate_payouts.id

Entry 1: debit  affiliate_payable   amount  SC
Entry 2: credit player_wallet       amount  SC   sub_bucket='earned'
```

The affiliate's player wallet receives the SC as `earned` so it's
immediately redeemable (no playthrough on affiliate payouts).

---

## 4. The write path — exact transaction shape

Every ledger write follows this Postgres transaction pattern. This is
what `core/ledger.write()` does internally:

```typescript
export async function write(
  ctx: Context,
  spec: TransactionSpec
): Promise<Result<LedgerWriteResult, LedgerError>> {
  
  return ctx.db.transaction(
    { isolationLevel: 'serializable' },     // step 1
    async (tx) => {
      // step 2: dedupe
      const existing = await tx.query(
        'SELECT 1 FROM ledger_entries WHERE source=$1 AND source_id=$2 LIMIT 1',
        [spec.source, spec.sourceId]
      );
      if (existing.rowCount > 0) {
        return ok({ status: 'duplicate', noop: true });
      }
      
      // step 3: validate balanced
      assertBalanced(spec);   // throws if entries don't sum to zero per currency
      
      // step 4: insert all entries atomically
      const pairId = randomUUID();
      const insertedEntries = [];
      for (const entry of spec.entries) {
        const inserted = await tx.query(
          `INSERT INTO ledger_entries (
            source, source_id, idempotency_key, pair_id, leg,
            account_kind, account_id, amount, currency, sub_bucket,
            player_id, metadata
          ) VALUES (...) RETURNING *`,
          [...]
        );
        insertedEntries.push(inserted.rows[0]);
      }
      
      // step 5: update wallet balances atomically (in the same tx)
      const walletUpdates = computeWalletUpdates(insertedEntries);
      for (const upd of walletUpdates) {
        await tx.query(
          `UPDATE wallets 
           SET current_balance = current_balance + $1,
               balance_${upd.sub_bucket} = balance_${upd.sub_bucket} + $1,
               updated_at = now()
           WHERE id = $2`,
          [upd.delta, upd.walletId]
        );
      }
      
      // step 6: compute balance_after for player_wallet entries
      // and store in the just-inserted ledger entries
      // (this is so a single entry has its post-state for fast audits)
      for (const entry of insertedEntries) {
        if (entry.account_kind === 'player_wallet') {
          const bal = await tx.query(
            'SELECT current_balance FROM wallets WHERE id = $1',
            [entry.account_id]
          );
          await tx.query(
            'UPDATE ledger_entries SET balance_after = $1 WHERE id = $2',
            [bal.rows[0].current_balance, entry.id]
          );
        }
      }
      
      // step 7: invalidate Redis wallet cache
      // (deferred via ctx.afterCommit hook so we only invalidate on success)
      ctx.afterCommit(() => 
        redis.del(`wallet:${spec.playerId}:GC`, `wallet:${spec.playerId}:SC`)
      );
      
      return ok({ status: 'written', pairId, entries: insertedEntries });
    }
  );
}
```

**Why `serializable` isolation:** prevents two concurrent transactions
from both reading a wallet balance, both deciding to deduct, and both
writing — leaving the wallet negative. Serializable forces them to
serialize. Cost: ~5-10% slower than READ COMMITTED. Worth it for money.

**Postgres rule for the UPDATE on `ledger_entries.balance_after` in
step 6:** the table-level RULE that rejects UPDATE breaks step 6.
Resolution: `balance_after` is the only mutable column, allowed via a
narrower trigger:

```sql
-- Allow UPDATE only for balance_after column, never for any others
create or replace function ledger_entries_update_guard() returns trigger as $$
begin
  if row(new.*) is distinct from row(old.*) and 
     row(new.source, new.source_id, new.pair_id, new.leg, new.amount, 
         new.currency, new.account_id, new.account_kind, new.created_at, 
         new.player_id, new.metadata, new.sub_bucket, new.idempotency_key) 
     is distinct from 
     row(old.source, old.source_id, old.pair_id, old.leg, old.amount,
         old.currency, old.account_id, old.account_kind, old.created_at,
         old.player_id, old.metadata, old.sub_bucket, old.idempotency_key) then
    raise exception 'Ledger entries are immutable except for balance_after';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger ledger_entries_immutable_guard
  before update on ledger_entries
  for each row execute function ledger_entries_update_guard();
```

The DELETE rule from Doc 03 stays. UPDATE is now allowed only for
`balance_after`. This is the single carve-out and it's narrow.

---

## 5. Idempotency — the discipline

### 5.1 The idempotency key contract

Every external trigger of a ledger write carries a unique key. We
hash that key into the `(source, source_id)` composite that's
constrained to be unique.

| Trigger              | source_id origin                      | Example                      |
| -------------------- | ------------------------------------- | ---------------------------- |
| Finix purchase       | Finix `transfer.id`                   | `TRe6M1EPGTgJeUX5gnsNuq33`   |
| Finix payout         | Our `redemption.id`                   | `77740212-777d-4263-...`     |
| Alea game round      | Alea `roundId`                        | provider-supplied            |
| Bonus award          | Our `bonuses_awarded.id`              | uuid we generate             |
| Playthrough release  | Our `bonuses_awarded.id`              | uuid (reused, source distinguishes leg) |
| Admin adjustment     | Our `admin_adjustments.id`            | uuid                         |
| Refund               | Our `refunds.id`                      | uuid                         |

### 5.2 What happens on duplicate

Step 2 of the write path checks for an existing entry. If found:
- Return `ok({ status: 'duplicate', noop: true })`
- Log at INFO level (not WARN) — duplicates are *expected* under retry
- The caller treats this as success

This is what makes the system retry-safe. Webhook retried 5 times →
first one writes, four are no-ops, all return 200.

### 5.3 Idempotency window

The unique constraint is permanent. A duplicate from 2 years later is
still rejected. This is correct: a webhook replayed after a long delay
must not double-credit a player.

For external IDs we don't control (Finix, Alea), the provider's ID
naturally scopes uniqueness. For our own IDs, we generate UUIDs which
collide with cryptographic improbability.

### 5.4 The "what if the write succeeded but I crashed before returning 200" problem

Classic distributed systems trap. Sequence:

1. Webhook arrives
2. We write ledger entries successfully
3. We commit the transaction
4. Server crashes before sending HTTP 200
5. Provider retries
6. Step 2 of write path finds existing entries → returns `duplicate` → 200 OK

The retry safely no-ops. We're good. This is the core property of
idempotent design and why we don't need distributed locks.

---

## 6. Balance reads — the fast path

Wallet balances are read on every page load. They have to be fast.

### 6.1 Read order

```typescript
async function getBalance(ctx, playerId, currency) {
  // 1. Try Redis (10ms p99 target)
  const cached = await redis.get(`wallet:${playerId}:${currency}`);
  if (cached) return parseWalletSnapshot(cached);
  
  // 2. Miss — read from Postgres (still fast, < 20ms)
  const row = await ctx.db.query(
    `SELECT * FROM wallets WHERE player_id = $1 AND currency = $2`,
    [playerId, currency]
  );
  const wallet = row[0];
  
  // 3. Populate cache with TTL (10 minutes)
  await redis.setex(
    `wallet:${playerId}:${currency}`,
    600,
    JSON.stringify(wallet)
  );
  
  return wallet;
}
```

### 6.2 Cache invalidation

The `afterCommit` hook in the write path deletes the cache keys.
Reasoning:

- `afterCommit` fires only on successful transaction commit (not on rollback)
- Cache delete (not update) — we don't write stale data; next read re-fetches from DB
- DELETE is idempotent — repeated invalidation is harmless

**Race condition handled:** if a read happens between transaction
commit and cache invalidation, the read populates the cache with the
old value, then invalidation deletes it, then next read goes to DB
and gets the fresh value. Worst case: one player sees a stale balance
for ~10ms. Acceptable.

### 6.3 Why not Redis as primary?

Redis is fast but not durable enough to be the source of truth for
money. Postgres is the source of truth; Redis is the read accelerator.
If Redis goes down entirely, every read goes to Postgres and is still
< 20ms. Wallet operations continue.

---

## 7. Reconciliation — the safety net

Two reconciliation jobs run on schedule. They are the most important
worker jobs in the system.

### 7.1 Wallet reconciliation (nightly)

```typescript
// apps/worker/src/jobs/reconcile-wallets.ts
export async function reconcileWallets() {
  const drift = await db.query(`
    WITH ledger_sums AS (
      SELECT 
        account_id,
        currency,
        sub_bucket,
        SUM(CASE WHEN leg = 'credit' THEN amount ELSE -amount END) as sum
      FROM ledger_entries
      WHERE account_kind = 'player_wallet'
        AND created_at >= now() - interval '30 days'  -- partition pruning
      GROUP BY account_id, currency, sub_bucket
    )
    SELECT
      w.id, w.player_id, w.currency,
      w.current_balance AS wallet_total,
      COALESCE(SUM(ls.sum), 0) AS ledger_total,
      w.current_balance - COALESCE(SUM(ls.sum), 0) AS drift
    FROM wallets w
    LEFT JOIN ledger_sums ls ON ls.account_id = w.id AND ls.currency = w.currency
    GROUP BY w.id, w.player_id, w.currency, w.current_balance
    HAVING ABS(w.current_balance - COALESCE(SUM(ls.sum), 0)) > 0.0001
  `);
  
  if (drift.rows.length > 0) {
    await alertPagerDuty('SEV-1', {
      title: 'Wallet ledger drift detected',
      details: drift.rows,
    });
    return { status: 'drift_detected', count: drift.rows.length };
  }
  
  return { status: 'clean', wallet_count: 'all' };
}
```

**Why 30 days, not all-time:** at 100M+ ledger entries, a full table
scan is too slow. We trust older entries (they reconciled fine last
night). The 30-day window catches any recent corruption.

**Once a month:** a full reconciliation runs over the entire ledger
history. Takes 30+ minutes but proves the whole system clean.

**Drift tolerance:** 0.0001 (1/100th of a cent). Anything bigger pages
on-call.

### 7.2 Alea reconciliation (nightly)

This is the harder one. We compare *our* record of game rounds against
Alea's record.

```typescript
// apps/worker/src/jobs/reconcile-alea.ts
export async function reconcileAlea(date: Date) {
  // 1. Pull Alea's round summary for the date
  const aleaRounds = await alea.getRoundsForDate(date);
  // returns: [{ roundId, playerId, gameId, betAmount, winAmount, currency, ... }, ...]
  
  // 2. Pull our round records for the date  
  const ourRounds = await db.query(`
    SELECT external_round_id, player_id, game_id, bet_amount, win_amount, currency
    FROM game_rounds
    WHERE created_at >= $1 AND created_at < $2
  `, [date, addDays(date, 1)]);
  
  // 3. Build maps keyed by external_round_id
  const aleaMap = new Map(aleaRounds.map(r => [r.roundId, r]));
  const ourMap = new Map(ourRounds.rows.map(r => [r.external_round_id, r]));
  
  // 4. Find divergences
  const missingFromOurs = [...aleaMap.keys()].filter(k => !ourMap.has(k));
  const missingFromAlea = [...ourMap.keys()].filter(k => !aleaMap.has(k));
  const mismatches = [...aleaMap.entries()]
    .filter(([k, aleaR]) => {
      const ourR = ourMap.get(k);
      if (!ourR) return false;
      return Math.abs(aleaR.betAmount - ourR.bet_amount) > 0.0001
          || Math.abs(aleaR.winAmount - ourR.win_amount) > 0.0001;
    });
  
  // 5. Handle each case
  for (const roundId of missingFromOurs) {
    // Alea has it, we don't — replay the missing round
    await games.replayMissedRound(aleaMap.get(roundId));
  }
  
  if (missingFromAlea.length > 0 || mismatches.length > 0) {
    await alertPagerDuty('SEV-1', {
      title: 'Alea round reconciliation divergence',
      missing_from_alea: missingFromAlea,
      mismatches: mismatches,
    });
  }
}
```

**The replay path** for `missingFromOurs` is the safety net for dropped
Alea webhooks. We re-create the missing round and write its
bet/win ledger entries, idempotency-keyed on Alea's `roundId` — so if
the webhook eventually retries through Inngest, it no-ops.

---

## 8. Performance — meeting the budgets

Performance targets from Doc 01 §8:

| Operation                   | Target  | How we hit it                                                   |
| --------------------------- | ------- | --------------------------------------------------------------- |
| Wallet balance read          | <10ms p99 | Redis cache, fall-through to indexed Postgres lookup           |
| Single ledger write          | <50ms p99 | Single Postgres tx; the 6-entry purchase write is the heaviest; the 2-entry bet/win is the hot path |
| Daily wallet reconciliation  | <30 min   | 30-day window leverages monthly partition pruning              |

### 8.1 Hot path benchmarking — bet writes

The bet/win flow is THE bottleneck. At 10k concurrent players × 1 bet
per 3 seconds = ~3,300 bet writes/sec. Each is one Postgres
transaction with 2 ledger entries + 1 wallet update.

**Benchmark on Neon Scale plan with 4 vCPU + 16GB RAM:**
- Single bet write: ~8-15ms p50, ~30-45ms p99
- Throughput at saturation: ~2,500 writes/sec per connection
- With connection pool of 50: ~10,000 writes/sec ceiling

We're comfortable. If we approach the ceiling, we shard wallets by
player_id and write to read replicas — but that's a year-3 problem at
your projected scale.

### 8.2 Avoiding lock contention

Postgres serializable isolation will sometimes throw
`serialization_failure` if two transactions race. We handle this with
retry-with-backoff:

```typescript
export async function writeWithRetry(ctx, spec) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await write(ctx, spec);
    if (result.ok) return result;
    if (result.error.code === 'serialization_failure') {
      await sleep(Math.random() * 50 * attempt);  // jittered backoff
      continue;
    }
    return result;
  }
  return err({ code: 'serialization_failure_retries_exhausted' });
}
```

In practice, contention only happens when the *same wallet* is hit by
two writes at the same instant — which means the same player doing
two things simultaneously, which is rare. Most bets across the system
target different wallets and have zero contention.

### 8.3 The 6-entry purchase write

Purchase writes are bigger than bet writes (6 entries vs 2). They're
also much rarer (~5,000/month vs 100M/month). They're the slow path
and we don't optimize them — 100ms p99 on a purchase is fine.

---

## 9. Failure modes — what can go wrong and how we recover

### 9.1 Postgres unavailable

Every write fails. Worker queues hold incoming webhooks via Inngest
retries. When Postgres recovers, the queue drains. No data is lost
because providers retry their webhooks for 24+ hours.

### 9.2 Redis unavailable

Every read falls through to Postgres. ~2x slower (20ms instead of 10ms)
but functional. Writes don't depend on Redis at all (cache
invalidation just no-ops).

### 9.3 The "second leg fails" problem in a non-transactional system

In a poorly-designed ledger, you could write the debit, then crash
before writing the credit. The book is unbalanced.

We don't have this problem because all legs of a transaction live in
one Postgres `BEGIN..COMMIT`. Either all entries get written or none
do. The double-entry invariant cannot be violated by a partial write.

### 9.4 Reconciliation finds drift

PagerDuty fires. On-call investigates within 15 minutes. The drift
report includes the wallet ID, the wallet's `current_balance`, the
ledger sum, and the time window of likely cause.

Investigation flow:
1. Pull recent ledger entries for the wallet
2. Recompute the sum manually  
3. Identify whether the wallet was the source of the bug or the ledger
4. If wallet drifted high: clawback via `admin_adjustment` (Section 3.11)
5. If wallet drifted low: refund via `admin_adjustment`
6. Always: file an incident report and audit log the resolution

We expect zero drift events. Any single drift event triggers a
post-mortem regardless of cause or impact.

### 9.5 Webhook arrives for a transaction that's already been admin-reversed

Edge case but real. Sequence:

1. Player buys a $50 package
2. Finix confirms via webhook → ledger writes 6 entries
3. Player disputes charge → admin reverses via `admin_adjustment`
4. 30 minutes later, the original Finix webhook arrives a SECOND time (network glitch)
5. Step 2 of write path detects the existing entry → no-op → 200 OK

We never double-credit because of idempotency. The admin reversal is
preserved. Player gets the right outcome.

### 9.6 Alea sends a `win` event for a round we never received a `bet` for

Should be impossible, but if it happens we treat it as a SEV-1.
Possible causes: Alea bug, dropped webhook, our webhook handler ran
out of order, malicious replay.

Mitigation:
- The `win` entry's `pair_id` must match an existing `bet` entry
- If no matching `bet` exists, the write throws and we 500 the webhook
- PagerDuty fires
- Reconciliation will catch any missed bets and replay them within 24 hours

---

## 10. Testing the ledger

This is the section that earns its keep over the life of the platform.
Every release runs these tests.

### 10.1 Property-based tests

Using `fast-check` (TypeScript property testing):

```typescript
test.prop('every transaction balances per currency', 
  arbitraryTransactionSpec(), 
  (spec) => {
    const byCurrency = groupBy(spec.entries, e => e.currency);
    for (const [currency, entries] of Object.entries(byCurrency)) {
      const credits = sum(entries.filter(e => e.leg === 'credit').map(e => e.amount));
      const debits = sum(entries.filter(e => e.leg === 'debit').map(e => e.amount));
      expect(credits).toEqual(debits);
    }
  }
);

test.prop('writing the same spec twice produces one transaction',
  arbitraryTransactionSpec(),
  async (spec) => {
    const r1 = await ledger.write(ctx, spec);
    const r2 = await ledger.write(ctx, spec);
    expect(r1.value.entries.length).toBeGreaterThan(0);
    expect(r2.value.status).toBe('duplicate');
    
    const entries = await db.query('SELECT * FROM ledger_entries WHERE source_id = $1', [spec.sourceId]);
    expect(entries.rowCount).toBe(r1.value.entries.length);  // not doubled
  }
);

test.prop('wallet balance always equals ledger sum after any sequence of writes',
  arbitraryTransactionSequence(),
  async (seq) => {
    for (const spec of seq) {
      await ledger.write(ctx, spec);
    }
    const drift = await reconcileWallets();
    expect(drift.count).toBe(0);
  }
);
```

These run thousands of random transaction sequences and prove the
invariants hold under arbitrary input.

### 10.2 Replay tests for every webhook type

We capture real Finix and Alea webhooks (with PII scrubbed) and store
them as JSON fixtures. Test suite replays them and verifies:
- Idempotency (replay produces no extra entries)
- Balance correctness (the resulting wallet state matches expected)
- Audit trail (the audit_log has the expected events)

### 10.3 Migration import validation

Once we import a Gamma snapshot in week 2, we run:

```typescript
test('Gamma import preserves all balances', async () => {
  const gammaSnapshot = await loadGammaSnapshot('2026-05-12');
  await migration.import(gammaSnapshot);
  
  for (const gammaPlayer of gammaSnapshot.players) {
    const ourPlayer = await db.players.findByEmail(gammaPlayer.email);
    const ourWallet = await db.wallets.find({ playerId: ourPlayer.id, currency: 'SC' });
    expect(ourWallet.current_balance).toEqual(gammaPlayer.sc_balance);
  }
});
```

If a single player's balance is off after import → block cutover until
we understand why.

---

## 11. What's next (Doc 05 preview)

Doc 05 (Webhook Architecture) builds on this by specifying:
- Exact Finix webhook event types we subscribe to and how each maps to a ledger transaction here
- Exact Alea webhook payload shape and signing verification
- Exact Footprint KYC webhook event handling
- Idempotency at the webhook receiver level (before it even gets to the ledger)
- Rate limiting and replay protection
- Webhook health monitoring and alerting

That's the next doc. Needs the Alea + Footprint API docs you're
gathering tomorrow.

---

## 12. Quick patches to Doc 03 from this work

Apply these to Doc 03 before week 1:

1. Add `players.is_internal_account boolean not null default false`
2. Add `redemptions.method` enum: `'finix_ach' | 'apt_debit'` (remove `card_payout`)
3. Add the `admin_adjustments` table from §3.11
4. Add `bonuses.playthrough_window_hours` (already there, just confirm — for time-limited playthrough)
5. Add `house_accounts` table:
   ```sql
   create table house_accounts (
     id          uuid primary key default gen_random_uuid(),
     kind        text not null unique,   -- 'house_bank' | 'house_winnings_gc' | etc
     currency    text not null,
     created_at  timestamptz not null default now()
   );
   ```
6. Add the `ledger_entries_immutable_guard` trigger from §4
7. Add `bonus_type` enum entries: `'amoe'`, `'jackpot_winning'`, `'purchase_promocode'`
8. Add `daily_operational_snapshots` table to hold the MERV report data the worker produces nightly
9. Allow `players.username` to be nullable for migration compatibility
10. The 14-bonus-type enum from the MERV report becomes the canonical `bonuses.bonus_type` enum
