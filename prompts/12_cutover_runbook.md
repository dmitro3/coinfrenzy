# Prompt 12 — The Cutover Runbook

Continuing. Read:
- `docs/13_migration_from_gamma.md` §7-§8 (cutover runbook)
- `runbooks/cutover_night.md`

## Your task

This is the actual cutover. Do not run this until:
1. Prompts 1-11 are complete
2. 5+ successful dry-run imports on staging
3. 30-day notice given to Gamma
4. Dual-webhook capture running for 30+ days
5. All hard validation gates passing
6. The cutover-night team is assembled

## Specific requirements

This prompt does not write code. It executes a runbook.

1. **T-7 days**: confirm all readiness items per docs/13 §7.1
2. **T-24 hours**: pull final snapshot, status page set
3. **T-0** (cutover begins): follow the timeline in docs/13 §7.3

   ```
   T+0:00   Set Gamma to maintenance mode
   T+0:05   Pull final Gamma snapshot
   T+0:15   Begin import on production Neon
   T+0:45   Import complete; reconciliation begins
   T+1:00   Run all hard validations
   T+1:15   Spot-check 20 random players
   T+1:30   Replay captured webhooks
   T+1:45   Run reconciliation again
   T+2:00   DNS flip to new platform
   T+2:05   Smoke test
   T+2:15   Open to 10% traffic
   T+2:30   Open to 50%
   T+2:45   Open to 100%
   T+3:00   Monitor for 1 hour
   T+4:00   Maintenance window ends
   ```

4. **Smoke test checklist** per docs/13 §7.4

5. **Rollback plan** per docs/13 §7.5 if anything fails

## When done

You're live on the new platform. Standard report. Move into post-cutover
ops per docs/13 §8.

The build is complete. The work going forward is operating the platform
you've built.
