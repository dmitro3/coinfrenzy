# CoinFrenzy Platform — Migration from Gamma

**Document:** 13 of 13
**Reads:** Doc 01 (Architecture), Doc 03 v2 (Data Model), Doc 04 (Ledger), Doc 09 (Security)
**Purpose:** The complete runbook for cutting over from Gamma to the new platform. Built and tested in week 2; executed in week 11.

---

## 0. The five rules of this migration

These are non-negotiable. Every decision below derives from them.

1. **Build before notice.** Every import pipeline, validation script, and cutover step is built and tested on staging BEFORE Gamma is told we're leaving. Gamma's cooperation is a nice-to-have, not a requirement.

2. **Daily snapshots are insurance.** Starting now, we pull a daily Gamma export to R2. Last night's snapshot is always a worst-case recovery point. Even if Gamma cuts us off mid-migration, we lose at most 24 hours.

3. **Webhook capture is double insurance.** 30 days before cutover, Finix/Alea/Footprint webhooks fire to BOTH Gamma and us. We don't act on them, we capture them. Fills the 24-hour gap in the snapshot.

4. **Test the import 5+ times before cutover.** Every week from week 3 onward, we run the full import on staging with that day's snapshot, verify totals, fix divergences. Zero drift in the final 3 dry runs is the gate.

5. **The cutover is rehearsed.** Cutover night is not the first time we do this. By cutover night we've done it at least 3 times end-to-end on staging.

---

## 1. Migration phase overview

```
Week 1-2:  Build the import pipeline (parallel with ledger build)
Week 3:    First dry run on staging with real Gamma snapshot
Week 4-8:  Weekly dry runs; pipeline hardening
Week 7:    Start dual-webhook capture (Finix/Alea/Footprint fire to us too)
Week 9:    Cutover script + DNS runbook complete; 3 full rehearsals
Week 10:   Give Gamma 30-day notice (legal review first)
Week 11:   Final dry run with latest snapshot
Week 12:   CUTOVER NIGHT
Week 12+1: Post-cutover validation + Gamma sunset
```

## 2. The data we're migrating

Based on the Gamma exports you've sent. Final list confirmed once the
Casino Transaction export arrives.

### 2.1 Player data (from `players_data.csv` — confirmed)

13 columns × 6,783 rows (current). Maps to `players` table. Notes:
- `User Id` → `gamma_user_id` (preserved for legacy reference)
- `Username` → nullable; "-" → NULL
- `Name` → `display_name`; "-" → NULL
- `Last Login` → `last_login_at`; "-" → NULL
- `Status` → enum mapping: Active→active, Restrict→restricted, Internal-User→internal, In-Active→suspended
- `rsg` → parsed into `compliance_flags` rows (see §4.3 — freetext parser)

### 2.2 Purchase + balance data (from `purchase_report.csv` — confirmed)

21 columns × 1,044 rows. Maps to:
- Per-player lifetime aggregates → `player_lifetime_stats`
- Wallet balance → `wallets.current_balance` (allocated to sub-buckets per §4.4)
- Outstanding playthrough → `wallets.playthrough_required` + synthetic bonus award (see §4.5)
- `Disabled User` boolean → `players.status = 'suspended'`
- `Affiliate Id` → `affiliate_attribution.affiliate_id`

### 2.3 Daily KPI data (from `merv_report.csv` — confirmed)

57 columns × N daily rows. Maps to `daily_operational_snapshots`. We
import historical days as-is so the new dashboard can show
year-over-year and trend data from day one of cutover. Doesn't need
to be migrated to ledger — it's pure reporting data.

### 2.4 Individual purchase transactions (from `transactions_banking_data.csv` — confirmed)

11 columns + the goldmine `More Details` JSON. Maps to:
- One `purchases` row per Gamma purchase
- Finix transfer ID extracted from `More Details.makePaymentDetails.id`
- 3DS result extracted from `More Details.evervault3dsSessionId`
- Card last4 + brand from `More Details.encryptedCard`
- For each successful purchase: write the corresponding ledger entries (6 entries per purchase, per Doc 04 §3.1)

**Reality check:** Gamma's export is 312 transactions for ONE day. At
their daily volume we need to pull this report daily and accumulate it,
not pull all-time at once (which they may not allow).

### 2.5 Individual redemption transactions (from `redeem_requests_data.csv` — confirmed)

18 columns + `Details` JSON. Maps to:
- One `redemptions` row per Gamma redemption
- Finix transfer ID extracted from `Details.withdrawResponseData.id`
- Bank account masked ref from `Details.bankAccountDetail.masked_account_number`
- Plaid validation result from `Details.bankAccountDetail.bank_account_validation_check`
- For each successful redemption: write the corresponding ledger entries (4 entries, per Doc 04 §3.8)

**Important:** the export only shows Status='Success'. Failed and pending
redemptions are missing. Need to pull a separate "all statuses" export
or accept that we only migrate successful redemptions. (Acceptable — failed redemptions don't affect player balance.)

### 2.6 Game round data (from "Casino Transaction" export — pending)

This is the highest-volume table. Each row is one game round (bet +
win pair). If Gamma exports it with bet, win, game ID, round ID, and
timestamp, we can:
- Replay all rounds into `game_rounds`
- Generate the corresponding bet/win ledger entries
- Match against Alea's records as a triple-verification

If Gamma doesn't export round-level data, we have two options:
- Pull from Alea directly (Alea has their own record per round)
- Skip historical round replay and just import the aggregated balances

**Recommended:** pull from Alea. Their data is authoritative anyway.

### 2.7 Bonus history (export pending)

Per-bonus-award detail. Critical for:
- Preserving each player's outstanding playthrough requirement at the per-bonus level
- Audit trail for "when did this player receive this bonus"
- CRM cohort analysis ("everyone who got a welcome bonus in March")

Without this, we'd have to synthesize a single "migration_balance" bonus
per player carrying their total outstanding playthrough (lossy but
workable).

### 2.8 Affiliate data (export pending)

The Affiliate Report screenshot showed: ID, username, email, full name,
rev share %, status, total campaigns, total signups, created date. Maps
to `affiliates` table directly. The player-to-affiliate linkage comes
from the `Affiliate Id` column in the purchase report.

### 2.9 What we are NOT migrating

Deliberate omissions:
- **Gamma's session logs.** Their internal session table. Not needed; new sessions issue fresh on first login post-cutover.
- **Gamma's notification table.** Their in-app notifications. Players will see a fresh notification ("Welcome to the new CoinFrenzy!") on first login.
- **Gamma's banners + CMS content.** We rebuild from scratch with better design.
- **Gamma's email templates.** Same — rebuild.
- **Gamma's promo code redemption history (just the events; the codes themselves migrate).** Optional. Useful for CRM analysis but not critical.
- **Gamma's CRM campaign send history.** They use Optimove; we don't need their send log.

---

## 3. The import pipeline

### 3.1 Architecture

```
                          ┌─────────────────────┐
                          │  Daily Gamma export │
                          │  (admin CSV pulls)  │
                          └──────────┬──────────┘
                                     │
                                     ▼
                          ┌─────────────────────┐
                          │  Cloudflare R2      │
                          │  /gamma-snapshots/  │
                          │  YYYY-MM-DD/        │
                          │   players.csv       │
                          │   purchases.csv     │
                          │   redemptions.csv   │
                          │   etc.              │
                          └──────────┬──────────┘
                                     │
                                     ▼
                          ┌─────────────────────┐
                          │  Worker job:        │
                          │  apps/worker/       │
                          │  src/jobs/          │
                          │  gamma-import.ts    │
                          └──────────┬──────────┘
                                     │
                                     ▼
                          ┌─────────────────────────────────────┐
                          │  packages/core/src/migration/       │
                          │                                     │
                          │  ┌─────────┐  ┌─────────┐  ┌────────┐│
                          │  │ Parser  │→ │Mapper   │→ │Loader  ││
                          │  │ (CSV→   │  │ (cols→  │  │ (writes││
                          │  │ objects)│  │ schema) │  │ to DB) ││
                          │  └─────────┘  └─────────┘  └────────┘│
                          │       ▲           ▲           │      │
                          │       │           │           ▼      │
                          │  ┌────────────────────────────────┐  │
                          │  │ migration_column_mappings table │  │
                          │  │ (declarative col-by-col rules) │  │
                          │  └────────────────────────────────┘  │
                          └──────────────────┬──────────────────┘
                                             │
                                             ▼
                                  ┌────────────────────┐
                                  │  Neon staging DB   │
                                  │  (or prod, on      │
                                  │  cutover night)    │
                                  └────────────────────┘
```

### 3.2 The mapping table (declarative, not code)

Per Doc 03 v2 §13, the column mappings live in
`migration_column_mappings`. The import script reads this at runtime.
This means we can adjust mappings without redeploying when we discover
Gamma's CSV changed.

Example row:

```sql
('players_data.csv', 'Username', 'players', 'username', 'dash_to_null', 'Gamma uses "-" for missing')
```

Transform functions implemented in `packages/core/src/migration/transforms.ts`:

```typescript
export const transforms = {
  'as-is': (v) => v,
  'dash_to_null': (v) => v === '-' || v === '- ' ? null : v,
  'lower': (v) => v?.toLowerCase() ?? null,
  'parse_datetime': (v) => v === '-' ? null : new Date(v).toISOString(),
  'parse_money': (v) => v === '' || v == null ? '0' : v,
  'parse_status': (v) => ({
    'Active': 'active',
    'In-Active': 'suspended',
    'Internal-User': 'internal',
    'Restrict': 'restricted',
  })[v] ?? 'active',
  'parse_method': (v) => ({
    'BANK_ACCOUNT_FINIX': 'finix_ach',
    'BANK_ACCOUNT': 'finix_ach',  // legacy → same target
  })[v] ?? 'finix_ach',
  'parse_freetext_rsg': (v) => parseRsgFreetext(v),  // see §4.3
  'parse_disabled': (v) => v === 'true' || v === true,
  'always_null': () => null,
  'computed': (v, row) => null,  // placeholder; actual computed fields handled separately
};
```

### 3.3 Idempotency of imports

Every imported row carries `gamma_user_id` (or equivalent ID column).
The loader checks: if a row with this gamma_user_id already exists,
UPDATE instead of INSERT. This makes re-runs safe — pull the latest
snapshot, re-import, and only changed players get touched.

For purchases and redemptions, the unique key is the `Transaction Id`
(Finix transfer ID is globally unique). Re-imports no-op.

For ledger entries written during migration: `source = 'migration'`,
`source_id = gamma_transaction_id`. The ledger's idempotency
constraint prevents double-writes naturally.

### 3.4 Order of operations within an import run

Strict order, enforced by the worker:

1. **Players** — must exist before anything references them
2. **Affiliates + affiliate codes** — must exist before affiliate_attribution
3. **Affiliate attribution** — links players to affiliates
4. **Wallets** — created empty per player, populated by ledger entries below
5. **KYC status** — populated from Footprint sync (Gamma's KYC level)
6. **Compliance flags** — from rsg freetext + self-exclusion column
7. **Synthetic migration bonuses** — one per player with outstanding playthrough
8. **Migration ledger entries** — write the entries that build the wallet balances:
   - Per player: one `migration_balance` entry crediting their current SC balance
   - Per purchase: 6 entries per Doc 04 §3.1 (USD external→house_bank, GC funding→player, SC funding→player)
   - Per redemption: 4 entries per Doc 04 §3.8
   - Per outstanding playthrough: a synthetic bonus award entry
9. **Reconciliation pass** — verify wallet balance = ledger sum for every player; halt if any drift
10. **Stats rollup** — compute `player_lifetime_stats`, `player_30d_stats`, `player_game_stats`
11. **Daily snapshots** — import historical MERV data into `daily_operational_snapshots`

Each step is its own idempotent job in Inngest. Failures retry. The
whole pipeline is restartable from any step.

### 3.5 Performance target

Full import of ~7,000 players + ~10,000 purchases + ~300 redemptions
should complete in **under 10 minutes** on staging Neon. At cutover-night
scale (potentially 50K+ players if growth continues), under 30 minutes.

Cutover-night maintenance window: 4 hours, of which the actual import
is ~30 min, validation is ~30 min, the rest is buffer.

---

## 4. Hard problems in the import

### 4.1 The "Reedemption" typo

Gamma's purchase_report.csv has the column `Total Reedemption Amount`
(extra "e"). The mapping table handles this:

```sql
('purchase_report.csv', 'Total Reedemption Amount', 'player_lifetime_stats', 'total_redeemed_usd', 'as-is', 'Gamma typo')
```

If Gamma fixes the typo in a future export, we add a second row mapping
the corrected column. Both run; one returns null and is skipped.

### 4.2 The "-" everywhere

Used for missing values in: Username, Name, Last Login, IP Location,
Recent Approved At, and others. The `dash_to_null` transform handles
all of these. Easy.

The harder case: numeric fields with "-" that should be 0, not NULL.
Currently the data is clean (numeric fields use `0.00`, not `-`) but
the transform `parse_money` falls back to '0' for unparseable
input just in case.

### 4.3 The rsg freetext parser

The `rsg` column on `players_data.csv` is freetext describing
responsible gaming status. Two patterns observed in current data:

```
"user is on time break untill May 12th 2026 at 05:41 PM"  → time-break, parse the date
"User is self excluded"                                    → permanent self-exclusion
""  (empty)                                                → no flag
```

Parser:

```typescript
// packages/core/src/migration/transforms/rsg.ts

export function parseRsgFreetext(text: string | null): ComplianceFlagSpec | null {
  if (!text || text.trim() === '') return null;
  
  const lower = text.toLowerCase();
  
  if (lower.includes('self excluded') || lower.includes('self-excluded')) {
    return {
      flag_type: 'self_exclusion',
      severity: 'block',
      reason: 'Migrated from Gamma',
      expires_at: null,  // permanent unless contradicted by date in text
      imported_source_text: text,
    };
  }
  
  if (lower.includes('time break') || lower.includes('timebreak')) {
    // Extract date with regex; many formats observed
    const dateMatch = text.match(/until[l]?\s+([A-Z][a-z]+\s+\d+(?:st|nd|rd|th)?[\s,]+\d{4})(?:\s+at\s+(\d{1,2}:\d{2}\s*(?:AM|PM)?))?/i);
    let expires_at: Date | null = null;
    
    if (dateMatch) {
      try {
        const dateStr = dateMatch[1].replace(/(st|nd|rd|th)/, '');
        const timeStr = dateMatch[2] ?? '11:59 PM';
        expires_at = new Date(`${dateStr} ${timeStr} EST`);
        if (isNaN(expires_at.getTime())) expires_at = null;
      } catch {
        expires_at = null;
      }
    }
    
    return {
      flag_type: 'rg_time_break',
      severity: 'block',
      reason: 'Migrated from Gamma',
      expires_at,
      imported_source_text: text,
    };
  }
  
  // Unknown pattern — log and flag for manual review
  return {
    flag_type: 'unknown',
    severity: 'warn',
    reason: 'Unrecognized rsg text from Gamma, manual review required',
    imported_source_text: text,
  };
}
```

The unknown-pattern case writes to a manual-review queue for the KYC
reviewer role to resolve before cutover. We expect 0-2 unknowns based
on current data.

### 4.4 Wallet balance sub-bucket allocation

Gamma exports a single `SC Balance` per player. Our schema splits it
into `balance_purchased`, `balance_bonus`, `balance_promo`, `balance_earned`.

We don't have the historical breakdown. Two options:

**Option A — Allocate everything to `balance_earned`.**
- Pro: simple; all migrated SC is treated as winnings (no playthrough needed).
- Con: undercounts the "outstanding playthrough" because we lose the bonus-bucket distinction.

**Option B — Reconstruct via outstanding playthrough.**
- If `playthrough_required > 0` from the purchase report, allocate that amount to `balance_bonus` and the rest to `balance_earned`.
- Pro: preserves the playthrough requirement correctly.
- Con: slightly approximate — we don't know which specific bonus the playthrough came from.

**My recommendation:** Option B. The playthrough requirement is the
contract we owe the player; we must preserve it. Losing the
"which bonus" attribution is acceptable — we tag the entry as
`migration_balance` and a regulator can see it's from migration.

Implementation: see §4.5.

### 4.5 The synthetic `migration_balance` bonus

For every player with non-zero outstanding playthrough, we create a
synthetic bonus award:

```typescript
// In packages/core/src/migration/synthetic-bonuses.ts

await ctx.db.bonuses_awarded.insert({
  player_id: player.id,
  bonus_id: MIGRATION_BALANCE_BONUS_ID,  // singleton, created during migration setup
  sc_amount: player.playthrough_required,
  playthrough_multiplier_snapshot: 1.0,   // already required = amount × 1
  playthrough_required: player.playthrough_required,
  playthrough_progress: 0,                 // assume 0 progress (conservative)
  game_weight_overrides_snapshot: null,
  status: 'active',
  source_kind: 'migration',
  source_id: gammaPlayerSnapshotId,
  award_reason: 'Migrated from Gamma — represents outstanding playthrough requirement',
  award_pair_id: ledgerPairId,
});
```

The corresponding ledger entry pair credits `player_wallet` with
`sub_bucket = 'bonus'` and debits `bonus_pool_sc`. Standard pattern.

The singleton `MIGRATION_BALANCE_BONUS_ID` bonus is created in the
schema as:
```typescript
{
  slug: 'migration_balance',
  display_name: 'Migrated Balance (Outstanding Playthrough)',
  bonus_type: 'admin_added_sc',
  award_sc: 0,  // placeholder, real amount is per-player
  playthrough_multiplier: 1.0,
  description: 'Synthetic bonus created during Gamma migration to preserve outstanding playthrough requirements. Each award represents a specific player\'s state at migration time.',
}
```

### 4.6 Affiliate Lightning Bolt credits

The Frenzy Creator affiliate system is separate from the casino, but
the casino has to credit affiliates with SC when they earn rev share.
For migration we have two cases:

**Already-credited Lightning Bolts (past affiliate payouts):** the
affiliate received SC into their player wallet on Gamma. We preserve
that as part of their wallet balance (it's already in the SC Balance
column). No special handling.

**Pending Lightning Bolt accruals (mid-cycle):** if an affiliate has
earned but not-yet-paid SC in Gamma's accounting, we need that number.
This comes from Gamma's Affiliate Report (pending export). For each
affiliate with pending balance:

```typescript
await ctx.db.affiliate_payouts.insert({
  affiliate_id: affiliate.id,
  amount_sc: pendingBalance,
  status: 'pending',
  period_label: 'Migrated from Gamma (pre-cutover accrual)',
  notes: 'This payout was earned on Gamma; payout happens via new system post-cutover.',
});
```

Then write a ledger entry into `affiliate_payable_sc`. On the next
post-cutover affiliate payout cycle, this gets paid out normally.

### 4.7 KYC level

Gamma's player export doesn't include KYC level (would need a separate
KYC export). For migration:

1. For every migrated player, we issue a Footprint API call asking
   "what's the current KYC level for the player with this `footprint_user_id`?"
2. Footprint returns the level + verified data points.
3. We write `kyc_status` row with that data.
4. If Footprint doesn't have the player (newer signup that hasn't
   reached KYC yet), `kyc_level = 0`, `footprint_status = 'pending'`.

This requires the Footprint API integration to be working in week 3+,
not just for new signups but for back-fetching existing player KYC
state. Coordinate with §6 of Doc 07 (when Footprint integration is
spec'd).

### 4.8 The 27% purchase cancel rate

`transactions_banking_data.csv` shows 27% cancel/fail rate on
purchases. These are not "broken" data — they're real abandoned
attempts. For migration:

- Successful purchases (Status='Success') → import as `purchases.status='completed'`
- Cancelled (Status='Canceled') → import as `purchases.status='cancelled'`
- Failed (Status='Failed') → import as `purchases.status='failed'`
- Empty Status (36 rows) → import as `purchases.status='failed'` with `failure_reason='unknown_legacy'`

Cancelled/failed purchases write NO ledger entries (no money moved).
They exist purely for funnel analysis.

---

## 5. Validation — every dry run

After every import run on staging, validate before declaring success.

### 5.1 Hard validation gates

These MUST pass. Any failure halts the run and pages on-call.

```typescript
// packages/core/src/migration/validation.ts

export async function validateImport(snapshotDate: string) {
  const errors: ValidationError[] = [];
  
  // 1. Player count matches
  const gammaCount = await getGammaPlayerCount(snapshotDate);
  const ourCount = await db.players.count();
  if (Math.abs(gammaCount - ourCount) > 0) {
    errors.push({ severity: 'fatal', check: 'player_count', expected: gammaCount, actual: ourCount });
  }
  
  // 2. Every player's SC balance matches
  const balanceMismatches = await db.query(`
    SELECT p.gamma_user_id, p.email, w.current_balance as ours, gamma_balance.value as theirs
    FROM players p
    JOIN wallets w ON w.player_id = p.id AND w.currency = 'SC'
    JOIN migration_id_map mim ON mim.casino_id = p.id AND mim.source_table = 'players'
    JOIN gamma_balance_view gamma_balance ON gamma_balance.gamma_id = mim.gamma_id
    WHERE ABS(w.current_balance - gamma_balance.value) > 0.0001
  `);
  if (balanceMismatches.length > 0) {
    errors.push({ severity: 'fatal', check: 'sc_balance_match', count: balanceMismatches.length, samples: balanceMismatches.slice(0, 10) });
  }
  
  // 3. Total purchase volume matches  
  const ourPurchaseSum = await db.purchases.sum('amount_usd');
  const gammaPurchaseSum = await getGammaPurchaseSum();
  if (Math.abs(ourPurchaseSum - gammaPurchaseSum) > 0.01) {
    errors.push({ severity: 'fatal', check: 'purchase_volume_match', expected: gammaPurchaseSum, actual: ourPurchaseSum });
  }
  
  // 4. Total redemption volume matches
  // (same pattern)
  
  // 5. Every self-excluded player is preserved
  const ourSelfExcluded = await db.compliance_flags.count({ flag_type: 'self_exclusion', cleared_at: null });
  const gammaSelfExcluded = await getGammaSelfExcludedCount();
  if (ourSelfExcluded !== gammaSelfExcluded) {
    errors.push({ severity: 'fatal', check: 'self_exclusion_count_match', expected: gammaSelfExcluded, actual: ourSelfExcluded });
  }
  
  // 6. Wallet/ledger reconciliation is zero-drift
  const drift = await reconcileWallets();
  if (drift.count > 0) {
    errors.push({ severity: 'fatal', check: 'wallet_ledger_drift', count: drift.count });
  }
  
  // 7. Outstanding playthrough sum matches
  const ourPlaythrough = await db.wallets.sum('playthrough_required');
  const gammaPlaythrough = await getGammaPlaythroughSum();
  if (Math.abs(ourPlaythrough - gammaPlaythrough) > 0.01) {
    errors.push({ severity: 'fatal', check: 'playthrough_match', expected: gammaPlaythrough, actual: ourPlaythrough });
  }
  
  return { errors, passed: errors.filter(e => e.severity === 'fatal').length === 0 };
}
```

### 5.2 Soft validation (warns but doesn't halt)

- Affiliate attribution count matches Gamma's report (allow ±1% for timing differences)
- Tier distribution matches (allow ±5% for tier-up events in flight)
- Last-login timestamps within 24 hours of Gamma's (allow drift due to snapshot lag)
- Geographic distribution roughly matches (sanity check)

### 5.3 Manual review queue

The "unknown rsg pattern" cases (§4.3) and any ambiguous mappings
write to a `migration_review_queue` table for human resolution. A
KYC reviewer or master admin opens each, picks an interpretation, and
the system applies it. The queue must be empty before final cutover.

---

## 6. The 30-day pre-cutover phase

### 6.1 Webhook dual-routing

30 days before cutover, we route Finix/Alea/Footprint webhooks to BOTH
Gamma and our new system. Our system captures them but does not act on
them (no ledger writes, no notifications, etc.). They sit in a
`pending_webhooks` table for forensic value.

Two ways to dual-route:
- **Provider-supported dual delivery** — Finix supports adding multiple webhook endpoints; just add ours. Alea and Footprint per their docs (verify when API docs land).
- **Webhook proxy** — if a provider doesn't support multiple endpoints, we sit a proxy in front of Gamma's webhook URL that forwards to both. Adds latency; only use if necessary.

### 6.2 What we do with captured webhooks

On cutover night, we have a fresh snapshot. The window between the
snapshot and the DNS flip is filled by replaying these captured
webhooks. Algorithm:

```typescript
// At cutover, after importing the final snapshot:
const replayCutoff = snapshotTimestamp;
const replayUntil = cutoverTimestamp;

const pending = await db.pending_webhooks.findMany({
  where: { received_at: { gte: replayCutoff, lt: replayUntil } },
  orderBy: { received_at: 'asc' },
});

for (const webhook of pending) {
  await processWebhook(webhook);  // same code path as live webhooks
}
```

This is the "no data loss between snapshot and cutover" guarantee.

### 6.3 The Gamma notice email

Drafted in advance with legal review. Sent on day 30-before-cutover.
Contents:

- Date of last live day on Gamma
- Acknowledgment of any contractual notice period
- Request for cooperation on data export (we already have most of it)
- Specification of what we still need from them (any reports we haven't
  pulled yet, final reconciliation statement, etc.)
- Final invoice arrangements

Do NOT send before our dry runs are green. Do NOT send before legal
review.

### 6.4 The Gamma-goes-hostile contingency

If, after notice, Gamma cuts off cooperation, the contingency runbook:

**Day 0 (notice given):**
- All daily snapshots already in R2
- Webhook capture already running for 0+ days (depending on timing)
- Cutover script ready and tested

**Day 1-2 if Gamma turns off admin access:**
- Last night's snapshot is the import base
- Webhook capture fills any gap from snapshot to disconnection time
- Trigger early cutover: 72 hours from disconnection

**Day 1-2 if Gamma deletes our data on their side:**
- Our snapshots are unaffected (they're in our R2)
- Webhook capture continues
- Players keep playing on Gamma until cutover (Gamma's deletion doesn't affect their UX)
- Trigger early cutover: 72 hours from detection

**Day 1-2 if Gamma sends a cease-and-desist over the data we exported:**
- Legal already reviewed our right to operator data
- Continue plan
- Engage counsel for response

The whole point: at no point in the 30-day window are we dependent on
Gamma's cooperation for cutover to succeed.

---

## 7. Cutover night runbook

### 7.1 Pre-cutover (T-7 days)

- Final dry run with that week's snapshot — all hard validations pass
- Communication to players: "Maintenance window MM/DD from HH:MM-HH:MM ET. Site will be unavailable. Your balance and account history will be preserved."
- Hot-standby Vercel deployment ready
- DNS TTL lowered to 60 seconds (from default 3600)
- On-call rotation set: 4 engineers on standby
- War room Slack channel created

### 7.2 T-24 hours

- Final daily snapshot pulled and validated as complete
- Final webhook routing check: are we capturing?
- Status page set to "Scheduled maintenance" with countdown

### 7.3 T-0 (cutover begins)

Cutover window: estimated 4 hours, allocated as:

```
T+0:00   Set maintenance mode on coinfrenzy.com (via Gamma) → all writes blocked
T+0:05   Pull final Gamma snapshot
T+0:15   Begin import on production Neon
T+0:45   Import complete; reconciliation begins
T+1:00   Run all hard validations
T+1:15   Spot-check 20 random players in admin
T+1:30   Replay captured webhooks from snapshot time onward
T+1:45   Run reconciliation again
T+2:00   DNS flip: coinfrenzy.com → new Vercel deployment
T+2:05   Smoke test (login as test player, view balance, view history)
T+2:15   Open to 10% of traffic via gradual ramp
T+2:30   Open to 50%
T+2:45   Open to 100%
T+3:00   Monitor for 1 hour with all hands
T+4:00   Maintenance window ends; war room stays staffed
```

### 7.4 Smoke test checklist

Before opening to traffic:
- [ ] Test player login works
- [ ] Test player sees correct SC balance
- [ ] Test player sees full purchase history
- [ ] Test player sees full redemption history
- [ ] Test player can browse games
- [ ] Test player launches a game (Alea integration live)
- [ ] Test player places a real-money bet (verify ledger writes)
- [ ] Admin login works
- [ ] Admin can search players
- [ ] Admin can see real-time dashboard
- [ ] CRM dashboard shows current numbers
- [ ] Self-excluded user is blocked from login (test with one)
- [ ] Footprint webhook arrives and processes
- [ ] Finix webhook arrives and processes

If ANY check fails: ABORT and roll back DNS to Gamma.

### 7.5 Rollback plan

If cutover fails any validation:

1. DNS flips back to Gamma (60-second TTL means recovery within 1 min)
2. Gamma maintenance mode is lifted (they handle this)
3. Our captured webhooks remain captured; no harm
4. Post-mortem; fix; retry in a future window

Players see ~5 minutes of "site is down" and then Gamma is back.

---

## 8. Post-cutover

### 8.1 The first 24 hours

- All hands on deck
- Real-time monitoring of: ledger writes, webhook receipts, error rates,
  player support tickets, dashboard accuracy
- Hourly reconciliation checks (not just nightly)
- Incident response posture: SEV-1 in 5 minutes for any anomaly

### 8.2 The first week

- Daily reconciliation reports compared to Gamma's last-known totals
- Daily report on top-50 players: are they playing? are they happy?
- Support ticket categorization to spot patterns
- Performance monitoring against the budgets in Doc 01 §8

### 8.3 The first month

- Full audit log review for anything anomalous
- Player retention analysis (did anyone bounce due to migration?)
- Reconciliation against Alea ledger (do our records match theirs?)
- Optimove cancellation (we're on our in-house CRM now)
- Gamma sunset completion (data archive, contract close-out)

### 8.4 Gamma data archive

After cutover, we keep the final Gamma snapshot indefinitely in cold
storage:
- `gamma-final-snapshot/` in R2 with restricted access
- One-way mirror of every CSV they exported
- Encrypted at rest
- Access requires master admin + legal sign-off
- Retention: 7 years (financial records) or per state requirements

---

## 9. What's still pending

These need the API docs and data to finalize:

- **Alea round replay** — depends on Alea API for historical round data (§2.6)
- **Footprint KYC level back-fetch** — depends on Footprint API (§4.7)
- **Webhook dual-routing per provider** — depends on each provider's webhook configuration UI (§6.1)
- **The "Casino Transaction" export** — when it arrives, refines §2.6

---

## 10. Cross-references

- **Doc 04 §3** — exact ledger transaction shapes for each migrated event type
- **Doc 09** — security model for the migration data (encrypted at rest, scoped access)
- **Doc 03 v2 §13** — schema for migration_imports, migration_id_map, migration_column_mappings
- **Doc 02** — the worker app where the import job lives (`apps/worker/src/jobs/gamma-import.ts`)
