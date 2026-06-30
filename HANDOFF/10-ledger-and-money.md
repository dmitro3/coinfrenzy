# 10 · Ledger and Money

> **The most important file in this folder.** If you change anything that
> moves coins, read this first. If you change anything that moves coins
> without reading this first, you owe me coffee.

---

## The four laws of the ledger

Per `docs/04` and `.cursorrules`:

1. **Every coin movement is a `ledger.write()` call.** No SQL UPDATE on
   `wallets`. No direct `INSERT INTO ledger_entries`. No exceptions.
2. **Every write is idempotent on `(source, source_id)`.** Retries are
   safe. Webhook replays are safe. Job restarts are safe.
3. **The ledger is immutable.** A Postgres trigger on `ledger_entries`
   rejects `UPDATE` and `DELETE`. The one carved-out column is
   `balance_after`, which the writer sets in the same transaction.
4. **Wallet balances are computed by the ledger.** The `wallets` table
   is a denormalised cache updated atomically with each ledger write,
   and a `CHECK` constraint guarantees the four sub-buckets sum to
   `current_balance`.

These are non-negotiable. The reconciliation job catches violations
nightly; the property tests catch them in CI.

---

## Money types

| Layer           | Type             | Format                                                                     |
| --------------- | ---------------- | -------------------------------------------------------------------------- |
| Database column | `numeric(20, 4)` | Declared via the `money()` helper in `_shared.ts`.                         |
| Application     | `bigint`         | Minor units: `1 USD = 10_000n`, `1 SC = 10_000n`, `1 GC = 10_000n`.        |
| Display         | `string`         | Formatted on the server via `formatMoney(amount, currency)`.               |
| Wire            | `string`         | Always serialised as a string in JSON to avoid JS `number` precision loss. |

**`number` / `float` / `Decimal.js` are banned.** Period. The reasons
are written in `docs/04` and the property-test suite will catch you
eventually; the user will catch you first.

Helpers in `packages/core/src/ledger/money.ts`:

```ts
bigintToNumericString(amount: bigint): string        // → "10.0000"
numericStringToBigint(s: string): bigint             // "10.0000" → 100000n (10 * 10000)
toBigintAmount(input: bigint | string | number): bigint
formatMoney(amount: bigint, currency: Currency): string  // → "$1.00", "SC 10.00", "GC 1,000"
```

Currencies: `'GC'`, `'SC'`, `'USD'`. Always explicit. There is no
implicit currency anywhere.

---

## Wallet structure

Every player has exactly two wallet rows (one `GC`, one `SC`). Each
wallet has:

```
current_balance        = (sum of the four sub-buckets, enforced by CHECK)
balance_purchased      bucket 1
balance_bonus          bucket 2
balance_promo          bucket 3
balance_earned         bucket 4
playthrough_required   running playthrough requirement (per docs/06)
playthrough_progress   how much of the requirement is satisfied
```

Only `balance_earned` (and only on the SC wallet) is **redeemable**.
The other three are play-only.

The four sub-buckets exist because SC is awarded from different
sources with different legal treatment, and the **drain order** below
controls which bucket is depleted first on a play.

---

## Drain order

When a player plays a game, SC is consumed in this order
(`packages/core/src/ledger/drain-order.ts → DRAIN_ORDER`):

```
1. balance_promo       (promo-code-redeemed SC — first to drain)
2. balance_bonus       (ops-granted SC)
3. balance_purchased   (SC awarded with a paid GC package)
4. balance_earned      (SC won at games — last to drain)
```

Why this order: we want the non-redeemable buckets gone before the
player's redeemable winnings are touched, so playthrough math stays
clean and the player's redeemable balance is maximised.

For GC, the order is the same shape but only `purchased` and `bonus`
typically have meaningful balances.

`computeDrainPlan(walletBuckets, amount)` and
`computeRedemptionDrainPlan(walletBuckets, amount)` return a deterministic
`DrainPlan` that the ledger writer uses to split a single bet/win into
sub-bucket-correct legs.

---

## Ledger sources

A ledger entry is uniquely identified by `(source, source_id)`. The
enum is:

| Source                | What writes it                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| `purchase`            | Finix webhook on a successful coin package buy.                                                |
| `bet`                 | Alea webhook on a game round bet.                                                              |
| `win`                 | Alea webhook on a game round win.                                                              |
| `bonus_award`         | Bonus engine when a template grants SC/GC.                                                     |
| `playthrough_release` | Bonus engine when the playthrough requirement is met (moves balance from `bonus` to `earned`). |
| `redemption_request`  | Player initiates a redemption.                                                                 |
| `redemption_paid`     | Finix payout confirmation.                                                                     |
| `redemption_rejected` | Cashier rejects (refunds the SC).                                                              |
| `purchase_refund`     | Finix refund webhook.                                                                          |
| `manual_adjust`       | Admin grants/removes coins (audited, role-gated, capped by `APPROVAL_THRESHOLDS`).             |
| `affiliate_payout`    | Affiliate payout to a player's wallet.                                                         |

Each of these has a **transaction builder** in
`packages/core/src/ledger/transactions/`:

```
buildPurchase, buildBet, buildWin, buildBonusAward,
buildPlaythroughRelease, buildRedemptionRequest, buildRedemptionPaid,
buildRedemptionRejected, buildPurchaseRefund, buildAdminAdjustment,
buildAffiliatePayout
```

Use the builders; they produce balanced double-entry legs. Hand-rolled
`TransactionSpec` objects are accepted by `ledger.write` but you have
to assert your own balance.

---

## House accounts

Every player ledger entry has a counterparty leg into a **house
account** (`house_accounts` table). One row per `(kind × currency)`:

| Kind                 | Used by                                | Currencies  |
| -------------------- | -------------------------------------- | ----------- |
| `revenue_purchases`  | The `purchase` source.                 | USD, GC, SC |
| `payout_redemptions` | The `redemption_paid` source.          | USD, SC     |
| `bonus_pool`         | The `bonus_award` source.              | GC, SC      |
| `play_pool`          | `bet` + `win` source pair (net = NGR). | GC, SC      |
| `affiliate_pool`     | Affiliate payouts.                     | USD, SC     |
| `adjustments`        | Manual adjusts.                        | GC, SC, USD |

Helpers: `getHouseAccountId(ctx, kind, currency)`,
`isHouseAccount(kind)`, `isPlayerScopedAccount(kind)`.

---

## The write path (8 steps)

Per `docs/04 §4` and `packages/core/src/ledger/write.ts`:

1. **Validate balance**: `assertBalanced(spec)` — cheap check that
   debits = credits per currency. Catches bugs without a DB round-trip.
2. **Open transaction at SERIALIZABLE**: `set transaction isolation
level serializable`. Drizzle's `db.transaction` doesn't yet support
   per-call isolation, so we set it manually inside the tx body.
3. **Set RLS actor settings**: `set_config('app.actor_id', …),
('app.actor_kind', …), ('app.actor_role', …)`. All policies hinge
   on these.
4. **Dedupe**: `SELECT 1 FROM ledger_entries WHERE source = ? AND
source_id = ?`. If a row exists, return `{status: 'duplicate'}` —
   noop. The DB unique index is the safety net for true races.
5. **Resolve account ids**: turn `{kind, playerId, currency}` into
   `{accountId}` for every leg.
6. **Insert all entries**: single bulk insert; immutability trigger
   doesn't fire on `INSERT`.
7. **Apply wallet deltas**: one `UPDATE wallets SET …` per
   `(player, currency)` group — adjusts `current_balance` and the
   four sub-buckets in a single round trip. The CHECK constraint
   rejects any mismatch.
8. **Write `balance_after`**: the carved-out column on
   `ledger_entries` that the immutability trigger permits the writer
   to set.
9. **After-commit hooks**: queue Redis cache invalidation and any
   downstream notifications (Pusher, audit) into the `afterCommit`
   queue; run them only if commit succeeds.

The function returns `Result<LedgerWriteResult, LedgerError>` where
`LedgerError` is one of:

```
serialization_failure | wallet_not_found | invalid_entry |
database_error | balance_check_failed | currency_mismatch
```

`serialization_failure` (Postgres `40001`) is retried by
`writeWithRetry()` with exponential backoff. Other errors bubble.

---

## Reading balances

`getBalance(playerId, currency)` returns a `WalletSnapshot`:

```ts
{
  currentBalance: bigint
  balancePurchased: bigint
  balanceBonus: bigint
  balancePromo: bigint
  balanceEarned: bigint
  playthroughRequired: bigint
  playthroughProgress: bigint
  updatedAt: Date
}
```

Reads are **Redis-cached** for 30 seconds. The `afterCommit` hook on
every ledger write invalidates the cache. If you ever see "wrong
balance shown but reconciliation passes", suspect the cache.

`getSubBucketBreakdown` and `getRedeemableBalance` exist for the
cashier UI and redemption-request validation respectively.

---

## Reconciliation

Two cron jobs in `apps/worker/src/jobs/`:

| Job                         | Cadence          | What it does                                                                                                                                              |
| --------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reconcile-wallets.ts`      | nightly 02:00 ET | For every wallet, recomputes `SUM(amount * sign(leg))` from `ledger_entries` and compares to `current_balance`. Drift writes a row to `compliance_flags`. |
| `reconcile-wallets-full.ts` | monthly          | Same but for every player (including soft-deleted) and includes the four sub-buckets.                                                                     |

`reconcileWallets(ctx, options)` is the function; it returns a
`ReconcileResult` with a `DriftRow[]`. The cron alerts PagerDuty on any
drift > $0.01.

There's a manual entry point too:
`pnpm -F @coinfrenzy/worker cutover:balance-compare` runs the full
reconciliation against a CSV from the legacy operator (used during the
Gamma cutover).

---

## How to add a new ledger source

Walk through this if you need to add e.g. a "loyalty cashback" source.
The steps in order:

1. **Update `docs/04`** with the new source name, its semantics, and
   the legs it produces (debit/credit kinds, currency, sub-bucket).
2. **Add the source to `LedgerSource` union** in
   `packages/core/src/ledger/types.ts`.
3. **Update the `source` column constraint** in a new migration if you
   guard the enum at the DB layer (we do — see `0000_init.sql`).
4. **Write a transaction builder** in
   `packages/core/src/ledger/transactions/` named
   `buildCashback(input): TransactionSpec`. It should:
   - Take typed input (e.g. `{playerId, amount, sourceId}`).
   - Return a `TransactionSpec` with balanced legs.
   - Include `source = 'cashback'` and a stable `source_id`.
5. **Export the builder** from `packages/core/src/ledger/index.ts`.
6. **Wire the caller** (e.g. the weekly-tier-bonuses cron job) to
   `core.ledger.write(ctx, buildCashback(input))`.
7. **Write tests** in `packages/core/src/ledger/__tests__/`:
   - A "happy path" test.
   - A "double write returns duplicate" idempotency test.
   - A property test (`fast-check`) that asserts balance invariants
     across random inputs.
8. **Add a house account** if needed (insert into `house_accounts` in a
   new migration; add the kind to `LedgerAccountKind`).
9. **Audit + CRM**: if it's an admin-initiated action, also call
   `audit.record(ctx, …)` and emit a CRM event via `events.emit(ctx, …)`.
10. **Run `pnpm test`** — the property suite will scream if anything is
    off.

---

## Common foot-guns

- **Setting `app.actor_*` outside the tx**: doesn't work. Postgres
  `set_config(..., true)` is per-tx; outside a tx it has no scope. Set
  inside the tx, every time.
- **Forgetting `sub_bucket` on a `player_wallet` entry**: the writer
  throws because it can't decompose the wallet delta. Always specify.
- **Computing balances client-side**: never. The Redis-cached snapshot
  is the only legitimate source. Client never adds up legs.
- **Manually `UPDATE wallets`**: the CHECK constraint will catch the
  obvious case (sub-buckets out of sum); the reconciliation cron will
  catch the subtle case. Don't.
- **Skipping `assertBalanced(spec)`**: every spec must be balanced per
  currency. Manual `TransactionSpec` skipping the builders should call
  this explicitly.
- **Using `Number(amount)` to display**: precision loss above ~$92T
  for USD-equivalent, but more relevantly: subtle rounding above $100k
  if you ever divide. Use `formatMoney`.

---

## Tests

`packages/core/src/ledger/__tests__/`:

- `unit/` — small, focused checks for each builder + the balance
  validator.
- `properties.test.ts` — `fast-check` property tests. ~1,900 generated
  cases in a default run. Key properties:
  - **Idempotency**: `write(tx) === write(tx) === write(tx)` (single
    insertion).
  - **Conservation**: for any sequence of operations, `SUM(ledger
legs) = 0` per currency.
  - **Drain correctness**: `computeDrainPlan` always consumes from the
    correct sub-bucket order; total drained equals input.
  - **Wallet integrity**: after any sequence of writes,
    `current_balance = sum(sub-buckets)` and `current_balance =
SUM(player legs)` from the ledger.
- `setup.ts` — Testcontainers Postgres setup (Docker required).

Run:

```bash
pnpm -F @coinfrenzy/core test                # whole suite
pnpm -F @coinfrenzy/core test:unit           # unit only
pnpm -F @coinfrenzy/core test:properties     # properties only
SKIP_INTEGRATION_TESTS=1 pnpm -F @coinfrenzy/core test    # skip Docker-bound
```

---

## What to read next

- `04-database.md` — `ledger_entries`, `wallets`, `house_accounts` schema.
- `15-security-and-compliance.md` — RG limits, blocked states, AML.
- `architecture-diagrams/ledger-flow.md` — the write sequence visualised.
