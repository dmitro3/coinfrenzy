# CoinFrenzy Platform — CRM (Events, Segments, Campaigns, Flows)

**Document:** 11 of 13
**Reads:** Doc 01-03, Doc 08 (admin UI), Doc 09 (audit + compliance)
**Read alongside:** Doc 02 (event bus pattern), Doc 12 (Reporting)
**Purpose:** Replace Optimove. Build the CRM as a first-class system. Event taxonomy, segment semantics, campaign engine, automated flow state machine.

---

## 0. Why this exists and what "first-class" means

You pay Optimove $60K+/year. That money buys you a CRM that segments
your players, runs campaigns, automates flows. It is also a black box
that ties your CRM iteration speed to their release schedule and their
support team's response time. Most operators can't iterate their CRM
weekly because Optimove is in the way.

In-house CRM removes both the cost AND the dependency. You build the
exact segments you want, change them in real-time, ship a campaign in
ten minutes, A/B test without filing a ticket. That's a strategic
advantage, not just a cost saving.

"First-class" means:
1. Events fire on every meaningful player action — captured to a queryable database, not just streamed away.
2. Segments query against pre-aggregated rollups for sub-second response at 5M players.
3. Campaigns and flows run in your worker, observable in your dashboards, debuggable in your logs.
4. The CRM uses the same auth, audit, RLS, and observability stack as the rest of the platform — not a parallel system to maintain.

---

## 1. The event taxonomy

Every player event Cursor fires uses one of these names. The taxonomy
is closed (adding a new event requires updating this doc + the typed
event union in `packages/core/src/events/index.ts`).

### 1.1 Auth events

| Event | Fired when | Common segment uses |
| --- | --- | --- |
| `player.signup` | First account created | Welcome flow trigger |
| `player.login` | Successful login | "Lapsed" detection |
| `player.login_failed` | Bad password | Security analytics |
| `player.password_reset` | Reset completed | Security analytics |
| `player.email_verified` | Email verified | Pre-purchase eligibility |
| `player.phone_verified` | Phone verified | SMS consent gate |

### 1.2 KYC events

| Event | Fired when | Common segment uses |
| --- | --- | --- |
| `player.kyc.started` | Footprint flow initiated | Drop-off analytics |
| `player.kyc.verified` | Reached level 2 | "Eligible to redeem" segment |
| `player.kyc.failed` | Footprint failed | Manual review trigger |
| `player.kyc.escalated` | Manual review needed | KYC reviewer queue |

### 1.3 Commerce events

| Event | Fired when | Common segment uses |
| --- | --- | --- |
| `player.purchase.initiated` | Player hits "buy" on a package | Cart abandonment flow |
| `player.purchase.succeeded` | Finix confirms | First-purchase flow |
| `player.purchase.failed` | Finix declines | Recovery flow |
| `player.purchase.cancelled` | Player abandons | Cart recovery |
| `player.purchase.refunded` | Refund processed | Churn analysis |
| `player.purchase.disputed` | Chargeback | Fraud flagging |
| `player.redemption.requested` | Player submits redemption | Cashier queue |
| `player.redemption.approved` | Cashier approves | Win celebration flow |
| `player.redemption.rejected` | Cashier rejects | Recovery flow |
| `player.redemption.paid` | Finix pays out | Receipt flow |

### 1.4 Gameplay events

| Event | Fired when | Common segment uses |
| --- | --- | --- |
| `player.game.session.start` | Game opened | Engagement analytics |
| `player.game.session.end` | Game closed | Session length cohorts |
| `player.game.bet` | Bet placed | Game preference segments |
| `player.game.win` | Win occurred | Big-win celebration |
| `player.game.big_win` | Win > $100 | Special celebration flow |
| `player.game.first_play` | Player's first ever game | Tutorial flow |

### 1.5 Bonus events

| Event | Fired when | Common segment uses |
| --- | --- | --- |
| `player.bonus.awarded` | Bonus credited | Welcome flow |
| `player.bonus.playthrough_started` | First bet against a bonus | "Engagement check" segment |
| `player.bonus.playthrough_progress` | Each contributing bet | n/a (volume too high) |
| `player.bonus.playthrough_completed` | Bonus playthrough met | "Ready to redeem" flow |
| `player.bonus.expired` | Bonus window passed unused | Reactivation flow |
| `player.bonus.forfeited` | Player forfeited | Recovery flow |

### 1.6 Tier events

| Event | Fired when | Common segment uses |
| --- | --- | --- |
| `player.tier.up` | Tier increased | Celebration flow |
| `player.tier.down` | Tier decreased (if implemented) | Recovery flow |
| `player.tier.weekly_bonus` | Weekly tier bonus paid | n/a (informational) |
| `player.tier.monthly_bonus` | Monthly tier bonus paid | n/a |

### 1.7 Compliance events

| Event | Fired when | Common segment uses |
| --- | --- | --- |
| `player.rg.self_excluded` | Player self-excludes | Cessation flow |
| `player.rg.limit_set` | Player sets RG limit | Acknowledgement flow |
| `player.rg.limit_reached` | Player hit a limit | Recovery flow (post-cooldown) |
| `player.suspended` | Admin suspends | Internal notification |
| `player.reactivated` | Admin lifts suspension | Welcome-back flow |

### 1.8 Engagement events

| Event | Fired when | Common segment uses |
| --- | --- | --- |
| `player.email.opened` | SendGrid pixel | Engagement scoring |
| `player.email.clicked` | SendGrid link click | Engagement scoring |
| `player.sms.delivered` | Twilio delivery confirm | Send rate analytics |
| `player.sms.clicked` | Shortened-URL click | Conversion analytics |
| `player.notification.opened` | In-app notification opened | n/a |
| `player.referral.sent` | Player invites a friend | Referral tracking |
| `player.referral.converted` | Invited friend signs up | Referral bonus trigger |

### 1.9 Admin-fired events (originate from admin actions on a player)

| Event | Fired when | Common segment uses |
| --- | --- | --- |
| `admin.player.note_added` | Note added | n/a |
| `admin.player.coin_adjustment` | Admin adjusts coins | Audit trail |
| `admin.player.tag_added` | Admin tags player | Manual cohorting |

---

## 2. How events are written (review of Doc 02)

From Doc 02 §9, the pattern: every event writes to `player_events`
synchronously AND fires through Inngest asynchronously.

```typescript
// packages/core/src/crm/events.ts

export async function emit<E extends PlayerEvent>(
  ctx: Context,
  event: E
): Promise<Result<void, EventError>> {
  
  // 1. Synchronous write to player_events (for CRM segments)
  await ctx.db.player_events.insert({
    id: randomUUID(),
    player_id: event.data.playerId,
    event_name: event.name,
    event_category: categoryFor(event.name),
    payload: event.data,
    game_id: 'gameId' in event.data ? event.data.gameId : null,
    amount: 'amount' in event.data ? event.data.amount : null,
    currency: 'currency' in event.data ? event.data.currency : null,
    created_at: new Date(),
  });
  
  // 2. Async dispatch to Inngest (for flow triggers + observability)
  ctx.afterCommit(async () => {
    try {
      await ctx.inngest.send({ name: event.name, data: event.data });
    } catch (e) {
      // Inngest down — event is still in player_events
      // Worker recovery job catches up by scanning player_events
      ctx.logger.warn('inngest_send_failed', { event: event.name, error: e });
    }
  });
  
  return ok();
}
```

**Two-write pattern.** If Inngest is down, the event is still in
`player_events` and the worker's recovery job can re-fire to Inngest
later. We never lose an event.

**Performance.** `player_events` is partitioned monthly (Doc 03 v2 §7).
Inserts are < 5ms p99. At peak we expect ~50k events/second (10k DAU
× 5 events/sec); Postgres on Neon Scale handles this comfortably.

---

## 3. Segments — the magic

A segment is a saved filter that returns "all players matching these
conditions." The interactive segment builder is the most important
piece of the admin UI from a marketing perspective.

### 3.1 The data flow

```
player action
     ↓
emit() writes to player_events
     ↓
Worker job (hourly) refreshes:
  - player_lifetime_stats
  - player_30d_stats  
  - player_game_stats
     ↓
Segment definition (filter tree) compiles to SQL
     ↓
Query runs against rollup tables (NOT player_events)
     ↓
Player IDs returned in milliseconds
```

**Why rollup tables, not direct events:** at 5M players × 200M events/month,
a query like "everyone who played roulette in the last 7 days and
wagered $250+" against `player_events` would scan billions of rows.
Against `player_game_stats` (one row per player+game) it scans 5M rows
max — usually < 1M with the right indexes.

### 3.2 The filter tree

Stored as JSONB on `crm_segments.filter_tree`. Example:

```json
{
  "operator": "AND",
  "conditions": [
    {
      "type": "demographic",
      "field": "tier_level",
      "operator": ">=",
      "value": 4
    },
    {
      "type": "behavior",
      "field": "last_30d_wagered_sc",
      "operator": ">=",
      "value": 250,
      "currency": "SC"
    },
    {
      "type": "behavior",
      "field": "game_played",
      "operator": "in",
      "value": ["roulette-evolution", "blackjack-evolution"],
      "window": "7d"
    },
    {
      "type": "engagement",
      "field": "email_consent",
      "operator": "=",
      "value": true
    },
    {
      "type": "exclusion",
      "operator": "NOT",
      "condition": {
        "type": "campaign_received",
        "campaign_id": "{recent_campaign_id}",
        "window": "3d"
      }
    }
  ]
}
```

This compiles to SQL like:

```sql
SELECT p.id
FROM players p
JOIN tier_progress tp ON tp.player_id = p.id
JOIN tiers t ON t.id = tp.current_tier_id
JOIN player_game_stats pgs ON pgs.player_id = p.id
WHERE p.deleted_at IS NULL
  AND p.is_internal_account = false
  AND p.status = 'active'
  AND p.email_consent = true
  AND t.level >= 4
  AND pgs.game_id IN ('roulette-evolution', 'blackjack-evolution')
  AND pgs.last_7d_wagered_sc >= 250
  AND NOT EXISTS (
    SELECT 1 FROM crm_message_log cml
    WHERE cml.player_id = p.id
      AND cml.campaign_id = '{recent_campaign_id}'
      AND cml.created_at >= NOW() - INTERVAL '3 days'
  )
GROUP BY p.id;
```

The compiler lives in `packages/core/src/crm/compiler.ts`. It is the
heart of the segment system.

### 3.3 Condition types — the complete set

**Demographic** (against `players` + `tier_progress`):
- `state`, `country`, `tier_level`, `tier_name`, `age` (computed from DOB), `kyc_level`, `signup_date`, `signup_source`, `signup_country`

**Behavior** (against `player_lifetime_stats` / `player_30d_stats` / `player_game_stats`):
- `total_deposited_usd`, `total_redeemed_usd`, `net_position_usd`, `total_wagered_sc`, `total_wagered_gc`, `total_won_sc`, `ggr_sc`, `purchase_count`, `redemption_count`, `session_count`, `round_count`, `days_active`, `last_purchase_at`, `last_session_at`, `last_login_at`, `first_purchase_at`, `game_played`, `last_30d_wagered`, `last_7d_wagered`

All numeric fields support `>=`, `<=`, `=`, `between`. Date fields support `before`, `after`, `between`, `within last N days/hours/weeks`.

**Bonus** (against `bonuses_awarded`):
- `has_active_bonus`, `bonus_type`, `playthrough_complete`, `bonus_count_lifetime`, `bonus_count_30d`

**Compliance** (against `compliance_flags`):
- `has_active_flag`, `self_excluded`, `rg_limited`

**Engagement** (against `players` + `crm_message_log`):
- `email_consent`, `sms_consent`, `last_email_opened`, `last_email_clicked`, `total_emails_received_30d`, `received_campaign`, `clicked_campaign`

**Affiliate** (against `affiliate_attribution`):
- `attributed_affiliate`, `attributed_promo_code`, `has_affiliate`

**Exclusion** (NOT wrappers):
- Wraps any other condition; useful for "not in segment X" or "did not receive campaign Y"

### 3.4 Operators on the tree

- `AND` — all conditions must match
- `OR` — any condition must match
- `NOT` — the wrapped condition must not match

Trees are nested. A condition can itself be `AND`/`OR`/`NOT` with sub-conditions.

### 3.5 Performance budgets

| Operation | Target |
| --- | --- |
| Segment count ("how many match?") | < 1s at 5M players |
| Segment fetch (full player_id list) | < 5s for 100k matches; streaming pagination for larger |
| Segment refresh (cached count update) | Background job, every 6 hours |

The < 1s count is achieved by:
1. Indexes on every rollup column used in segments
2. Materialized rollup tables (no joins on `player_events`)
3. `EXPLAIN ANALYZE` review of every new condition type added

### 3.6 The segment compilation logged

When a segment is saved, the compiler runs and stores the generated
SQL alongside the filter tree:

```sql
ALTER TABLE crm_segments ADD COLUMN compiled_sql text;
ALTER TABLE crm_segments ADD COLUMN compiled_at timestamptz;
ALTER TABLE crm_segments ADD COLUMN compilation_version int;
```

The compiler version increments when we add new condition types or
optimize SQL generation. Old segments use their stored SQL until
re-saved, ensuring stable semantics even as the compiler evolves.

---

## 4. Campaigns

A campaign sends one message (email or SMS or in-app notification) to
every player in a segment.

### 4.1 Lifecycle

```
draft → scheduled → sending → sent
                            → cancelled
                            → paused (resumable)
```

### 4.2 The send pipeline

```
Campaign scheduled
     ↓
Worker picks up at scheduled_for time
     ↓
1. Resolve segment to current player list (snapshot taken)
2. For each player:
     a. Check eligibility (consent, RG, no recent campaign, etc.)
     b. Render template with player variables
     c. Queue send via Inngest
     d. Write crm_message_log row (status=queued)
3. Inngest delivers sends to SendGrid/Twilio
4. Provider webhook updates crm_message_log status (delivered/opened/clicked/bounced)
```

### 4.3 Eligibility checks before send

Per-player guardrails BEFORE adding to the send queue:

```typescript
async function canReceive(playerId, channel, campaign): Promise<boolean> {
  const player = await db.players.findById(playerId);
  
  // Channel consent
  if (channel === 'email' && !player.email_consent) return false;
  if (channel === 'sms' && !player.sms_consent) return false;
  
  // Status
  if (player.status !== 'active') return false;
  if (player.is_internal_account) return false;
  
  // Self-exclusion override (no marketing during exclusion)
  const selfExcluded = await db.compliance_flags.findActive(playerId, 'self_exclusion');
  if (selfExcluded) return false;
  
  // Frequency cap
  const recentSends = await db.crm_message_log.count({
    player_id: playerId,
    channel,
    created_at: { gte: now - 24h },
  });
  if (recentSends >= player.crm_daily_max ?? 3) return false;
  
  // Provider bounce/complaint history
  const bounces = await db.crm_message_log.count({
    player_id: playerId,
    channel,
    status: 'bounced',
    created_at: { gte: now - 90d },
  });
  if (bounces >= 3) return false;  // hard bounce gate
  
  return true;
}
```

Players failing eligibility are NOT in the send count. Campaign stats
distinguish `eligible_count` from `recipients_count` (recipients in
segment) from `sent_count` (actually sent) from `delivered_count`.

### 4.4 Throttling

Sends throttle per provider rate limit + per player frequency cap:
- SendGrid: 600/sec default
- Twilio: 100/sec per country
- Inngest fan-out handles this naturally via concurrency control

A 100k-recipient campaign sends in ~3 minutes through SendGrid.

### 4.5 A/B testing

Campaign config supports:
- Variant A template + Variant B template
- 50/50 random split (configurable percentage)
- Winner-by-metric (open rate / click rate / conversion event)
- Auto-stop loser after N hours (configurable)

Stored on `crm_campaigns`:

```sql
ALTER TABLE crm_campaigns ADD COLUMN ab_variant_a_template_id uuid;
ALTER TABLE crm_campaigns ADD COLUMN ab_variant_b_template_id uuid;
ALTER TABLE crm_campaigns ADD COLUMN ab_split_pct int;          -- 50 = 50/50
ALTER TABLE crm_campaigns ADD COLUMN ab_winner_metric text;     -- 'open_rate' | 'click_rate' | 'conversion'
ALTER TABLE crm_campaigns ADD COLUMN ab_winning_variant text;   -- 'a' | 'b' | null
ALTER TABLE crm_campaigns ADD COLUMN ab_decided_at timestamptz;
```

### 4.6 Conversion tracking

Optional per-campaign. The campaign defines a conversion event (e.g.
`player.purchase.succeeded` within 7 days of receiving the campaign).
The worker correlates events against `crm_message_log` to attribute.

Stats page shows: sent, delivered, opened, clicked, converted, revenue
attributed. Click-through and conversion both available.

---

## 5. Flows — the state-machine engine

A flow is an automated multi-step journey triggered by an event.

### 5.1 Anatomy

```
crm_flows
  - trigger_event: 'player.signup'
  - status: 'active'
  - max_enrollments_per_player: 1

crm_flow_steps (ordered)
  step 1: action_type='send_email', config={template_id, delay: 0}
  step 2: action_type='wait', wait_duration_seconds=86400  -- 1 day
  step 3: action_type='condition', config={if: 'made_purchase', then_step: 5, else_step: 4}
  step 4: action_type='send_email', config={template_id: 'first_purchase_nudge'}
  step 5: action_type='end'

crm_flow_enrollments
  - one row per (flow, player) at enrollment
  - tracks current_step, next_action_at, state
```

### 5.2 Enrollment

When the trigger event fires, the worker:
1. Checks `max_enrollments_per_player` for this flow
2. If allowed, creates a `crm_flow_enrollments` row
3. Schedules the first action via Inngest

### 5.3 Execution

The worker runs every minute, picks up `crm_flow_enrollments` where
`next_action_at <= now()` AND `status = 'active'`, processes the next
step:

```typescript
async function processFlowStep(enrollment, flow, step) {
  switch (step.action_type) {
    case 'send_email':
      await sendEmail(enrollment.player_id, step.config.template_id);
      await advanceToNextStep(enrollment);
      break;
    
    case 'send_sms':
      await sendSms(enrollment.player_id, step.config.template_id);
      await advanceToNextStep(enrollment);
      break;
    
    case 'wait':
      enrollment.next_action_at = addSeconds(now(), step.wait_duration_seconds);
      enrollment.current_step += 1;
      await save(enrollment);
      break;
    
    case 'condition':
      const result = await evaluateCondition(enrollment, step.config.if);
      enrollment.current_step = result ? step.config.then_step : step.config.else_step;
      enrollment.next_action_at = now();
      await save(enrollment);
      break;
    
    case 'award_bonus':
      await awardBonus(enrollment.player_id, step.config.bonus_id);
      await advanceToNextStep(enrollment);
      break;
    
    case 'add_to_segment':
      await addToSegment(enrollment.player_id, step.config.segment_id);
      await advanceToNextStep(enrollment);
      break;
    
    case 'end':
      enrollment.status = 'completed';
      enrollment.completed_at = now();
      await save(enrollment);
      break;
  }
}
```

### 5.4 The 6 canonical flows

These exist from day one:

**Welcome Series.** Trigger: `player.signup`. 5 emails over 14 days. Educates on platform, drives first deposit, awards welcome bonus, drives second deposit, drives KYC.

**Cart Abandonment.** Trigger: `player.purchase.cancelled`. 1 email within 1 hour, 1 SMS within 24h (if consented), discount code within 48h.

**Lapsed Reactivation.** Trigger: cron-evaluated daily (not event-triggered) — checks `player_30d_stats.last_login_at > 14 days ago` AND `total_deposited_usd > 0`. Sends email + SMS + optional bonus.

**KYC Nudge.** Trigger: `player.signup` + delay 3 days, if KYC not started: email. + 7 days: SMS.

**Big Win Celebration.** Trigger: `player.game.big_win`. Email + optional SMS within 5 minutes. Encourages screenshot share + future play.

**Tier-Up Celebration.** Trigger: `player.tier.up`. Email + push within 10 minutes. Highlights new perks.

### 5.5 Flow analytics

For each flow:
- Enrollments today / 7d / 30d / all-time
- Completion rate
- Drop-off at each step (visualized as funnel)
- Conversion event attribution if configured

Admin can pause a flow without losing enrollment state. Resume picks
back up at each player's current step.

---

## 6. Templates

### 6.1 Email templates

WYSIWYG editor in admin (Tiptap or similar). Variables:
- `{{player.email}}`, `{{player.username}}`, `{{player.display_name}}`
- `{{player.tier_name}}`, `{{player.tier_progress_pct}}`
- `{{player.balance_sc}}`, `{{player.balance_gc}}`
- `{{player.last_login_relative}}` (e.g. "3 days ago")
- `{{player.signup_date_friendly}}` (e.g. "January 15, 2026")
- Campaign variables: `{{campaign.cta_url}}`, `{{campaign.promo_code}}`

Templates stored as `email_templates` (Doc 03 v2 §9). Versioned —
edits create a new version; old versions kept for sent-history
attribution.

### 6.2 SMS templates

Plaintext + variable substitution. 160 character indicator.

Required regulatory text appended automatically:
- "Reply STOP to unsubscribe" (TCPA)
- Branded sender ID

Stored as `sms_templates`.

### 6.3 In-app notifications

Title + body + optional CTA URL. Rendered in player's notification
center (Doc 03 v2 §9 `notifications` table).

---

## 7. The compliance moat

In-house CRM means we own the compliance posture. Three things to
get right:

### 7.1 Unsubscribe + STOP handling

- Every email has an unsubscribe link → 1-click unsubscribe → `players.email_consent = false`
- Every SMS supports STOP → Twilio inbound webhook → `players.sms_consent = false`
- Both update within 60 seconds of the player action
- The CRM eligibility check (§4.3) honors immediately

### 7.2 Suppression list

A blocklist that overrides any segment:

```sql
create table crm_suppression (
  email_or_phone text primary key,
  reason         text not null,
  source         text not null,    -- 'bounce' | 'complaint' | 'manual' | 'unsubscribe' | 'tcpa_stop'
  added_at       timestamptz not null default now()
);
```

Suppression entries are forever (or until explicitly removed by master
admin). A player who unsubscribes once doesn't get re-included if
their consent flag accidentally flips later.

### 7.3 The audit trail

Every campaign send writes:
- `crm_message_log` row (queued/sent/delivered/etc)
- `audit_log` row (campaign X sent to player Y at time Z)

For player data requests (GDPR/CCPA), the export includes:
- Every email/SMS received in 2 years
- Every campaign/flow they were enrolled in
- Every consent change

---

## 8. The "fun" sections (your operator superpowers)

The interactive segment builder you described — "I click games, click
roulette, click last 7 days, see all matching players, filter to
$250+ wagered, click email, send template" — works like this in
practice:

**Step 1.** Admin → CRM → Segments → New
- Drag in: Condition → Behavior → Game Played → "roulette" (game picker)
- Drag in: Condition → Behavior → Last X days → 7
- Drag in: Condition → Behavior → Last 7d wagered → ≥ 250 SC
- See live count: "1,247 players match"

**Step 2.** Save segment as "Roulette mid-rollers 7d"

**Step 3.** From the segment view: "Create Campaign from this segment"

**Step 4.** Pick template, schedule, preview, send.

Time from idea to sent: 60-90 seconds for an experienced operator.
Compared to "file a ticket with Optimove, wait 3 days, review their
work, approve, schedule" — that's the moat.

---

## 9. Performance + scale at 5M players

| Operation | Target | At 5M scale |
| --- | --- | --- |
| Event emit (write to `player_events` + Inngest) | < 5ms p99 | Same; partition pruning helps |
| Segment count | < 1s | Achievable with rollup tables + indexes |
| Segment fetch (100k matches) | < 5s | Streaming pagination |
| Campaign send pipeline (100k recipients) | < 10 min | Inngest concurrency + SendGrid throughput |
| Flow step processing (single player) | < 100ms | Inngest queue |
| Flow worker (full pass through enrollments) | < 1 min | Even at 1M active enrollments |
| Rollup refresh (active players, hourly) | < 5 min | ~100k active players × short query |
| Rollup refresh (all players, nightly) | < 30 min | 5M players × indexed query |

---

## 10. Schema patches required

Add to Doc 03 v2:

```sql
-- §3.6: store compiled SQL on segments
alter table crm_segments add column compiled_sql text;
alter table crm_segments add column compiled_at timestamptz;
alter table crm_segments add column compilation_version int default 1;

-- §4.5: A/B testing on campaigns
alter table crm_campaigns add column ab_variant_a_template_id uuid;
alter table crm_campaigns add column ab_variant_b_template_id uuid;
alter table crm_campaigns add column ab_split_pct int;
alter table crm_campaigns add column ab_winner_metric text;
alter table crm_campaigns add column ab_winning_variant text;
alter table crm_campaigns add column ab_decided_at timestamptz;

-- §7.2: suppression list
create table crm_suppression (
  email_or_phone text primary key,
  reason         text not null,
  source         text not null,
  added_at       timestamptz not null default now()
);

-- Player-level CRM caps
alter table players add column crm_daily_max int default 3;
```

---

## 11. What's next

This doc is the spec for the in-house CRM. Cursor builds it against:
- The event taxonomy in §1 (typed event union in `packages/core/src/events`)
- The segment compiler in §3 (`packages/core/src/crm/compiler.ts`)
- The campaign engine in §4 (`packages/core/src/crm/campaigns.ts`)
- The flow runner in §5 (`apps/worker/src/jobs/crm-flow-runner.ts`)
- The template stores in §6 (`packages/core/src/crm/templates.ts`)
- The admin UI in Doc 08 §10

The CRM ships in week 7-9 of the build. By cutover (week 12) it's
fully operational and the Optimove contract is terminated within 30
days post-cutover.
