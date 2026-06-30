import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core'

import { createdAt, emptyJsonArrayDefault, money, tstz, updatedAt } from './_shared'

// docs/07 §5.1 — operator-tunable redemption auto-approval rules.
//
// One rule = one named decision strip. The cashier engine runs every
// active rule in priority order (lowest priority number wins). The first
// matching rule's `action` wins; if no rule matches, the system falls
// through to `pending_review` so a human signs off.
//
// The schema is deliberately simple: a small set of typed knobs (amount
// cap, KYC level set, blocked states) instead of a free-form expression
// engine. This covers everything the current gamma operator uses
// ("auto-approve <= $500, KYC ≥ K4") without putting an interpreter into
// the cashier hot path. If we need expression-style rules later we can
// add a `conditions_jsonb` column and a parser; today's surface stays
// statically typed and predictable.

export const redemptionRules = pgTable(
  'redemption_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    title: text('title').notNull(),
    description: text('description'),

    // Lowest priority wins. Defaults to 100 so user-created rules sort
    // before any seed rules we ship at priority 1000.
    priority: integer('priority').notNull().default(100),

    isActive: boolean('is_active').notNull().default(true),

    /**
     * What the rule does when matched. `auto_approve` short-circuits to
     * the approved-and-queued-for-Finix state; `route_to_review` forces
     * the redemption into the cashier queue (useful for "always review
     * high-roller XYZ" rules).
     */
    action: text('action').notNull().default('auto_approve'),

    // ---- conditions ---------------------------------------------------
    // `max_amount_usd` and `min_amount_usd` are nullable — null means no
    // bound. Stored in the same minor-unit scale as `redemptions.amount_usd`.

    maxAmountUsd: money('max_amount_usd'),
    minAmountUsd: money('min_amount_usd'),

    /**
     * KYC levels eligible for the rule. Empty array = no KYC constraint
     * (rare; usually you want `[2, 3]` so unverified players still hit
     * review). Stored as jsonb int array so a future "any-of" semantic
     * mirrors the current implementation.
     */
    requiredKycLevels: jsonb('required_kyc_levels').notNull().default(emptyJsonArrayDefault),

    /**
     * 2-letter US state codes that disqualify the player from this rule
     * regardless of amount. Lets the operator force review for sensitive
     * states without writing them into the global block list.
     */
    blockedStates: jsonb('blocked_states').notNull().default(emptyJsonArrayDefault),

    /**
     * If true, the rule only matches players who have at least one paid
     * redemption already. Captures gamma's "first redeem always reviewed"
     * convention as a per-rule toggle.
     */
    requirePriorPaidRedemption: boolean('require_prior_paid_redemption').notNull().default(false),

    /**
     * Maximum hours of cashier-side completion time the operator
     * advertises for this rule. Free-form display number; we just echo
     * it back on the rules list and on the player's "ETA" copy in the
     * cashier. 0 = instant.
     */
    completionHours: integer('completion_hours').notNull().default(0),

    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: tstz('archived_at'),
  },
  (t) => [
    index('redemption_rules_priority_idx')
      .on(t.priority)
      .where(sql`${t.isActive} = true and ${t.archivedAt} is null`),
    check('redemption_rules_action_check', sql`${t.action} in ('auto_approve', 'route_to_review')`),
  ],
)
