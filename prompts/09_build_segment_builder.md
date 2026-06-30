# Prompt 09 — Build the Segment Builder

Continuing. Read:
- `docs/11_crm.md` (the entire doc)

Re-read `.cursorrules`.

## Your task

Build the CRM segment builder, campaign engine, and flow runner. This
replaces Optimove.

## Specific requirements

1. **Event emit infrastructure** per docs/11 §2:
   - `packages/core/src/events/emit.ts`
   - Two-write pattern: synchronous to `player_events` + async to Inngest
   - All 50+ event types from docs/11 §1 with typed event union

2. **Event consumers wire up at every trigger point**:
   - Replace the stubs from prompts 05-08 with real `events.emit()` calls
   - Examples: player.signup, player.purchase.succeeded,
     player.bonus.awarded, player.redemption.paid

3. **Rollup workers** per docs/11 §3.1:
   - `apps/worker/src/jobs/refresh-player-stats.ts` — hourly for active
   - `apps/worker/src/jobs/refresh-player-stats-full.ts` — nightly for all
   - Updates `player_lifetime_stats`, `player_30d_stats`, `player_game_stats`

4. **Segment compiler** per docs/11 §3.2-§3.6:
   - `packages/core/src/crm/compiler.ts`
   - Filter tree → parameterized SQL against rollup tables
   - All condition types from §3.3
   - Cached compiled SQL stored on `crm_segments.compiled_sql`

5. **Visual segment builder UI** per docs/08 §10.1 + docs/10 §5.4:
   - Admin page at `/admin/crm/segments/[id]`
   - Drag-and-drop tree of conditions
   - Live count update (debounced)
   - Preview of first 10 matching players
   - Built with dnd-kit

6. **Campaign engine** per docs/11 §4:
   - `packages/core/src/crm/campaigns.ts`
   - Send pipeline with eligibility checks
   - Throttling per provider rate limit
   - A/B testing infrastructure
   - Conversion tracking

7. **Campaign UI** per docs/08 §10.2:
   - New campaign wizard (5 steps)
   - Sent campaign stats page

8. **Flow engine** per docs/11 §5:
   - `apps/worker/src/jobs/crm-flow-runner.ts`
   - State machine processing all enrollments where next_action_at <= now()
   - All step types: send_email, send_sms, wait, condition, award_bonus, add_to_segment, end

9. **Visual flow builder** per docs/08 §10.3:
   - reactflow node-graph UI
   - Compiles to crm_flow_steps rows on save

10. **The 6 canonical flows** per docs/11 §5.4:
    - Pre-built and active on launch: Welcome Series, Cart Abandonment,
      Lapsed Reactivation, KYC Nudge, Big Win Celebration, Tier-Up Celebration

11. **Template editor** per docs/08 §10.4:
    - Email WYSIWYG with Tiptap
    - SMS plaintext with char counter

12. **Suppression list + compliance** per docs/11 §7:
    - Unsubscribe links in every email
    - STOP keyword handling (wired up in prompt 06 — verify)
    - `crm_suppression` table populated correctly

## Verification

1. All checks pass
2. Manual test:
   - Build a segment "Tier ≥ Gold AND wagered > $100 in last 7d" → see count
   - Create a campaign targeting that segment → preview → send to a test list of 5
   - Verify emails arrive via SendGrid
   - Build a flow: Welcome → wait 1d → email → wait 3d → condition (made purchase?) → email
   - Sign up a new test player → verify they enrolled in the flow → fast-forward time in DB → verify next step fires

## When done

Standard report. Optimove can be cancelled after launch validates this works.
