# CoinFrenzy Platform — Bonus Engine & Playthrough

**Document:** 06 of 13
**Reads:** Doc 03 v2 (Data Model, especially §5), Doc 04 (Ledger §3.4, §3.5), Doc 05 (Alea round events)
**Read before:** Doc 07 (Redemption — uses playthrough state)
**Purpose:** The variable-playthrough engine that Gamma can't do. Per-bonus playthrough configuration, the 14 bonus types and their triggers, the EasyScam AMOE adapter, playthrough progression rules, edge cases.

---

## 1. Why this is the most product-differentiating doc

You said this directly: Gamma's biggest limitation is the inability to set playthrough requirements per bonus / promo / package. Operators across the industry treat playthrough as a single global setting — "all bonus SC is 3x" — and either accept the player-economics constraint that imposes, or hack around it by manually adjusting balances.

The product opportunity is to make playthrough **configurable at every level of granularity**:
- Per bonus template (welcome = 3x, daily = 1x, jackpot = 5x)
- Per package (high-value packages get reduced playthrough as a perk)
- Per promo code (VIP10 = 1x even though the underlying bonus is 3x)
- Per game-type within a bonus (slots count 100%, blackjack 25%)
- With a time window (this welcome bonus expires in 7 days)
- With bet limits (no spinning at min bet to game playthrough)
- With stacking rules (some bonuses are exclusive, some stack)

This document specifies the engine that makes all of that work and stays correct under concurrent load.

---

## 2. The data model recap

From Doc 03 v2 §5, the relevant tables:

**`bonuses`** — templates. Each template carries:
- `award_gc`, `award_sc` — fixed amounts or `award_formula` for dynamic
- `playthrough_multiplier` — default 3.0 for SC bonuses
- `playthrough_window_hours` — NULL = no expiry
- `game_weight_overrides` — JSONB, NULL = use game defaults
- `min_bet_for_contribution` — anti-abuse floor
- `max_bet_during_playthrough` — anti-abuse ceiling
- `min_tier_id` — eligibility
- `max_per_player` — lifetime cap
- `cooldown_hours` — between awards
- `stackable` — bool

**`bonuses_awarded`** — instances. Each award snapshots config at award time:
- `playthrough_multiplier_snapshot`
- `game_weight_overrides_snapshot`
- `min_bet_for_contribution_snapshot`
- `max_bet_during_playthrough_snapshot`
- `playthrough_required` (= award_sc × multiplier)
- `playthrough_progress` (accumulates)
- `expires_at`
- `status` — `active | completed | expired | forfeited | reversed`

**Why snapshot config:** if an admin edits the welcome bonus template later (raises multiplier from 3x to 5x), the change must apply to future awards only. Snapshotting locks the contract for already-awarded bonuses.

---

## 3. The 14 bonus types and their triggers

From the Gamma MERV report, we know these are the 14 types that exist in real operations. Each has a different *trigger event* (what causes the engine to award it) and different *defaults*.

| Type | Trigger | Default award | Default playthrough | Default window |
| --- | --- | --- | --- | --- |
| `welcome` | First completed purchase | Variable per package | 3x | 7 days |
| `tier_up` | Player.tier.up CRM event | Per-tier table | 3x | 14 days |
| `weekly_tier` | Cron: weekly per active tiered player | Per-tier table | 1x | 7 days |
| `monthly_tier` | Cron: monthly per active tiered player | Per-tier table | 1x | 30 days |
| `package` | Purchase of specific package | Per-package config | 3x (or per package) | 7 days |
| `daily` | First login each calendar day | Tier-scaled | 1x | 24 hours |
| `jackpot` | Game round win exceeds threshold | Variable | 5x | 14 days |
| `referral` | Referred friend completes first purchase | Fixed | 3x | 30 days |
| `affiliate` | Lightning Bolt payout to affiliate's player account | Per affiliate-deal config | 0x (no playthrough) | None |
| `promotion` | Admin manually adds in CRM Promotion section | Variable | Variable | Variable |
| `amoe` | Mail-in entry via EasyScam | Fixed (e.g. $1 SC) | 1x | 30 days |
| `admin_added_sc` | Manual admin adjustment (Doc 04 §3.11) | Variable | 0x or admin choice | Variable |
| `crm_promocode` | Player redeems CRM-issued promo code | Per code config | Per code config | Per code config |
| `purchase_promocode` | Player applies promo code at purchase | Per code config | Per code config | Per code config |

The point: every type has a different *award trigger* and different *defaults*. The engine handles all 14 through a single award path with type-specific eligibility logic.

---

## 4. The award path

This is the single entry point. Every bonus award flows through it.

```typescript
// packages/core/src/bonus/engine.ts

export async function award(
  ctx: Context,
  spec: AwardSpec
): Promise<Result<AwardResult, AwardError>> {
  
  return ctx.db.transaction({ isolationLevel: 'serializable' }, async (tx) => {
    
    // ─────────────────────────────────────────────────────────
    // STEP 1 — Load the bonus template
    // ─────────────────────────────────────────────────────────
    const bonus = await tx.bonuses.findById(spec.bonusId);
    if (!bonus || bonus.status !== 'active') {
      return err({ code: 'BONUS_NOT_ACTIVE' });
    }
    
    // ─────────────────────────────────────────────────────────
    // STEP 2 — Eligibility checks (type-agnostic)
    // ─────────────────────────────────────────────────────────
    const player = await tx.players.findById(spec.playerId);
    if (!player || player.deleted_at) return err({ code: 'PLAYER_NOT_FOUND' });
    if (player.status !== 'active') return err({ code: 'PLAYER_NOT_ELIGIBLE' });
    
    // Self-exclusion blocks all bonuses
    const selfExcluded = await tx.compliance_flags.findActive(
      spec.playerId, 'self_exclusion'
    );
    if (selfExcluded) return err({ code: 'SELF_EXCLUDED' });
    
    // Min tier check
    if (bonus.min_tier_id) {
      const tier = await tx.tier_progress.findOne({ player_id: spec.playerId });
      if (!tier || tier.current_tier_level < bonus.min_tier_level) {
        return err({ code: 'TIER_INSUFFICIENT' });
      }
    }
    
    // Max-per-player check
    if (bonus.max_per_player) {
      const previousAwards = await tx.bonuses_awarded.count({
        player_id: spec.playerId,
        bonus_id: bonus.id,
      });
      if (previousAwards >= bonus.max_per_player) {
        return err({ code: 'MAX_AWARDS_REACHED' });
      }
    }
    
    // Cooldown check
    if (bonus.cooldown_hours) {
      const latestAward = await tx.bonuses_awarded.findLatest({
        player_id: spec.playerId,
        bonus_id: bonus.id,
      });
      if (latestAward && hoursSince(latestAward.created_at) < bonus.cooldown_hours) {
        return err({ code: 'COOLDOWN_ACTIVE', retry_after: ... });
      }
    }
    
    // Stacking check
    if (!bonus.stackable) {
      const existing = await tx.bonuses_awarded.findOne({
        player_id: spec.playerId,
        bonus_id: bonus.id,
        status: 'active',
      });
      if (existing) return err({ code: 'NOT_STACKABLE_ACTIVE_EXISTS' });
    }
    
    // ─────────────────────────────────────────────────────────
    // STEP 3 — Idempotency check (source + sourceId)
    // ─────────────────────────────────────────────────────────
    if (spec.sourceKind && spec.sourceId) {
      const existing = await tx.bonuses_awarded.findOne({
        source_kind: spec.sourceKind,
        source_id: spec.sourceId,
      });
      if (existing) {
        return ok({ status: 'duplicate', awardId: existing.id });
      }
    }
    
    // ─────────────────────────────────────────────────────────
    // STEP 4 — Compute award amounts
    // ─────────────────────────────────────────────────────────
    const amounts = await computeAwardAmounts(bonus, player, spec.context);
    // Returns: { gc: bigint, sc: bigint }
    
    // ─────────────────────────────────────────────────────────
    // STEP 5 — Compute playthrough requirement
    // ─────────────────────────────────────────────────────────
    const multiplier = spec.playthroughMultiplierOverride 
                      ?? bonus.playthrough_multiplier;
    
    const playthroughRequired = (amounts.sc * multiplier).toString();
    
    // ─────────────────────────────────────────────────────────
    // STEP 6 — Compute expiry
    // ─────────────────────────────────────────────────────────
    const windowHours = spec.playthroughWindowOverride 
                       ?? bonus.playthrough_window_hours;
    
    const expiresAt = windowHours 
                     ? addHours(new Date(), windowHours) 
                     : null;
    
    // ─────────────────────────────────────────────────────────
    // STEP 7 — Snapshot config at award time
    // ─────────────────────────────────────────────────────────
    const award = await tx.bonuses_awarded.insert({
      id: randomUUID(),
      player_id: spec.playerId,
      bonus_id: bonus.id,
      gc_amount: amounts.gc,
      sc_amount: amounts.sc,
      playthrough_multiplier_snapshot: multiplier,
      playthrough_required: playthroughRequired,
      playthrough_progress: '0',
      playthrough_complete: amounts.sc === 0n,  // GC-only bonuses are auto-complete
      game_weight_overrides_snapshot: bonus.game_weight_overrides,
      min_bet_for_contribution_snapshot: bonus.min_bet_for_contribution,
      max_bet_during_playthrough_snapshot: bonus.max_bet_during_playthrough,
      expires_at: expiresAt,
      status: 'active',
      source_kind: spec.sourceKind,
      source_id: spec.sourceId,
      awarded_by_admin: spec.adminId,
      award_reason: spec.reason,
    });
    
    // ─────────────────────────────────────────────────────────
    // STEP 8 — Write ledger entries per Doc 04 §3.4
    // ─────────────────────────────────────────────────────────
    const pairId = randomUUID();
    
    const ledgerEntries = [];
    
    if (amounts.gc > 0n) {
      ledgerEntries.push(
        { account: bonusPoolGc(),                     leg: 'debit',  amount: amounts.gc },
        { account: playerWallet(spec.playerId, 'GC'), leg: 'credit', amount: amounts.gc, subBucket: 'bonus' },
      );
    }
    
    if (amounts.sc > 0n) {
      ledgerEntries.push(
        { account: bonusPoolSc(),                     leg: 'debit',  amount: amounts.sc },
        { account: playerWallet(spec.playerId, 'SC'), leg: 'credit', amount: amounts.sc, subBucket: 'bonus' },
      );
    }
    
    await ledger.write(ctx, {
      source: 'bonus_award',
      sourceId: award.id,
      pairId,
      entries: ledgerEntries,
    });
    
    await tx.bonuses_awarded.update(award.id, {
      award_pair_id: pairId,
    });
    
    // ─────────────────────────────────────────────────────────
    // STEP 9 — Update wallet rollup fields for playthrough
    // (current_balance was updated by ledger.write; we update the
    //  playthrough rollup separately)
    // ─────────────────────────────────────────────────────────
    if (amounts.sc > 0n) {
      await tx.wallets.update(
        { player_id: spec.playerId, currency: 'SC' },
        { 
          playthrough_required: sql`playthrough_required + ${playthroughRequired}`,
        }
      );
    }
    
    // ─────────────────────────────────────────────────────────
    // STEP 10 — Audit + CRM event + UI push
    // ─────────────────────────────────────────────────────────
    await audit.write(ctx, {
      action: 'bonus.awarded',
      resource_kind: 'bonus_award',
      resource_id: award.id,
      actor_kind: spec.adminId ? 'admin' : 'system',
      actor_id: spec.adminId,
    });
    
    await events.emit(ctx, {
      name: 'player.bonus.awarded',
      data: {
        playerId: spec.playerId,
        bonusId: bonus.id,
        bonusType: bonus.bonus_type,
        scAmount: amounts.sc.toString(),
        gcAmount: amounts.gc.toString(),
      },
    });
    
    ctx.afterCommit(async () => {
      await pusher.trigger(`private-player-${spec.playerId}`, 'bonus-awarded', {
        bonusName: bonus.display_name,
        scAmount: amounts.sc.toString(),
        gcAmount: amounts.gc.toString(),
      });
    });
    
    return ok({ status: 'awarded', awardId: award.id });
  });
}
```

---

## 5. Award amount computation

For most bonuses the amount is a fixed `award_sc` / `award_gc`. For dynamic awards, the `award_formula` JSONB drives computation:

```typescript
// packages/core/src/bonus/compute-amount.ts

export async function computeAwardAmounts(
  bonus: Bonus,
  player: Player,
  context?: AwardContext
): Promise<{ gc: bigint; sc: bigint }> {
  
  // Static amounts override formulas
  if (bonus.award_gc > 0n || bonus.award_sc > 0n) {
    return { gc: bonus.award_gc, sc: bonus.award_sc };
  }
  
  // Formula-based
  if (!bonus.award_formula) {
    return { gc: 0n, sc: 0n };
  }
  
  const formula = bonus.award_formula;
  
  switch (formula.type) {
    case 'pct_of_purchase':
      // Example: welcome bonus = 20% of first purchase as SC
      if (!context?.purchaseAmount) throw new Error('purchase context required');
      const sc = (context.purchaseAmount * BigInt(formula.pct * 100)) / 100n;
      return { gc: 0n, sc };
    
    case 'tier_match':
      // Example: weekly tier bonus uses a lookup table per tier
      const tier = await db.tier_progress.findOne({ player_id: player.id });
      const tierLevel = tier?.current_tier_level ?? 1;
      const tierConfig = formula.tier_table[tierLevel];
      return { gc: BigInt(tierConfig.gc), sc: BigInt(tierConfig.sc) };
    
    case 'tier_pct_of_purchase':
      // Tier-scaled percentage of purchase
      const tier2 = await db.tier_progress.findOne({ player_id: player.id });
      const pct = formula.pct_by_tier[tier2.current_tier_level] ?? formula.default_pct;
      return { gc: 0n, sc: (context.purchaseAmount * BigInt(pct * 100)) / 100n };
    
    case 'fixed_with_streak_multiplier':
      // Daily login bonus that grows with consecutive days
      const streak = await getDailyLoginStreak(player.id);
      const mult = Math.min(streak, formula.max_streak);
      return { gc: 0n, sc: BigInt(formula.base_sc) * BigInt(mult) };
    
    // ... other formula types as needed
  }
}
```

Formulas are stored as JSONB so they're admin-editable without code changes.

---

## 6. Playthrough progression — the bet handler

This is the hot path. Every `round.bet` event from Alea (Doc 05 §5.5) calls into this:

```typescript
// packages/core/src/bonus/playthrough.ts

export async function recordBet(
  ctx: Context,
  spec: BetSpec
): Promise<void> {
  
  // Only SC bets contribute to playthrough (GC is non-redeemable)
  if (spec.currency !== 'SC') return;
  
  // Find player's active bonuses with outstanding playthrough
  const activeBonuses = await ctx.db.bonuses_awarded.find({
    player_id: spec.playerId,
    status: 'active',
    playthrough_complete: false,
  });
  
  if (activeBonuses.length === 0) return;
  
  // Get game info for weight calculation
  const game = await ctx.db.games.findById(spec.gameId);
  
  for (const award of activeBonuses) {
    // ─────────────────────────────────────────────────────────
    // Per-bonus contribution check
    // ─────────────────────────────────────────────────────────
    
    // 1. Min bet check (anti-abuse: prevent 0.01 SC spamming for playthrough)
    if (award.min_bet_for_contribution_snapshot && 
        spec.amount < award.min_bet_for_contribution_snapshot) {
      continue;  // bet doesn't count toward this bonus
    }
    
    // 2. Max bet check (anti-abuse: prevent big-bet variance manipulation)
    if (award.max_bet_during_playthrough_snapshot && 
        spec.amount > award.max_bet_during_playthrough_snapshot) {
      // Bet placed exceeded the cap — flag for review but don't reject
      // (the bet has already happened in Alea; we can't undo it)
      await ctx.db.compliance_flags.insert({
        player_id: spec.playerId,
        flag_type: 'fraud',
        severity: 'warn',
        reason: `Bet ${spec.amount} exceeds bonus max bet ${award.max_bet_during_playthrough_snapshot}`,
      });
      continue;
    }
    
    // 3. Compute contribution weight for this game type
    const weight = computeGameWeight(award, game);
    if (weight === 0) continue;  // game doesn't contribute at all
    
    const contribution = (spec.amount * BigInt(Math.floor(weight * 10000))) / 10000n;
    
    // ─────────────────────────────────────────────────────────
    // Apply the contribution
    // ─────────────────────────────────────────────────────────
    const newProgress = award.playthrough_progress + contribution;
    const isComplete = newProgress >= award.playthrough_required;
    
    await ctx.db.bonuses_awarded.update(award.id, {
      playthrough_progress: isComplete ? award.playthrough_required : newProgress,
      playthrough_complete: isComplete,
      // status stays 'active' until we explicitly release (next step)
    });
    
    // Also update wallet-level rollup (denormalized for fast UI reads)
    await ctx.db.wallets.update(
      { player_id: spec.playerId, currency: 'SC' },
      { playthrough_progress: sql`playthrough_progress + ${contribution}` }
    );
    
    // ─────────────────────────────────────────────────────────
    // If complete: release the bonus
    // ─────────────────────────────────────────────────────────
    if (isComplete) {
      await releasePlaythrough(ctx, award.id);
    }
  }
  
  // Record this contribution for audit trail
  await ctx.db.playthrough_contributions.insert({
    bet_round_id: spec.roundId,
    player_id: spec.playerId,
    contributions: activeBonuses.map(b => ({
      bonus_award_id: b.id,
      contribution: spec.amount,  // simplified; actual contribution after weight
    })),
  });
}
```

**Why per-bonus and not per-wallet:** the wallet has ONE `playthrough_required` rollup, but the player may have MULTIPLE active bonuses. Each contributes separately. The wallet-level rollup is the SUM for fast UI display.

---

## 7. Game weight computation

The game weight determines how much a bet contributes to playthrough. Default weights come from `games.playthrough_weight`. Per-bonus overrides via `game_weight_overrides_snapshot`.

```typescript
function computeGameWeight(award: BonusAwarded, game: Game): number {
  // Per-bonus overrides take precedence
  const overrides = award.game_weight_overrides_snapshot;
  if (overrides) {
    // Try category match
    if (overrides[game.category] !== undefined) {
      return overrides[game.category];
    }
    // Try specific game ID
    if (overrides[`game:${game.id}`] !== undefined) {
      return overrides[`game:${game.id}`];
    }
    // Override defines an explicit default for this bonus
    if (overrides.default !== undefined) {
      return overrides.default;
    }
  }
  
  // Fall back to game's default weight
  return game.playthrough_weight;
}
```

**Industry-standard defaults** (set per game in `games.playthrough_weight`):

| Game category | Default weight |
| --- | --- |
| Slots | 1.00 (100% contributes) |
| Originals (CoinFrenzy in-house games) | 1.00 |
| Video poker | 0.50 |
| Table games (blackjack, roulette) | 0.25 |
| Live dealer | 0.10 |

Operators often tighten these for specific bonuses. Example: "Welcome bonus: only slots and originals count" → `game_weight_overrides = { slots: 1.0, originals: 1.0, default: 0 }`.

---

## 8. The playthrough release transaction

When `playthrough_progress >= playthrough_required`, we release the bonus. Per Doc 04 §3.5, this writes a ledger entry that reclassifies the bonus SC sub-bucket from `bonus` to `earned`:

```typescript
async function releasePlaythrough(ctx: Context, awardId: string): Promise<void> {
  const award = await ctx.db.bonuses_awarded.findById(awardId);
  if (!award || award.status !== 'active') return;
  
  // Find the current SC balance in the bonus sub-bucket for this player
  // We release only the amount that's actually still in 'bonus' bucket
  // (some may have been spent already since bonus is drained LAST)
  
  const wallet = await ctx.db.wallets.findOne({
    player_id: award.player_id,
    currency: 'SC',
  });
  
  // Amount to release = min(remaining bonus balance, this award's sc_amount)
  // In practice, if the player completed playthrough, they had enough to bet
  // through, so most or all of the bonus SC remains in the bucket (they spent
  // their purchased/earned SC first).
  const releaseAmount = min(wallet.balance_bonus, award.sc_amount);
  
  if (releaseAmount > 0n) {
    const pairId = randomUUID();
    
    await ledger.write(ctx, {
      source: 'playthrough_release',
      sourceId: award.id,
      pairId,
      entries: [
        { account: playerWallet(award.player_id, 'SC'), leg: 'debit',  amount: releaseAmount, subBucket: 'bonus' },
        { account: playerWallet(award.player_id, 'SC'), leg: 'credit', amount: releaseAmount, subBucket: 'earned' },
      ],
    });
    
    // Update wallet sub-buckets
    await ctx.db.wallets.update(
      { player_id: award.player_id, currency: 'SC' },
      {
        balance_bonus: sql`balance_bonus - ${releaseAmount}`,
        balance_earned: sql`balance_earned + ${releaseAmount}`,
        playthrough_required: sql`playthrough_required - ${award.playthrough_required}`,
        playthrough_progress: sql`playthrough_progress - ${award.playthrough_progress}`,
      }
    );
    
    await ctx.db.bonuses_awarded.update(award.id, {
      status: 'completed',
      release_pair_id: pairId,
      completed_at: new Date(),
    });
  }
  
  // CRM event — "your bonus is now redeemable"
  await events.emit(ctx, {
    name: 'player.bonus.playthrough_completed',
    data: { playerId: award.player_id, bonusAwardId: award.id },
  });
  
  // UI push
  await pusher.trigger(`private-player-${award.player_id}`, 'playthrough-released', {
    bonusAwardId: award.id,
    amount: releaseAmount.toString(),
  });
}
```

**The audit-trail value of having this as a ledger entry** (rather than a silent UPDATE) was the topic of an earlier decision (Doc 04 §3.5 — "trust your call → keep the ledger entry"). A regulator asking "when did this player's bonus SC become redeemable?" gets a direct query result.

---

## 9. The expiry job

Bonuses with `expires_at` in the past must be marked as `expired` and their unmet playthrough discarded. Hourly cron:

```typescript
// apps/worker/src/jobs/expire-bonuses.ts

export const expireBonuses = inngest.createFunction(
  { id: 'expire-bonuses' },
  { cron: '0 * * * *' },  // every hour at :00
  async () => {
    const expired = await db.bonuses_awarded.find({
      status: 'active',
      expires_at: { lt: new Date() },
      playthrough_complete: false,
    });
    
    for (const award of expired) {
      // Compute how much bonus SC is being clawed back
      // (only the un-converted portion — anything in 'bonus' sub-bucket)
      await db.transaction(async (tx) => {
        const wallet = await tx.wallets.findOne({
          player_id: award.player_id,
          currency: 'SC',
        });
        
        // Amount to claw back = min(award sc_amount, current bonus bucket)
        const clawback = min(award.sc_amount, wallet.balance_bonus);
        
        if (clawback > 0n) {
          await ledger.write(ctx, {
            source: 'bonus_expired',
            sourceId: award.id,
            entries: [
              { account: playerWallet(award.player_id, 'SC'), leg: 'debit',  amount: clawback, subBucket: 'bonus' },
              { account: bonusPoolSc(),                       leg: 'credit', amount: clawback },
            ],
          });
          
          await tx.wallets.update(
            { player_id: award.player_id, currency: 'SC' },
            {
              balance_bonus: sql`balance_bonus - ${clawback}`,
              playthrough_required: sql`playthrough_required - ${award.playthrough_required - award.playthrough_progress}`,
            }
          );
        }
        
        await tx.bonuses_awarded.update(award.id, {
          status: 'expired',
          completed_at: new Date(),
        });
      });
      
      await events.emit(ctx, {
        name: 'player.bonus.expired',
        data: { playerId: award.player_id, bonusAwardId: award.id },
      });
    }
    
    logger.info('bonuses_expired', { count: expired.length });
  }
);
```

---

## 10. The drain order — why bonus SC is spent last

Doc 04 §3.2 established the spend order: `purchased → earned → promo → bonus`. The point is to make sure bonus SC is the last thing a player spends. Concretely:

When a player places a 1 SC bet:
- If they have 1 SC in `purchased`: drain from there. Bonus SC untouched, playthrough doesn't progress.
- If they have 0 SC in `purchased` but 1 SC in `earned`: drain from earned.
- ...same for `promo`
- Only when `purchased + earned + promo = 0` does the bet drain from `bonus`.

**Why this matters:** if you drained bonus first, players would never have to use their real money — they'd just play with bonus SC, complete playthrough on the bonus easily, and redeem the resulting earned SC as cash. Operators that drain bonus-first have ~3x the redemption rate of well-designed operators. Drain-bonus-last forces players to put real money in play before they can redeem.

The implementation lives in the `drainOrder` helper called by the ledger write for bets:

```typescript
function determineBetDrainBucket(
  wallet: Wallet,
  amount: bigint
): { bucket: SubBucket; coversFully: boolean } {
  if (wallet.balance_purchased >= amount) return { bucket: 'purchased', coversFully: true };
  if (wallet.balance_earned    >= amount) return { bucket: 'earned',    coversFully: true };
  if (wallet.balance_promo     >= amount) return { bucket: 'promo',     coversFully: true };
  if (wallet.balance_bonus     >= amount) return { bucket: 'bonus',     coversFully: true };
  
  // Cross-bucket bet — uncommon but possible
  // For simplicity, return the deepest bucket that has any amount;
  // the ledger write handles the cross-bucket case by writing multiple debits
  return { bucket: 'cross', coversFully: false };
}
```

Cross-bucket bets write multiple debit entries within one ledger transaction (one per sub-bucket that contributed).

---

## 11. The AMOE adapter (EasyScam integration)

For sweepstakes compliance, US law requires a free entry method (Alternative Method of Entry). You use EasyScam — they receive mail-in entries and deliver them to us as a data feed.

```typescript
// packages/core/src/adapters/easyscam/index.ts

export class EasyScamAdapter {
  
  async pollEntries(): Promise<EasyScamEntry[]> {
    // EasyScam exposes a REST API for fetching entries received since last poll
    const response = await fetch(`${env.EASYSCAM_API_BASE}/entries`, {
      headers: { Authorization: `Bearer ${env.EASYSCAM_API_KEY}` },
      params: { since: await getLastPolledTimestamp() },
    });
    return response.entries;
  }
  
  async processEntry(entry: EasyScamEntry): Promise<void> {
    // 1. Find player by email/name match (EasyScam captures the requester info)
    const player = await db.players.findByEmail(entry.email);
    if (!player) {
      // Mail-in from someone who isn't a player — create an account?
      // Decision: NO. We only credit AMOE to existing accounts. Surface this
      // case in a manual review queue (admin can match to a player if obvious).
      await db.amoe_review_queue.insert({
        easyscam_entry_id: entry.id,
        email: entry.email,
        name: entry.name,
        status: 'unmatched',
      });
      return;
    }
    
    // 2. Eligibility (same as normal bonus award)
    const eligibility = await this.checkAmoeEligibility(player);
    if (!eligibility.allowed) {
      logger.info('amoe_entry_rejected', { entryId: entry.id, reason: eligibility.reason });
      return;
    }
    
    // 3. Award the AMOE bonus via the standard award path
    await bonusEngine.award(ctx, {
      playerId: player.id,
      bonusId: AMOE_BONUS_ID,  // singleton AMOE bonus template
      sourceKind: 'easyscam',
      sourceId: entry.id,
      reason: `AMOE entry received ${entry.received_at}`,
    });
  }
  
  async checkAmoeEligibility(player: Player): Promise<EligibilityCheck> {
    // 1. Player must be in an allowed state (same as redemption rules)
    if (BLOCKED_STATES.has(player.state)) {
      return { allowed: false, reason: 'state_blocked' };
    }
    
    // 2. Max one AMOE entry per player per day (anti-abuse)
    const today = startOfDay(new Date());
    const todayCount = await db.bonuses_awarded.count({
      player_id: player.id,
      bonus_id: AMOE_BONUS_ID,
      created_at: { gte: today },
    });
    if (todayCount >= 1) {
      return { allowed: false, reason: 'daily_limit_exceeded' };
    }
    
    // 3. Not currently self-excluded
    const selfExcluded = await db.compliance_flags.findActive(player.id, 'self_exclusion');
    if (selfExcluded) return { allowed: false, reason: 'self_excluded' };
    
    return { allowed: true };
  }
}

// Worker job that polls EasyScam every 15 minutes
export const pollEasyscam = inngest.createFunction(
  { id: 'poll-easyscam' },
  { cron: '*/15 * * * *' },
  async () => {
    const adapter = new EasyScamAdapter();
    const entries = await adapter.pollEntries();
    for (const entry of entries) {
      await adapter.processEntry(entry);
    }
    await setLastPolledTimestamp(new Date());
  }
);
```

The AMOE bonus template (`AMOE_BONUS_ID`) is a singleton with:
- `bonus_type = 'amoe'`
- `award_sc = $1.00` (or whatever the legal-equivalent minimum is)
- `playthrough_multiplier = 1.0` (light playthrough — it's free SC, can't have onerous strings attached or the AMOE isn't a real alternative)
- `playthrough_window_hours = 30 * 24` (30 days)
- `max_per_player = NULL` (no lifetime cap; AMOE is unlimited)
- `cooldown_hours = NULL` (the per-day limit is enforced by adapter logic, not bonus engine)

---

## 12. Promo code redemption

When a player enters a promo code at signup, on purchase, or in a marketing email, the engine validates and awards:

```typescript
// packages/core/src/bonus/redeem-promo.ts

export async function redeemPromoCode(
  ctx: Context,
  spec: { playerId: string; code: string; context?: 'signup' | 'purchase' | 'standalone' }
): Promise<Result<RedeemResult, RedeemError>> {
  
  return ctx.db.transaction({ isolationLevel: 'serializable' }, async (tx) => {
    // 1. Find the promo code
    const promo = await tx.promo_codes.findOne({ code: spec.code });
    if (!promo) return err({ code: 'CODE_NOT_FOUND' });
    if (promo.status !== 'active') return err({ code: 'CODE_INACTIVE' });
    
    // 2. Validity window check
    if (promo.valid_from && new Date() < promo.valid_from) return err({ code: 'CODE_NOT_YET_VALID' });
    if (promo.valid_until && new Date() > promo.valid_until) return err({ code: 'CODE_EXPIRED' });
    
    // 3. Usage cap check
    if (promo.max_total_uses && promo.uses_count >= promo.max_total_uses) {
      return err({ code: 'CODE_USAGE_EXCEEDED' });
    }
    
    // 4. Per-player cap
    if (promo.max_per_player) {
      const usedByPlayer = await tx.promo_redemptions.count({
        player_id: spec.playerId,
        promo_code_id: promo.id,
      });
      if (usedByPlayer >= promo.max_per_player) {
        return err({ code: 'PLAYER_CODE_USAGE_EXCEEDED' });
      }
    }
    
    // 5. Context check
    if (promo.required_context && promo.required_context !== spec.context) {
      return err({ code: 'CODE_REQUIRES_CONTEXT', expected: promo.required_context });
    }
    
    // 6. Domain block list check
    const player = await tx.players.findById(spec.playerId);
    const emailDomain = player.email.split('@')[1];
    if (await isBlockedDomain(emailDomain)) {
      return err({ code: 'BLOCKED_DOMAIN' });
    }
    
    // 7. Award the linked bonus, with promo-specific overrides
    const awardResult = await award(ctx, {
      playerId: spec.playerId,
      bonusId: promo.bonus_id,
      sourceKind: 'promo_code',
      sourceId: promo.id,
      playthroughMultiplierOverride: promo.playthrough_multiplier ?? undefined,
      playthroughWindowOverride: promo.playthrough_window_hours ?? undefined,
      reason: `Promo code: ${promo.code}`,
    });
    
    if (!awardResult.ok) return err(awardResult.error);
    
    // 8. Record the redemption
    await tx.promo_redemptions.insert({
      promo_code_id: promo.id,
      player_id: spec.playerId,
      bonus_award_id: awardResult.value.awardId,
      redeemed_at: new Date(),
    });
    
    // 9. Increment global usage count
    await tx.promo_codes.update(promo.id, {
      uses_count: sql`uses_count + 1`,
    });
    
    return ok({ awardId: awardResult.value.awardId });
  });
}
```

The override mechanism makes the variable playthrough requirement work at the promo level: a single bonus template ("Welcome 100 SC") can be linked to multiple promo codes (`WELCOME10`, `VIP_LAUNCH`, `BLACKFRIDAY`), each with their own playthrough multiplier override.

---

## 13. The trigger taxonomy

Each of the 14 bonus types has a different code path that decides WHEN to fire the award. Listed here, with reference to where the trigger lives:

| Type | Trigger location | Trigger event/condition |
| --- | --- | --- |
| `welcome` | `core/purchase.ts` after first successful purchase | First-ever `purchase.completed` |
| `tier_up` | `core/tier/progression.ts` on tier change | `player.tier.up` |
| `weekly_tier` | `apps/worker/src/jobs/weekly-bonuses.ts` | Cron: Mondays 9am |
| `monthly_tier` | `apps/worker/src/jobs/monthly-bonuses.ts` | Cron: 1st of month 9am |
| `package` | `core/purchase.ts` after successful purchase | Package has `bonus_id` set |
| `daily` | `core/auth/login.ts` after successful login | First login of calendar day |
| `jackpot` | `core/games/round-handler.ts` on big win | Round win exceeds threshold |
| `referral` | `core/affiliate/referral.ts` on referred-friend signup | Referee makes first purchase |
| `affiliate` | `apps/worker/src/jobs/affiliate-payouts.ts` | Monthly cycle |
| `promotion` | Admin manually fires via Admin → Bonus → Manual Award | Admin action |
| `amoe` | `core/adapters/easyscam/index.ts` | EasyScam entry received |
| `admin_added_sc` | Admin → Admin Adjustments | Admin action |
| `crm_promocode` | `core/bonus/redeem-promo.ts` triggered from CRM email link | Player clicks email CTA |
| `purchase_promocode` | `core/purchase.ts` when code entered at checkout | Player enters code |

Each trigger location is responsible for collecting the right context, then calling `bonusEngine.award()` with the right parameters.

---

## 14. The redemption gate

Before a redemption can proceed (Doc 07), we check the wallet has enough *redeemable* SC. The redeemable amount = `balance_purchased + balance_earned`. The `balance_bonus` and `balance_promo` buckets are explicitly NOT included.

```typescript
function getRedeemableBalance(wallet: Wallet): bigint {
  return wallet.balance_purchased + wallet.balance_earned;
}
```

If a player has 100 SC total, of which 30 SC is in `bonus` (not yet played through), they can only redeem the remaining 70 SC. The redemption UI shows this clearly:

```
Your SC balance:           100.00 SC
Available to redeem:        70.00 SC
Locked in bonuses:          30.00 SC (complete 60 SC more wagering to unlock)
```

The "complete X SC more wagering" comes from `playthrough_required - playthrough_progress` across active bonuses.

---

## 15. Anti-abuse mechanisms

The variable-playthrough engine exposes some new attack surfaces. We mitigate:

**Attack 1: Min-bet farming.** Place 100,000 bets at 0.01 SC each = 1,000 SC of "wagered volume" toward playthrough. Defense: `min_bet_for_contribution_snapshot` per bonus. Default 1.00 SC for serious bonuses.

**Attack 2: Max-bet variance abuse.** Bet huge amounts (10x average) on slots, hoping to either win big (legitimate) or hit the bottom of the bonus quickly and exit. Defense: `max_bet_during_playthrough_snapshot` per bonus. Default 5x the player's average bet or 10 SC, whichever is higher.

**Attack 3: Game-switch arbitrage.** Some games have lower house edge → favorable for grinding playthrough. Defense: `game_weight_overrides_snapshot` lets us set table games to 25% and live dealer to 10%, making slots and originals (high house edge) the preferred path.

**Attack 4: Multi-account collusion.** Sign up multiple accounts, send referral codes to each other, claim referral bonuses. Defense: handled in Doc 09 (compliance) via duplicate detection on email, phone, address, payment instrument. Not the bonus engine's job.

**Attack 5: Promo code stuffing.** Try every variation of `WELCOME10`, `WELCOME20`, etc. Defense: rate limit promo code submission (10/hour/IP), block obviously-systematic attempts in `crm_suppression`.

---

## 16. The admin surface

Doc 08 §8 (Bonus section) lays out the admin UI. From an engine perspective, every bonus operation needs to be auditable:

- Creating a bonus template → audit entry
- Editing a bonus template → audit entry, with before/after diff
- Awarding manually → audit entry
- Forcing release of a bonus's playthrough → audit entry (Master-only action; rare)
- Reversing a bonus → audit entry, ledger reversal entries

The admin can also see, per player:
- All active bonuses
- All historical bonuses (completed, expired, forfeited, reversed)
- Per-bonus playthrough progress with a visual bar
- The full ledger trail for each bonus

---

## 17. Performance

The hot path is bet handling — every Alea round event calls `recordBet()`. At 100M bets/month = ~40 bets/second average, peak ~400/sec.

Each `recordBet()` call:
- One SELECT on `bonuses_awarded` (indexed on player_id + status) — < 5ms
- N UPDATEs on `bonuses_awarded` (one per active bonus, typically 1-3) — ~3ms each
- One UPDATE on `wallets` — < 2ms
- Optional INSERT for `playthrough_contributions` audit trail — < 2ms

Total: ~15-25ms p99 per bet. Well within the Doc 04 §8 budgets.

The release transaction is rarer (fires only when a player completes playthrough on a bonus, ~0.1% of bet events) so its slightly heavier cost is fine.

The expiry job runs hourly and processes ~hundreds of expired bonuses per hour at scale. Sub-minute execution.

---

## 18. Cross-references

- **Doc 03 v2 §5** — schema for bonuses, bonuses_awarded, promo_codes
- **Doc 04 §3.4** — ledger pattern for bonus award
- **Doc 04 §3.5** — ledger pattern for playthrough release (and the "ledger entry vs silent UPDATE" decision)
- **Doc 05 §5.5** — Alea bet/win event handlers that call into this engine
- **Doc 07** — redemption gate uses playthrough state from here
- **Doc 08 §8** — admin UI for managing bonuses
- **Doc 11 §1.5** — bonus CRM events (awarded, playthrough_completed, expired, forfeited)
- **Doc 13 §4.5** — `migration_balance` synthetic bonus for Gamma cutover

---

## 19. What's next

Doc 07 (Redemption + KYC) brings together the work in Doc 04 (ledger), Doc 05 (Footprint + Finix webhooks), and Doc 06 (playthrough completion gating redemption eligibility). It's the last domain doc before the assembly phase.
