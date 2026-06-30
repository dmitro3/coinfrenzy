# CoinFrenzy Platform — Reporting, Dashboards & Exports

**Document:** 12 of 13
**Reads:** Doc 03 v2 (Data Model), Doc 08 (Admin), Doc 10 (Frontend), Doc 11 (CRM)
**Read alongside:** Doc 04 (Ledger queries), Doc 09 (Audit log queries)
**Purpose:** How operational data is aggregated, queried, displayed, exported. The pre-aggregation strategy, query patterns, dashboard refresh model, custom query engine, export pipeline.

---

## 1. The reporting principle

**Never query raw event tables for dashboards.** At 5M players × 200M
events/month, even with partitioning, a real-time dashboard hitting
`player_events` is a query taking 30+ seconds. We pre-aggregate.

The pattern: events fire → rollup tables update → dashboards read from
rollups. Sub-second response, every time.

This is the same lesson Doc 11 §3 applies to segments. Same idea.
Different surface area.

---

## 2. The three aggregation layers

```
┌────────────────────────────────────────────────┐
│ Layer 1: Raw events                             │
│   player_events       (~200M rows/month)        │
│   ledger_entries      (~100M rows/month)        │
│   game_rounds         (~30M rows/month)         │
│   purchases           (~500k rows/month)        │
│   redemptions         (~200k rows/month)        │
└────────────────────────────────────────────────┘
                       │
                       ▼ Worker jobs aggregate continuously/hourly/nightly
                       │
┌────────────────────────────────────────────────┐
│ Layer 2: Per-player rollups (one row per player)│
│   player_lifetime_stats                         │
│   player_30d_stats                              │
│   player_7d_stats                               │
│   player_game_stats   (one row per player+game) │
└────────────────────────────────────────────────┘
                       │
                       ▼ Worker job (nightly + on demand)
                       │
┌────────────────────────────────────────────────┐
│ Layer 3: Org-wide rollups (one row per day)     │
│   daily_operational_snapshots (the MERV target) │
│   daily_redemption_rate_snapshot                │
│   daily_per_state_snapshot                      │
│   daily_per_game_snapshot                       │
│   daily_per_affiliate_snapshot                  │
└────────────────────────────────────────────────┘
```

Each layer is read from by a different surface:

- **Layer 1** — used by ledger forensics, audit reviews, custom queries (rare)
- **Layer 2** — used by segments, CRM, single-player views
- **Layer 3** — used by dashboards, daily reports, exports

---

## 3. The Layer 3 tables

### 3.1 `daily_operational_snapshots` (already in Doc 03 v2 §12)

The MERV-equivalent. One row per day. 57 columns covering:
- Engagement (DAU, logins, signups, first-purchasers)
- Wagering (total staked, won, GGR, NGR)
- Commerce (deposits, depositors, withdrawals)
- Bonus awards by type (14 columns, one per bonus type)
- Per-DAU averages

### 3.2 `daily_per_state_snapshot` (new)

```sql
create table daily_per_state_snapshot (
  date            date not null,
  state           text not null,
  
  dau             int not null default 0,
  new_signups     int not null default 0,
  total_deposited_usd numeric(20,4) not null default 0,
  total_redeemed_usd  numeric(20,4) not null default 0,
  total_staked_sc     numeric(20,4) not null default 0,
  total_ggr_sc        numeric(20,4) not null default 0,
  
  primary key (date, state)
);
```

Powers the per-state breakdowns in the Redemption Rate Report, Daily
KPIs filter, and compliance audits.

### 3.3 `daily_per_game_snapshot` (new)

```sql
create table daily_per_game_snapshot (
  date          date not null,
  game_id       uuid not null references games(id),
  
  unique_players int not null default 0,
  total_rounds   int not null default 0,
  total_bet_sc   numeric(20,4) not null default 0,
  total_win_sc   numeric(20,4) not null default 0,
  ggr_sc         numeric(20,4) not null default 0,
  
  rtp_realized  numeric(5,4),
  rtp_expected  numeric(5,4),
  
  primary key (date, game_id)
);

create index daily_per_game_date_idx on daily_per_game_snapshot(date desc);
```

Powers the Game Dashboard top-N tables. Also feeds the RTP divergence
alert (if realized RTP deviates > 2% from expected for any day, alert
Game Ops).

### 3.4 `daily_per_affiliate_snapshot` (new)

```sql
create table daily_per_affiliate_snapshot (
  date            date not null,
  affiliate_id    uuid not null references affiliates(id),
  
  attributed_signups int not null default 0,
  attributed_active_players int not null default 0,
  attributed_deposits_usd numeric(20,4) not null default 0,
  attributed_ngr_sc numeric(20,4) not null default 0,
  payout_owed_sc  numeric(20,4) not null default 0,
  
  primary key (date, affiliate_id)
);
```

Powers the Affiliate Report. Also feeds the payout calculation worker.

### 3.5 `daily_redemption_rate_snapshot` (new)

```sql
create table daily_redemption_rate_snapshot (
  date              date primary key,
  revenue_usd       numeric(20,4) not null default 0,
  redemptions_usd   numeric(20,4) not null default 0,
  pending_usd       numeric(20,4) not null default 0,
  cumulative_revenue_usd numeric(20,4) not null default 0,
  cumulative_redemptions_usd numeric(20,4) not null default 0,
  daily_redemption_rate numeric(5,4),
  lifetime_redemption_rate numeric(5,4),
  
  -- Per-state breakdown stored as JSONB for fast retrieval
  per_state         jsonb
);
```

Powers the Redeem Rate Report. The Gamma version of this report has
NaN in the rate columns; ours computes them correctly.

---

## 4. The aggregation worker

### 4.1 Schedule

```typescript
// apps/worker/src/jobs/aggregations.ts

inngest.createFunction(
  { id: 'aggregate-hourly' },
  { cron: '0 * * * *' },  // every hour at :00
  async () => {
    await refreshPlayerLifetimeStats('active_only');  // ~100k active players, fast
    await refresh30dStats('active_only');
    await refreshLayer3OnlyForToday();
  }
);

inngest.createFunction(
  { id: 'aggregate-nightly' },
  { cron: '0 4 * * *' },   // 4am local time
  async () => {
    await refreshAllPlayerStats();           // full pass over 5M players
    await refreshAllGameStats();
    await aggregateLayer3ForYesterday();     // finalize yesterday's snapshot
    await refreshDerivedMetrics();
    await fireDashboardCacheInvalidation();
  }
);
```

### 4.2 The lifetime stats refresh

Idempotent. Re-runnable safely.

```typescript
async function refreshPlayerLifetimeStats(scope: 'active_only' | 'all') {
  const playerScope = scope === 'active_only'
    ? 'p.last_seen_at > NOW() - INTERVAL \'24 hours\''
    : 'TRUE';
  
  await db.execute(sql`
    INSERT INTO player_lifetime_stats (
      player_id,
      total_deposited_usd,
      total_redeemed_usd,
      net_position_usd,
      total_wagered_sc,
      total_won_sc,
      ggr_sc,
      ngr_sc,
      purchase_count,
      redemption_count,
      session_count,
      first_purchase_at,
      last_purchase_at,
      computed_at
    )
    SELECT
      p.id,
      COALESCE((SELECT SUM(amount_usd) FROM purchases WHERE player_id = p.id AND status = 'completed'), 0),
      COALESCE((SELECT SUM(amount_usd) FROM redemptions WHERE player_id = p.id AND status = 'paid'), 0),
      ...,
      NOW()
    FROM players p
    WHERE ${playerScope}
    ON CONFLICT (player_id) DO UPDATE SET
      total_deposited_usd = EXCLUDED.total_deposited_usd,
      ...,
      computed_at = NOW();
  `);
}
```

UPSERT pattern means re-running is safe. ON CONFLICT updates the row.

### 4.3 Performance budgets

| Operation | Target |
| --- | --- |
| Hourly active-player refresh (~100k players) | < 5 min |
| Nightly full refresh (5M players) | < 30 min |
| Single-player stats refresh (on-demand) | < 100ms |
| Daily Layer 3 aggregation (yesterday) | < 10 min |

The on-demand single-player refresh is for admin "force refresh" on a
specific player. When support is investigating, they don't want to
wait for the next hourly cycle.

### 4.4 Recovery from staleness

If the worker is down for hours, rollups go stale. Dashboards still
work but show stale data. When the worker recovers:

```typescript
// On worker startup
async function backfillSinceLastRun() {
  const lastSuccessful = await db.aggregation_runs.findLatest({ status: 'success' });
  if (!lastSuccessful) return;  // first run
  
  const missingHours = hoursBetween(lastSuccessful.completed_at, now());
  if (missingHours > 24) {
    // Don't try to catch up hour-by-hour; just do a full refresh
    await refreshAllPlayerStats();
  } else {
    for (const hour of missingHours) {
      await aggregateForHour(hour);
    }
  }
}
```

`aggregation_runs` table tracks every aggregation run's status, so
recovery is bounded and observable.

---

## 5. The dashboard query patterns

### 5.1 The dashboard tile

Every tile on the dashboard is one of these patterns:

**Single number from Layer 3:**
```sql
SELECT total_ngr_sc FROM daily_operational_snapshots WHERE date = CURRENT_DATE;
```

**Trend chart (sparkline) from Layer 3:**
```sql
SELECT date, total_ngr_sc 
FROM daily_operational_snapshots 
WHERE date > CURRENT_DATE - INTERVAL '30 days'
ORDER BY date;
```

**Today's running total — special case, can't be in Layer 3 yet:**
```sql
-- Today's GGR is computed in real-time from current day's ledger entries
-- (since yesterday's snapshot doesn't cover today)
SELECT 
  COALESCE(SUM(CASE WHEN account_kind = 'house_winnings_sc' AND leg = 'credit' THEN amount ELSE 0 END), 0)
  - COALESCE(SUM(CASE WHEN account_kind = 'house_winnings_sc' AND leg = 'debit' THEN amount ELSE 0 END), 0)
  AS today_ggr_sc
FROM ledger_entries
WHERE created_at >= CURRENT_DATE
  AND source IN ('bet', 'win');
```

Today's tiles run in real-time (< 1s on indexed ledger queries).
Yesterday's and historical tiles run against snapshots (< 100ms).

### 5.2 The dashboard refresh model

```
                  Page load
                      │
                      ▼
              Initial render with cached data
              (TanStack Query stale-while-revalidate)
                      │
                      ▼
              API call for fresh data
                      │
              ┌───────┴────────┐
              ▼                ▼
        Yesterday's tiles    Today's tiles
        Layer 3 (cached)     Layer 1 (live)
              │                │
              ▼                ▼
              ────────┬────────
                      ▼
                  Render
                      │
                      ▼
        Subscribe to Pusher channel
        'admin-dashboard-counters'
                      │
                      ▼
        Live updates push to specific tiles
        (today's GGR ticks up as bets settle)
```

Today's tiles receive Pusher pushes for sub-second updates. Yesterday's
and historical don't change.

### 5.3 The integration health tiles

These are special — they query the `integration_health` table
(Doc 03 v2 §11) which is updated by webhook handlers and worker jobs:

```sql
SELECT 
  provider,
  status,
  last_seen_at,
  error_count_1h,
  p99_latency_ms_1h
FROM integration_health
WHERE provider IN ('alea', 'finix', 'footprint', 'radar', 'sendgrid', 'twilio');
```

Refreshed every 30 seconds via SSE (server-sent events) — simpler than
Pusher for this small dataset.

---

## 6. The Reports section

Each report from Doc 08 §5 has its own page. Implementation pattern:

### 6.1 Daily KPIs report

Source: `daily_operational_snapshots`. Display: large table, default
last 30 days, all 57 columns, sortable, column-hideable.

Top of page: 4-6 highlight tiles showing 7d/30d trends in the metrics
that matter most.

Cursor builds this against the `DataTable` component from Doc 10 §5.3.

### 6.2 Purchase Report

Source: `player_lifetime_stats` joined to `players`. Same density as
Gamma's purchase report (21 columns) but with our improvements
(drill-down, hide columns, saved views, export).

Default sort: `total_deposited_usd DESC` so VIPs are on top.

### 6.3 Bonus Report

Source: aggregation over `bonuses_awarded` filtered by date range,
grouped by `bonus_type`. Computed dynamically (small dataset — even
5M lifetime bonuses aggregate in < 1s with the right index).

Top chart: per-day stacked bar showing bonus awards by type.
Below: table breakdown by type with totals.

### 6.4 Users Daily Report

Source: cohort analysis of `players` joined to `daily_operational_snapshots`.

```sql
SELECT 
  DATE_TRUNC('week', p.first_seen_at) as cohort_week,
  COUNT(DISTINCT p.id) as cohort_size,
  COUNT(DISTINCT CASE WHEN p.last_seen_at > NOW() - INTERVAL '7 days' THEN p.id END) as week_active,
  COUNT(DISTINCT CASE WHEN pls.total_deposited_usd > 0 THEN p.id END) as cohort_paying
FROM players p
LEFT JOIN player_lifetime_stats pls ON pls.player_id = p.id
WHERE p.first_seen_at > NOW() - INTERVAL '6 months'
  AND p.is_internal_account = false
GROUP BY cohort_week
ORDER BY cohort_week DESC;
```

Cohort retention is the killer chart here.

### 6.5 Redeem Rate Report

Source: `daily_redemption_rate_snapshot`. Cross-tabulated by state if
filter applied.

Headline metric: lifetime redemption rate. This is the single most
important "are we healthy" number.

### 6.6 Playthrough Report

Source: aggregation over `bonuses_awarded`. Metrics:
- Time to playthrough completion by bonus type
- Completion rate by bonus type
- Expiry rate by bonus type
- Average bets per playthrough by bonus type

### 6.7 Affiliate Report

Source: `daily_per_affiliate_snapshot` rolled up by affiliate.
Default sort: lifetime NGR contributed.

Each row drillable into affiliate detail page showing all attributed
players + their lifetime stats.

### 6.8 Custom Query (Master only)

The escape hatch. Lives in `/admin/reports/custom`.

**The query builder UI:**
- Pick base table (read-only allow-list: players, purchases, redemptions, bonuses_awarded, ledger_entries, player_events, game_rounds, daily_operational_snapshots)
- Add JOINs (allow-list of pre-defined join patterns)
- Add WHERE conditions
- Add GROUP BY
- Add aggregates (COUNT, SUM, AVG, MIN, MAX)
- Add ORDER BY and LIMIT

**The compiler** generates parameterized SQL:

```typescript
function compileCustomQuery(spec: QuerySpec): { sql: string; params: any[] } {
  const allowedTables = ['players', 'purchases', 'redemptions', /* ... */];
  if (!allowedTables.includes(spec.baseTable)) {
    throw new Error('table_not_allowed');
  }
  
  // Build SELECT with allowlisted columns
  const selectCols = spec.selectColumns.filter(c => isAllowedColumn(spec.baseTable, c));
  
  // Build WHERE with parameterized values
  const { whereSql, whereParams } = compileWhere(spec.conditions);
  
  // Build GROUP BY
  const groupBy = spec.groupBy.filter(c => isAllowedColumn(spec.baseTable, c));
  
  // Build ORDER BY (allowlisted)
  const orderBy = spec.orderBy.filter(c => isAllowedColumn(spec.baseTable, c));
  
  // Apply LIMIT (capped at 10,000)
  const limit = Math.min(spec.limit ?? 1000, 10_000);
  
  return {
    sql: `SELECT ${selectCols.join(', ')} 
          FROM ${spec.baseTable} 
          WHERE ${whereSql} 
          GROUP BY ${groupBy.join(', ')} 
          ORDER BY ${orderBy.join(', ')} 
          LIMIT ${limit}`,
    params: whereParams,
  };
}
```

**Safety:**
- Runs against a read-only Neon replica (not the primary)
- 30-second query timeout
- 10,000-row hard cap
- Logged to audit_log with the compiled SQL + execution time
- Result set capped at 100MB; larger → suggest CSV export

**Saved queries** can be:
- Run on demand
- Scheduled (daily/weekly/monthly cron)
- Set to email results to specified admin(s)

---

## 7. Export Center

### 7.1 The export pipeline

```
                  Admin clicks "Export"
                          │
                          ▼
                Frontend POST /api/admin/exports
                          │
                          ▼
                Worker job: generate-export.ts
                          │
                          ▼
            Stream query results to CSV/JSON
                          │
                          ▼
            Upload to R2: /exports/{export_id}.csv
                          │
                          ▼
            Update exports table with URL
                          │
                          ▼
            Email admin with download link (24h expiry)
                          │
                          ▼
                  Pusher notification
                  to admin's UI
```

### 7.2 Streaming for large exports

For exports > 10k rows, we stream:

```typescript
async function generateLargeExport(query: string, params: any[]) {
  const stream = fs.createWriteStream('/tmp/export.csv');
  
  // Postgres COPY pipe for max throughput
  const pgStream = await db.queryStream(query, params);
  pgStream.pipe(csv.stringify({ header: true })).pipe(stream);
  
  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
  
  // Upload to R2
  const r2Url = await r2.upload('/tmp/export.csv', `exports/${exportId}.csv`);
  
  return r2Url;
}
```

Streams handle datasets that wouldn't fit in memory. A 1M-row export
is ~200MB and streams in ~30 seconds.

### 7.3 Export types

Pre-built exports (one-click):
- Players (all or filtered)
- Purchases (date range)
- Redemptions (date range)
- Bonuses awarded (date range, by type)
- Daily KPIs (date range)
- Audit log (date range, filtered)
- CRM message log (date range, by campaign)
- Affiliate report

Custom exports:
- Saved custom queries (see §6.8)

### 7.4 Compliance exports

Special category. Pre-built:
- **GDPR/CCPA Player Data Export** — single player, full record + all related rows (auto-generated PDF + CSV)
- **Sweepstakes State Audit Pack** — date range + state, packages: all transactions, all KYC decisions, all RG flags
- **Tax Report (1099-MISC)** — per affiliate, lifetime payouts > $600

These exports route through a separate review queue. Generated only
by Master + reviewed by another admin before delivery (two-person
rule for sensitive exports).

### 7.5 The exports table

```sql
create table exports (
  id              uuid primary key default gen_random_uuid(),
  admin_id        uuid not null references admins(id),
  
  export_type     text not null,
  query_spec      jsonb,
  
  status          text not null default 'pending',
  -- 'pending' | 'running' | 'complete' | 'failed' | 'expired'
  
  row_count       int,
  size_bytes      bigint,
  r2_key          text,
  download_url    text,
  expires_at      timestamptz,
  
  -- Compliance exports require review
  requires_review boolean not null default false,
  reviewed_by     uuid references admins(id),
  reviewed_at     timestamptz,
  
  -- Audit
  reason          text,
  
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now()
);

create index exports_admin_idx on exports(admin_id, created_at desc);
create index exports_status_idx on exports(status, created_at) where status in ('pending', 'running');
create index exports_review_idx on exports(created_at) where requires_review = true and reviewed_at is null;
```

---

## 8. Data viz — the chart library

Recharts for all charts. Standardized chart types:

- **Line chart** — trends over time (revenue, DAU, etc.)
- **Bar chart** — categorical comparisons (bonus type breakdown)
- **Stacked bar chart** — composition over time (bonus types per day)
- **Area chart** — cumulative metrics (cumulative deposits)
- **Pie/Donut** — composition snapshots (only when categories ≤ 7; otherwise use bar)
- **Sparkline** — inline tile trends
- **Funnel chart** — flow drop-off, signup funnel, purchase funnel
- **Cohort heatmap** — retention by signup cohort
- **Histogram** — distributions (bet size, session length)

Wrapped in our own `<Chart>` component that:
- Applies the brand color palette
- Handles loading state
- Handles empty state
- Handles error state
- Exports as PNG / SVG / CSV (right-click menu)

---

## 9. Real-time dashboard counters

The dashboard tiles that update live (today's GGR, online players,
pending redemption count) update via Pusher.

The publisher: worker job `publish-dashboard-counters.ts` runs every
5 seconds, computes current values, publishes to
`admin-dashboard-counters` channel.

```typescript
inngest.createFunction(
  { id: 'publish-dashboard-counters' },
  { cron: '*/5 * * * * *' },  // every 5 seconds (cron syntax allows it)
  async () => {
    const counters = await Promise.all([
      countOnlinePlayers(),
      sumTodayGgrSc(),
      sumTodayDepositsUsd(),
      countPendingRedemptions(),
      sumPendingRedemptionsUsd(),
      countNewSignupsToday(),
    ]);
    
    await pusher.trigger('admin-dashboard-counters', 'tick', {
      onlinePlayers: counters[0],
      todayGgrSc: counters[1],
      todayDepositsUsd: counters[2],
      pendingRedemptions: counters[3],
      pendingRedemptionsUsd: counters[4],
      newSignupsToday: counters[5],
      timestamp: new Date().toISOString(),
    });
  }
);
```

Six lightweight queries, all hitting indexed columns. Total execution
time: < 200ms. Publishes every 5 seconds = no significant load.

If the worker is down, dashboards show last-known values. TanStack
Query re-fetches on window focus, so reopening the tab shows fresh
data even without real-time.

---

## 10. Scheduled reports

Admin can subscribe to scheduled reports — they arrive in email at
chosen times.

```sql
create table report_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  admin_id        uuid not null references admins(id) on delete cascade,
  
  report_kind     text not null,
  -- 'daily_summary' | 'weekly_summary' | 'monthly_summary' 
  -- | 'custom_query' | 'affiliate_payout_due'
  
  query_spec      jsonb,
  
  schedule        text not null,    -- cron string
  
  email_to        text[] not null,
  email_subject   text,
  
  enabled         boolean not null default true,
  last_sent_at    timestamptz,
  next_due_at     timestamptz,
  
  created_at      timestamptz not null default now()
);

create index report_subscriptions_due_idx on report_subscriptions(next_due_at) 
  where enabled = true;
```

Worker runs every minute, picks up subscriptions where `next_due_at <= now()`,
generates the report, emails it, updates `next_due_at`.

Common subscriptions:
- "Daily summary at 9am to leadership" (Master)
- "Weekly affiliate report Mondays" (Marketing)
- "Pending redemption queue digest hourly during business hours" (Cashier Lead)
- "Monthly KYC review summary" (Compliance)

---

## 11. Performance summary

| Operation | Target | Achieved via |
| --- | --- | --- |
| Dashboard initial load | < 800ms | Pre-aggregated tiles, parallel fetch, RSC hydration |
| Dashboard live tick | < 100ms | Pusher push (no fetch on client) |
| Single player detail | < 300ms | All 6 cards in parallel, indexed queries |
| Daily KPIs (30 days) | < 200ms | Indexed snapshot table |
| Purchase Report (10k rows) | < 1s | Indexed + paginated + virtualized table |
| Custom Query | < 30s | Hard timeout, read replica, query cap |
| Export (1M rows) | < 5 min | Streaming, background worker, R2 upload |
| Compliance pack | < 10 min | Background worker, multi-source aggregation |

---

## 12. Cross-references

- **Doc 03 v2 §12** — daily_operational_snapshots schema
- **Doc 04** — ledger queries (for live today's-revenue tile)
- **Doc 08 §5** — admin Reports section UI
- **Doc 10 §7** — Pusher real-time setup
- **Doc 11 §3.1** — Layer 2 rollups also used by CRM segments

---

## 13. What's next

All P0-P2 docs complete with this. After API docs land:
- Doc 05 (Webhooks)
- Doc 06 (Bonus Engine)
- Doc 07 (Redemption + KYC)

Each will reference back to the rollup tables and dashboard patterns
defined here when the integration data feeds them.
