// docs/11 §5 — single source of truth for triggerable/conversion events
// surfaced to the CRM admin UI.
//
// The closed event taxonomy lives in `core/events/types.ts`. This registry
// is the curated subset that operators see in pickers:
//   - trigger events    → fire flow enrollment when this event occurs
//   - conversion events → mark a campaign or flow as "converted" when
//                         this event occurs within the attribution window
//
// We hand-pick which raw events are useful as triggers vs noise (e.g. we
// don't expose `player.bonus.playthrough_progress` as a trigger because
// it fires on every bet and would enroll players into a flow constantly).
//
// When a new event is added to `core/events/types.ts`, decide whether it
// belongs here too. Default = no; explicit add = yes.

import type { PlayerEventName } from '../events/types'

export type EventCategoryKey =
  | 'lifecycle'
  | 'commerce'
  | 'gameplay'
  | 'bonus'
  | 'tier'
  | 'engagement'
  | 'kyc'
  | 'compliance'
  | 'admin'

export interface CrmEventDef {
  /** The event name as it appears in `player_events.event_name`. */
  name: PlayerEventName | string
  /** Human-readable label shown in pickers. */
  label: string
  /** One-line description for the picker tooltip. */
  description: string
  /** Bucket — used to group the picker UI. */
  category: EventCategoryKey
  /** Best-fit role for the event:
   *  - 'trigger'    : useful as a flow trigger (enrolment) only
   *  - 'conversion' : useful as a campaign/flow conversion only
   *  - 'both'       : useful in both pickers
   */
  role: 'trigger' | 'conversion' | 'both'
  /** Suggested for first-time operators — surfaced at the top of the picker. */
  recommended?: boolean
}

export const CRM_EVENT_REGISTRY: CrmEventDef[] = [
  // -------------------------------------------------------------------------
  // Lifecycle / Auth
  // -------------------------------------------------------------------------
  {
    name: 'player.signup',
    label: 'Player signed up',
    description: 'Fires once when a player completes registration.',
    category: 'lifecycle',
    role: 'trigger',
    recommended: true,
  },
  {
    name: 'player.email_verified',
    label: 'Email verified',
    description: 'Player confirmed their email address.',
    category: 'lifecycle',
    role: 'trigger',
  },
  {
    name: 'player.phone_verified',
    label: 'Phone verified',
    description: 'Player confirmed their phone number.',
    category: 'lifecycle',
    role: 'trigger',
  },
  {
    name: 'player.login',
    label: 'Player logged in',
    description: 'Fires on every successful login — usually use with a trigger filter.',
    category: 'lifecycle',
    role: 'trigger',
  },

  // -------------------------------------------------------------------------
  // KYC
  // -------------------------------------------------------------------------
  {
    name: 'player.kyc.started',
    label: 'KYC started',
    description: 'Player began identity verification.',
    category: 'kyc',
    role: 'trigger',
  },
  {
    name: 'player.kyc.verified',
    label: 'KYC verified',
    description: 'Player passed identity verification — eligible for redemptions.',
    category: 'kyc',
    role: 'both',
    recommended: true,
  },
  {
    name: 'player.kyc.failed',
    label: 'KYC failed',
    description: 'Player failed identity verification — may need support outreach.',
    category: 'kyc',
    role: 'trigger',
  },

  // -------------------------------------------------------------------------
  // Commerce — Purchases
  // -------------------------------------------------------------------------
  {
    name: 'player.purchase.initiated',
    label: 'Purchase started',
    description: 'Player started checkout — fires before payment confirmation.',
    category: 'commerce',
    role: 'trigger',
  },
  {
    name: 'player.purchase.succeeded',
    label: 'Purchase completed',
    description: 'Player completed a purchase — payload includes isFirstPurchase.',
    category: 'commerce',
    role: 'both',
    recommended: true,
  },
  {
    name: 'player.purchase.failed',
    label: 'Purchase failed',
    description: 'Payment was declined or timed out.',
    category: 'commerce',
    role: 'trigger',
    recommended: true,
  },
  {
    name: 'player.purchase.cancelled',
    label: 'Purchase cancelled',
    description: 'Player abandoned checkout or operator cancelled.',
    category: 'commerce',
    role: 'trigger',
  },
  {
    name: 'player.purchase.refunded',
    label: 'Purchase refunded',
    description: 'Purchase was refunded after the fact.',
    category: 'commerce',
    role: 'trigger',
  },
  {
    name: 'player.purchase.disputed',
    label: 'Purchase disputed',
    description: 'Chargeback / dispute filed against this purchase.',
    category: 'commerce',
    role: 'trigger',
  },

  // -------------------------------------------------------------------------
  // Commerce — Redemptions
  // -------------------------------------------------------------------------
  {
    name: 'player.redemption.requested',
    label: 'Redemption requested',
    description: 'Player asked to cash out SC for USD.',
    category: 'commerce',
    role: 'trigger',
  },
  {
    name: 'player.redemption.paid',
    label: 'Redemption paid',
    description: 'Player received their cash-out — milestone celebration moment.',
    category: 'commerce',
    role: 'both',
  },
  {
    name: 'player.redemption.rejected',
    label: 'Redemption rejected',
    description: 'Redemption was declined — recovery / win-back opportunity.',
    category: 'commerce',
    role: 'trigger',
  },

  // -------------------------------------------------------------------------
  // Gameplay
  // -------------------------------------------------------------------------
  {
    name: 'player.game.first_play',
    label: 'First game played',
    description: 'Fires the first time a player launches any game.',
    category: 'gameplay',
    role: 'trigger',
    recommended: true,
  },
  {
    name: 'player.game.big_win',
    label: 'Big win',
    description: 'Game payout exceeded the big-win threshold — celebrate it.',
    category: 'gameplay',
    role: 'trigger',
    recommended: true,
  },
  {
    name: 'player.game.session.start',
    label: 'Session started',
    description: 'Player opened a game (fires frequently — use a trigger filter).',
    category: 'gameplay',
    role: 'trigger',
  },

  // -------------------------------------------------------------------------
  // Bonus
  // -------------------------------------------------------------------------
  {
    name: 'player.bonus.awarded',
    label: 'Bonus awarded',
    description: 'Any bonus credited to the player — manual, automatic, or code.',
    category: 'bonus',
    role: 'trigger',
  },
  {
    name: 'player.bonus.playthrough_started',
    label: 'Playthrough started',
    description: 'Player began wagering against an awarded bonus.',
    category: 'bonus',
    role: 'trigger',
  },
  {
    name: 'player.bonus.playthrough_completed',
    label: 'Playthrough completed',
    description: 'Player cleared the playthrough — bonus is now redeemable.',
    category: 'bonus',
    role: 'both',
  },
  {
    name: 'player.bonus.expired',
    label: 'Bonus expired',
    description: "Player didn't clear playthrough in time — win-back opportunity.",
    category: 'bonus',
    role: 'trigger',
    recommended: true,
  },

  // -------------------------------------------------------------------------
  // Tier / VIP
  // -------------------------------------------------------------------------
  {
    name: 'player.tier.up',
    label: 'Tier promoted',
    description: 'Player moved up to a higher VIP tier.',
    category: 'tier',
    role: 'both',
    recommended: true,
  },
  {
    name: 'player.tier.down',
    label: 'Tier demoted',
    description: 'Player dropped down a VIP tier from inactivity.',
    category: 'tier',
    role: 'trigger',
  },
  {
    name: 'player.tier.weekly_bonus',
    label: 'Weekly tier bonus paid',
    description: 'Player received their weekly VIP allowance.',
    category: 'tier',
    role: 'trigger',
  },

  // -------------------------------------------------------------------------
  // Engagement (email + referral)
  // -------------------------------------------------------------------------
  {
    name: 'player.email.opened',
    label: 'Email opened',
    description: 'Player opened any email from us.',
    category: 'engagement',
    role: 'conversion',
  },
  {
    name: 'player.email.clicked',
    label: 'Email link clicked',
    description: 'Player clicked through from a tracked email.',
    category: 'engagement',
    role: 'conversion',
    recommended: true,
  },
  {
    name: 'player.email.unsubscribed',
    label: 'Email unsubscribed',
    description: 'Player opted out — terminal event.',
    category: 'engagement',
    role: 'trigger',
  },
  {
    name: 'player.referral.sent',
    label: 'Referral invite sent',
    description: 'Player invited a friend via email, SMS, or link.',
    category: 'engagement',
    role: 'trigger',
  },
  {
    name: 'player.referral.converted',
    label: 'Referral converted',
    description: 'An invited friend signed up and qualified.',
    category: 'engagement',
    role: 'both',
  },

  // -------------------------------------------------------------------------
  // Compliance / RG
  // -------------------------------------------------------------------------
  {
    name: 'player.rg.self_excluded',
    label: 'Self-excluded',
    description: 'Player opted into self-exclusion — suppress all marketing.',
    category: 'compliance',
    role: 'trigger',
  },
  {
    name: 'player.rg.limit_reached',
    label: 'Responsible gaming limit hit',
    description: 'Player reached a deposit or session limit they set.',
    category: 'compliance',
    role: 'trigger',
  },
  {
    name: 'player.suspended',
    label: 'Account suspended',
    description: 'Operator suspended this account.',
    category: 'compliance',
    role: 'trigger',
  },

  // -------------------------------------------------------------------------
  // Admin-fired
  // -------------------------------------------------------------------------
  {
    name: 'admin.player.coin_adjustment',
    label: 'Admin adjusted balance',
    description: 'A master/manager added or removed coins from a player.',
    category: 'admin',
    role: 'trigger',
  },
  {
    name: 'admin.player.tag_added',
    label: 'Admin tagged player',
    description: 'A team member added a tag (e.g. "vip-prospect").',
    category: 'admin',
    role: 'trigger',
  },
]

export const CRM_EVENT_CATEGORY_LABELS: Record<EventCategoryKey, string> = {
  lifecycle: 'Lifecycle',
  commerce: 'Commerce',
  gameplay: 'Gameplay',
  bonus: 'Bonus',
  tier: 'Tier / VIP',
  engagement: 'Engagement',
  kyc: 'KYC',
  compliance: 'Compliance',
  admin: 'Admin',
}

/** Events surfaced in the *flow trigger* picker (role 'trigger' or 'both'). */
export function getTriggerEvents(): CrmEventDef[] {
  return CRM_EVENT_REGISTRY.filter((e) => e.role === 'trigger' || e.role === 'both')
}

/** Events surfaced in the *conversion* picker (role 'conversion' or 'both'). */
export function getConversionEvents(): CrmEventDef[] {
  return CRM_EVENT_REGISTRY.filter((e) => e.role === 'conversion' || e.role === 'both')
}

export function findCrmEvent(name: string): CrmEventDef | undefined {
  return CRM_EVENT_REGISTRY.find((e) => e.name === name)
}
