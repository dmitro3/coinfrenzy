# Ledger Flow

The single write path every coin movement takes. See
`10-ledger-and-money.md` for the prose deep-dive.

---

## Write sequence

```mermaid
sequenceDiagram
    autonumber
    participant Caller as Caller (route / job)
    participant LW as core.ledger.write
    participant TX as Postgres TX (SERIALIZABLE)
    participant LE as ledger_entries
    participant W as wallets
    participant ACQ as afterCommitQueue
    participant Redis
    participant Pusher

    Caller->>LW: write(ctx, spec)
    LW->>LW: assertBalanced(spec)
    LW->>TX: BEGIN
    TX->>TX: set tx isolation = serializable
    TX->>TX: set_config app.actor_id/kind/role
    TX->>LE: SELECT id WHERE (source, source_id)
    alt duplicate
        LE-->>TX: existing row
        TX-->>LW: { status: 'duplicate' }
        LW-->>Caller: Result.ok(duplicate)
    else new
        LE-->>TX: empty
        LW->>LW: resolveAccounts (house/player wallet ids)
        TX->>LE: INSERT all legs (bulk, balanced)
        TX->>W: UPDATE wallets SET sub_buckets + current_balance
        Note over W: CHECK current_balance = sum(sub-buckets)
        TX->>LE: UPDATE balance_after (carved-out by trigger)
        TX->>ACQ: push (Redis invalidate, Pusher publish)
        TX->>TX: COMMIT
        TX-->>LW: written
        LW->>ACQ: flush
        ACQ->>Redis: invalidate wallet:player:<currency>
        ACQ->>Pusher: publish private-player-<id> balance:update
        LW-->>Caller: Result.ok({ pairId, entries })
    end
```

---

## Idempotency at a glance

```mermaid
flowchart LR
    A[same spec retried] --> B{exists in ledger_entries<br/>by source + source_id?}
    B -->|yes| C[return duplicate, noop]
    B -->|no| D[insert + update wallet + after-commit]
    D --> E[next retry hits step B and exits]
```

---

## Drain order for play

```mermaid
flowchart TD
    A[Player plays · debit amount] --> B[computeDrainPlan]
    B --> C1[1. balance_promo]
    C1 -->|remaining| C2[2. balance_bonus]
    C2 -->|remaining| C3[3. balance_purchased]
    C3 -->|remaining| C4[4. balance_earned]
    C4 --> D[emit legs · one per sub-bucket touched]
    D --> E[ledger.write builds balanced spec across legs]
```

---

## Wallet sum invariant

```mermaid
flowchart LR
    A[Any ledger_entries change] --> B[corresponding wallets UPDATE in same tx]
    B --> C{current_balance =<br/>purchased + bonus + promo + earned?}
    C -->|yes| D[commit]
    C -->|no| E[CHECK constraint rejects · tx rolls back]
    D --> F[reconciliation nightly: wallet.current_balance =<br/>SUM(ledger legs · player)?]
    F -->|drift| G[compliance_flags row + PagerDuty]
```

---

## Sources → builders

```mermaid
flowchart LR
    finix[Finix webhook] --> buyB[buildPurchase] --> write
    alea[Alea bet webhook] --> betB[buildBet] --> write
    alea2[Alea win webhook] --> winB[buildWin] --> write
    bonusEng[Bonus engine] --> awardB[buildBonusAward] --> write
    bonusEng2[Playthrough met] --> releaseB[buildPlaythroughRelease] --> write
    cashier[Player redeem] --> reqB[buildRedemptionRequest] --> write
    finixPaid[Finix payout webhook] --> paidB[buildRedemptionPaid] --> write
    admin[Admin cancel] --> rejB[buildRedemptionRejected] --> write
    admin2[Admin manual SC] --> adjB[buildAdminAdjustment] --> write
    affiliate[Affiliate payout job] --> affB[buildAffiliatePayout] --> write
    write[core.ledger.write]
```
