// docs/11 §5.4 — flow recipe library.
//
// A recipe is a pre-built flow that an operator can pick from a gallery
// to skip the blank-slate problem. Recipes use *template slugs* (not IDs)
// so they remain stable across environments — the builder resolves the
// slug to a real template-id at save time, or leaves a placeholder for
// the operator to pick.
//
// Adding a new recipe = adding an entry below. Each recipe must:
//   - Have a triggerEvent that's in CRM_EVENT_REGISTRY
//   - Reference template slugs that ship in the migrations (docs/11 §6)
//   - Be self-contained (no external state, all waits in seconds)

import type { FlowStepActionType, FlowStepConfig } from './flows'

export interface FlowRecipeStep {
  actionType: FlowStepActionType
  config: FlowStepConfig
  /** For wait steps, seconds to wait. */
  waitDurationSeconds?: number | null
  /** Display hint for the gallery card preview. */
  display?: string
}

export interface FlowRecipe {
  /** Stable identifier — picked from the gallery URL. */
  slug: string
  /** Human label. */
  name: string
  /** What this flow does, in one sentence. */
  description: string
  /** Why an operator might want it — pitches the use case. */
  useCase: string
  /** Trigger event from CRM_EVENT_REGISTRY. */
  triggerEvent: string
  /** Default conversion event (operator can change). */
  conversionEvent: string | null
  /** Max enrollments per player (default 1 = one-time only). */
  maxEnrollmentsPerPlayer: number
  /** Cooldown between successive enrollments (hours). */
  cooldownHoursBetweenEnrollments: number | null
  /** Steps — step numbers are assigned in order. */
  steps: FlowRecipeStep[]
  /** Optional category for grouping the gallery. */
  category: 'onboarding' | 'commerce' | 'retention' | 'vip' | 'compliance'
}

export const FLOW_RECIPES: FlowRecipe[] = [
  // ---------------------------------------------------------------------------
  // Welcome series — 3 emails over the first week
  // ---------------------------------------------------------------------------
  {
    slug: 'welcome-series',
    name: 'Welcome series',
    description: 'Greet new signups with 3 emails over their first week.',
    useCase:
      "Highest-leverage flow. New signups who get a welcome series convert 2-3× higher than those who don't.",
    category: 'onboarding',
    triggerEvent: 'player.signup',
    conversionEvent: 'player.purchase.succeeded',
    maxEnrollmentsPerPlayer: 1,
    cooldownHoursBetweenEnrollments: null,
    steps: [
      {
        actionType: 'send_email',
        config: { templateSlug: 'welcome-email' },
        display: 'Welcome email (immediate)',
      },
      {
        actionType: 'wait',
        config: { waitSeconds: 60 * 60 * 24 * 2 },
        waitDurationSeconds: 60 * 60 * 24 * 2,
        display: 'Wait 2 days',
      },
      {
        actionType: 'send_email',
        config: { templateSlug: 'welcome-day-2' },
        display: 'Day-2 tips email',
      },
      {
        actionType: 'wait',
        config: { waitSeconds: 60 * 60 * 24 * 5 },
        waitDurationSeconds: 60 * 60 * 24 * 5,
        display: 'Wait 5 days',
      },
      {
        actionType: 'send_email',
        config: { templateSlug: 'welcome-day-7' },
        display: 'Day-7 first-purchase nudge',
      },
      { actionType: 'end', config: {}, display: 'End' },
    ],
  },

  // ---------------------------------------------------------------------------
  // First purchase celebration
  // ---------------------------------------------------------------------------
  {
    slug: 'first-purchase-celebration',
    name: 'First purchase celebration',
    description: 'Thank players the moment they make their very first purchase.',
    useCase:
      'First-purchase recipients who feel acknowledged are 60% more likely to make a 2nd purchase within 14 days.',
    category: 'commerce',
    triggerEvent: 'player.purchase.succeeded',
    conversionEvent: 'player.purchase.succeeded',
    maxEnrollmentsPerPlayer: 1,
    cooldownHoursBetweenEnrollments: null,
    steps: [
      {
        actionType: 'send_email',
        config: { templateSlug: 'first-purchase-thanks' },
        display: 'Thank-you email',
      },
      {
        actionType: 'wait',
        config: { waitSeconds: 60 * 60 * 24 * 7 },
        waitDurationSeconds: 60 * 60 * 24 * 7,
        display: 'Wait 7 days',
      },
      {
        actionType: 'send_email',
        config: { templateSlug: 'second-purchase-offer' },
        display: 'Second-purchase offer',
      },
      { actionType: 'end', config: {}, display: 'End' },
    ],
  },

  // ---------------------------------------------------------------------------
  // Failed-payment recovery
  // ---------------------------------------------------------------------------
  {
    slug: 'failed-payment-recovery',
    name: 'Failed payment recovery',
    description: 'Catch declined / failed purchases and offer to help.',
    useCase:
      "1 in 8 failed purchases convert within 24h if the player is contacted — leave them hanging and they're gone.",
    category: 'commerce',
    triggerEvent: 'player.purchase.failed',
    conversionEvent: 'player.purchase.succeeded',
    maxEnrollmentsPerPlayer: 5,
    cooldownHoursBetweenEnrollments: 24,
    steps: [
      {
        actionType: 'wait',
        config: { waitSeconds: 60 * 15 },
        waitDurationSeconds: 60 * 15,
        display: 'Wait 15 minutes',
      },
      {
        actionType: 'send_email',
        config: { templateSlug: 'purchase-failed-help' },
        display: 'Recovery email',
      },
      { actionType: 'end', config: {}, display: 'End' },
    ],
  },

  // ---------------------------------------------------------------------------
  // Win-back (lapsed player)
  // ---------------------------------------------------------------------------
  {
    slug: 'win-back-lapsed',
    name: 'Win-back lapsed player',
    description: "Re-engage players who haven't purchased in 14+ days.",
    useCase: 'Recover 5-10% of lapsed players who would otherwise churn permanently.',
    category: 'retention',
    triggerEvent: 'player.bonus.expired',
    conversionEvent: 'player.purchase.succeeded',
    maxEnrollmentsPerPlayer: 3,
    cooldownHoursBetweenEnrollments: 24 * 30,
    steps: [
      {
        actionType: 'send_email',
        config: { templateSlug: 'win-back-step-1' },
        display: 'We miss you',
      },
      {
        actionType: 'wait',
        config: { waitSeconds: 60 * 60 * 24 * 3 },
        waitDurationSeconds: 60 * 60 * 24 * 3,
        display: 'Wait 3 days',
      },
      {
        actionType: 'award_bonus',
        config: { bonusSlug: 'lapsed-comeback-sc' },
        display: 'Comeback SC bonus',
      },
      {
        actionType: 'send_email',
        config: { templateSlug: 'win-back-bonus-awarded' },
        display: 'Bonus awarded email',
      },
      { actionType: 'end', config: {}, display: 'End' },
    ],
  },

  // ---------------------------------------------------------------------------
  // Tier promotion celebration
  // ---------------------------------------------------------------------------
  {
    slug: 'tier-up-celebration',
    name: 'Tier promotion celebration',
    description: 'Celebrate every time a player levels up their VIP tier.',
    useCase:
      'Players who feel their VIP progress is recognised stay 40% longer and spend more per session.',
    category: 'vip',
    triggerEvent: 'player.tier.up',
    conversionEvent: null,
    maxEnrollmentsPerPlayer: 99,
    cooldownHoursBetweenEnrollments: null,
    steps: [
      {
        actionType: 'send_email',
        config: { templateSlug: 'tier-up-congrats' },
        display: 'Congratulations email',
      },
      {
        actionType: 'award_bonus',
        config: { bonusSlug: 'tier-promo-bonus' },
        display: 'Tier promo bonus',
      },
      { actionType: 'end', config: {}, display: 'End' },
    ],
  },

  // ---------------------------------------------------------------------------
  // Big win acknowledgement
  // ---------------------------------------------------------------------------
  {
    slug: 'big-win-acknowledgement',
    name: 'Big win acknowledgement',
    description: 'Recognise it when a player hits a big win on any game.',
    useCase: "Players love knowing we noticed. It's a one-line email but it builds trust.",
    category: 'retention',
    triggerEvent: 'player.game.big_win',
    conversionEvent: null,
    maxEnrollmentsPerPlayer: 12,
    cooldownHoursBetweenEnrollments: 24 * 7,
    steps: [
      {
        actionType: 'send_email',
        config: { templateSlug: 'big-win-congrats' },
        display: 'Congrats email',
      },
      { actionType: 'end', config: {}, display: 'End' },
    ],
  },

  // ---------------------------------------------------------------------------
  // KYC verified onboarding
  // ---------------------------------------------------------------------------
  {
    slug: 'kyc-verified',
    name: 'KYC complete — unlock redemption',
    description: 'Onboard players the moment they finish identity verification.',
    useCase:
      'New KYC-verified players spend 3-5× more in the next 30 days when they understand redemption.',
    category: 'onboarding',
    triggerEvent: 'player.kyc.verified',
    conversionEvent: 'player.redemption.requested',
    maxEnrollmentsPerPlayer: 1,
    cooldownHoursBetweenEnrollments: null,
    steps: [
      {
        actionType: 'send_email',
        config: { templateSlug: 'kyc-verified-welcome' },
        display: 'KYC welcome',
      },
      { actionType: 'end', config: {}, display: 'End' },
    ],
  },

  // ---------------------------------------------------------------------------
  // Self-exclusion compliance acknowledgement
  // ---------------------------------------------------------------------------
  {
    slug: 'self-exclusion-confirmation',
    name: 'Self-exclusion confirmation',
    description: 'Compliance — send the legally-required confirmation.',
    useCase:
      'Regulatory requirement in most jurisdictions. Confirms the exclusion and provides RG resources.',
    category: 'compliance',
    triggerEvent: 'player.rg.self_excluded',
    conversionEvent: null,
    maxEnrollmentsPerPlayer: 99,
    cooldownHoursBetweenEnrollments: null,
    steps: [
      {
        actionType: 'send_email',
        config: { templateSlug: 'self-exclusion-confirm' },
        display: 'Exclusion confirmation',
      },
      { actionType: 'end', config: {}, display: 'End' },
    ],
  },
]

export function findRecipe(slug: string): FlowRecipe | undefined {
  return FLOW_RECIPES.find((r) => r.slug === slug)
}

/**
 * Turn a recipe into the shape the FlowVisualBuilder expects. Step
 * numbers are assigned sequentially.
 */
export function buildFlowRecipe(recipe: FlowRecipe): {
  meta: {
    name: string
    description: string | null
    triggerEvent: string
    maxEnrollmentsPerPlayer: number | null
    cooldownHoursBetweenEnrollments: number | null
    status: 'active' | 'paused' | 'archived'
    conversionEvent: string | null
  }
  steps: Array<{
    stepNumber: number
    actionType: FlowStepActionType
    config: FlowStepConfig
    waitDurationSeconds: number | null
  }>
} {
  return {
    meta: {
      name: recipe.name,
      description: recipe.description,
      triggerEvent: recipe.triggerEvent,
      maxEnrollmentsPerPlayer: recipe.maxEnrollmentsPerPlayer,
      cooldownHoursBetweenEnrollments: recipe.cooldownHoursBetweenEnrollments,
      // Always create as paused — operator should review + activate.
      status: 'paused',
      conversionEvent: recipe.conversionEvent,
    },
    steps: recipe.steps.map((s, i) => ({
      stepNumber: i + 1,
      actionType: s.actionType,
      config: s.config,
      waitDurationSeconds: s.waitDurationSeconds ?? null,
    })),
  }
}
