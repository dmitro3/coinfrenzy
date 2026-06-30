# Prompt 10 — Build the Dashboard with Live Data

Continuing. Read:
- `docs/12_reporting_dashboards_exports.md` (the entire doc)
- `docs/08_admin_panel.md` §2 (dashboard specifics)

## Your task

Wire up all dashboards and reports with real data.

## Specific requirements

1. **Layer 3 aggregation tables** per docs/12 §3:
   - `daily_operational_snapshots` (verify from prompt 02; populate)
   - `daily_per_state_snapshot`
   - `daily_per_game_snapshot`
   - `daily_per_affiliate_snapshot`
   - `daily_redemption_rate_snapshot`
   - Add migrations for any not already in schema

2. **Aggregation worker jobs** per docs/12 §4:
   - Hourly partial refresh
   - Nightly full refresh
   - Layer 3 daily aggregation for yesterday

3. **Live dashboard counter publisher** per docs/12 §9:
   - `apps/worker/src/jobs/publish-dashboard-counters.ts` (replace prompt 04 stub)
   - Every 5 seconds, query indexed counters, publish to Pusher

4. **Real dashboard tile data**:
   - Replace prompt 04 stubs with real queries
   - Today's tiles from live ledger
   - Yesterday's from daily_operational_snapshots
   - Trend sparklines from 30-day snapshot window

5. **Reports section** per docs/08 §5 + docs/12 §6:
   - Daily KPIs report
   - Purchase Report
   - Bonus Report
   - Users Daily Report
   - Redeem Rate Report
   - Playthrough Report
   - Affiliate Report
   - Custom Query builder (Master only) per docs/12 §6.8

6. **Export Center** per docs/08 §12 + docs/12 §7:
   - Pre-built exports
   - Custom exports
   - Background generation worker
   - R2 upload + email delivery

7. **Scheduled reports** per docs/12 §10:
   - Subscription UI in admin
   - Worker job to send subscribed reports

8. **Integration health real-time** per docs/05 §8:
   - SSE endpoint for the Integrity page
   - Replace prompt 04 stub

## Verification

1. All checks pass
2. Manual test:
   - Dashboard loads in under 1 second
   - Today's GGR tile updates live as bets happen
   - Yesterday's data shows real numbers from snapshot
   - Run an export → email arrives with download link
   - Custom query builder works for master admin

## When done

Standard report. The admin is now fully operational for daily use.
