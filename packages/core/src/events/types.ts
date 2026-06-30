// docs/11 §1 — the closed event taxonomy. Adding a new event requires
// updating BOTH this union AND docs/11 §1. The union is the single source
// of truth that the segment compiler, flow-trigger registry, and admin UI
// pull from for autocomplete + validation.

export type Currency = 'GC' | 'SC' | 'USD'

export interface AmountPayload {
  amount: bigint
  currency: Currency
}

// 1.1 Auth
export interface AuthEventPayloads {
  'player.signup': {
    playerId: string
    email: string
    state?: string | null
    country?: string | null
    blockedState?: boolean
    attributedPromoCode?: string | null
  }
  'player.login': { playerId: string; ip?: string | null; userAgent?: string | null }
  'player.login_failed': {
    playerId?: string | null
    email: string
    ip?: string | null
    reason: string
  }
  'player.password_reset': { playerId: string }
  'player.email_verified': { playerId: string; email: string }
  'player.phone_verified': { playerId: string; phone: string }
}

// 1.2 KYC
export interface KycEventPayloads {
  'player.kyc.started': { playerId: string; provider: string; sessionId?: string | null }
  'player.kyc.verified': {
    playerId: string
    level: number
    provider: string
    onboardingId?: string | null
  }
  'player.kyc.failed': {
    playerId: string
    reason: string
    provider: string
    onboardingId?: string | null
  }
  'player.kyc.escalated': { playerId: string; reason: string; reviewerQueue?: string | null }
}

// 1.3 Commerce
export interface CommerceEventPayloads {
  'player.purchase.initiated': {
    playerId: string
    purchaseId: string
    packageId?: string | null
    amount: bigint
    currency: Currency
  }
  'player.purchase.succeeded': {
    playerId: string
    purchaseId: string
    transferId?: string | null
    amount: bigint
    currency: Currency
    isFirstPurchase?: boolean
  }
  'player.purchase.failed': {
    playerId: string
    purchaseId: string
    transferId?: string | null
    reason: string
  }
  'player.purchase.cancelled': {
    playerId: string
    purchaseId: string
    reason?: string | null
  }
  'player.purchase.refunded': {
    playerId: string
    purchaseId: string
    refundId?: string | null
    amount: bigint
    currency: Currency
  }
  'player.purchase.disputed': {
    playerId: string
    purchaseId: string
    disputeId: string
    reason?: string | null
  }
  'player.redemption.requested': {
    playerId: string
    redemptionId: string
    amount: bigint
    currency: Currency
  }
  'player.redemption.approved': {
    playerId: string
    redemptionId: string
    approvedBy: string
  }
  'player.redemption.rejected': {
    playerId: string
    redemptionId: string
    rejectedBy: string
    reason: string
  }
  'player.redemption.paid': {
    playerId: string
    redemptionId: string
    transferId?: string | null
    amount: bigint
    currency: Currency
  }
  'player.redemption.failed': {
    playerId: string
    redemptionId: string
    reason: string
  }
}

// 1.4 Gameplay
export interface GameplayEventPayloads {
  'player.game.session.start': { playerId: string; gameId: string; sessionId: string }
  'player.game.session.end': {
    playerId: string
    gameId: string
    sessionId: string
    durationSeconds: number
  }
  'player.game.bet': {
    playerId: string
    gameId: string
    roundId: string
    amount: bigint
    currency: Currency
  }
  'player.game.win': {
    playerId: string
    gameId: string
    roundId: string
    amount: bigint
    currency: Currency
  }
  'player.game.big_win': {
    playerId: string
    gameId: string
    roundId: string
    amount: bigint
    currency: Currency
    multiplier?: number | null
  }
  'player.game.first_play': { playerId: string; gameId: string; firstSessionId: string }
}

// 1.5 Bonus
export interface BonusEventPayloads {
  'player.bonus.awarded': {
    playerId: string
    bonusId: string
    awardId: string
    amount: bigint
    currency: Currency
    bonusType: string
    triggerSource: string
  }
  'player.bonus.playthrough_started': {
    playerId: string
    awardId: string
    bonusId: string
  }
  'player.bonus.playthrough_progress': {
    playerId: string
    awardId: string
    bonusId: string
    contributedSc: bigint
    progressPct: number
  }
  'player.bonus.playthrough_completed': {
    playerId: string
    awardId: string
    bonusId: string
    completedAt: string
  }
  'player.bonus.expired': {
    playerId: string
    awardId: string
    bonusId: string
    forfeitedAmount: bigint
  }
  'player.bonus.forfeited': {
    playerId: string
    awardId: string
    bonusId: string
    reason: string
  }
}

// 1.6 Tier
export interface TierEventPayloads {
  'player.tier.up': {
    playerId: string
    fromTier: number
    toTier: number
    tierName: string
  }
  'player.tier.down': {
    playerId: string
    fromTier: number
    toTier: number
    tierName: string
  }
  'player.tier.weekly_bonus': {
    playerId: string
    tier: number
    amount: bigint
    currency: Currency
  }
  'player.tier.monthly_bonus': {
    playerId: string
    tier: number
    amount: bigint
    currency: Currency
  }
}

// 1.7 Compliance
export interface ComplianceEventPayloads {
  'player.rg.self_excluded': { playerId: string; until?: string | null; reason?: string | null }
  'player.rg.limit_set': {
    playerId: string
    limitKind: 'deposit_daily' | 'deposit_weekly' | 'deposit_monthly' | 'session_min'
    value: number
  }
  'player.rg.limit_reached': {
    playerId: string
    limitKind: string
    triggeredAt: string
  }
  'player.suspended': { playerId: string; reason: string; suspendedBy: string }
  'player.reactivated': { playerId: string; reactivatedBy: string }
}

// 1.8 Engagement
export interface EngagementEventPayloads {
  'player.email.opened': { playerId: string; messageLogId: string; campaignId?: string | null }
  'player.email.clicked': {
    playerId: string
    messageLogId: string
    url?: string | null
    campaignId?: string | null
  }
  'player.email.delivered': { playerId: string; messageLogId: string; campaignId?: string | null }
  'player.email.bounced': { playerId: string; messageLogId: string; reason?: string | null }
  'player.email.unsubscribed': { playerId: string; email: string }
  'player.sms.delivered': { playerId: string; messageLogId: string; campaignId?: string | null }
  'player.sms.clicked': { playerId: string; messageLogId: string; campaignId?: string | null }
  'player.sms.unsubscribed': { playerId: string; phone: string }
  'player.notification.opened': { playerId: string; notificationId: string }
  'player.referral.sent': {
    playerId: string
    channel: 'email' | 'sms' | 'link'
    targetEmail?: string | null
  }
  'player.referral.converted': { playerId: string; referredPlayerId: string }
}

// 1.9 Admin-fired
export interface AdminEventPayloads {
  'admin.player.note_added': { playerId: string; adminId: string; noteId: string }
  'admin.player.coin_adjustment': {
    playerId: string
    adminId: string
    amount: bigint
    currency: Currency
    reason: string
  }
  'admin.player.tag_added': { playerId: string; adminId: string; tag: string }
}

export type AllEventPayloads = AuthEventPayloads &
  KycEventPayloads &
  CommerceEventPayloads &
  GameplayEventPayloads &
  BonusEventPayloads &
  TierEventPayloads &
  ComplianceEventPayloads &
  EngagementEventPayloads &
  AdminEventPayloads

export type PlayerEventName = keyof AllEventPayloads

export type PlayerEvent = {
  [K in PlayerEventName]: { name: K; data: AllEventPayloads[K] }
}[PlayerEventName]

export type EventCategory =
  | 'auth'
  | 'kyc'
  | 'commerce'
  | 'gameplay'
  | 'bonus'
  | 'tier'
  | 'compliance'
  | 'crm'
  | 'admin'

const CATEGORY_BY_PREFIX: Record<string, EventCategory> = {
  'player.signup': 'auth',
  'player.login': 'auth',
  'player.login_failed': 'auth',
  'player.password_reset': 'auth',
  'player.email_verified': 'auth',
  'player.phone_verified': 'auth',
  'player.kyc.': 'kyc',
  'player.purchase.': 'commerce',
  'player.redemption.': 'commerce',
  'player.game.': 'gameplay',
  'player.bonus.': 'bonus',
  'player.tier.': 'tier',
  'player.rg.': 'compliance',
  'player.suspended': 'compliance',
  'player.reactivated': 'compliance',
  'player.email.': 'crm',
  'player.sms.': 'crm',
  'player.notification.': 'crm',
  'player.referral.': 'crm',
  'admin.': 'admin',
}

export function categoryFor(name: PlayerEventName | string): EventCategory {
  for (const prefix of Object.keys(CATEGORY_BY_PREFIX)) {
    if (name === prefix || name.startsWith(prefix)) {
      return CATEGORY_BY_PREFIX[prefix]
    }
  }
  return 'auth'
}
