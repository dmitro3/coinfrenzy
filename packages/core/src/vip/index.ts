// M4 — VIP / Host system. Public surface.

export {
  assignToHost,
  evaluateAllPlayers,
  evaluatePlayerVipStatus,
  reassignAllVipsFromHost,
  setVipStatus,
  statusForLifetimeSpend,
  unassignFromHost,
  type VipStatus,
  type EvaluateResult,
} from './qualification'

export {
  getHostInteractions,
  getInteractionHistory,
  getInteractionsNeedingAttention,
  logInteraction,
  type InteractionHistoryOptions,
  type InteractionOutcome,
  type InteractionRow,
  type InteractionType,
  type LogInteractionInput,
  type VipNeedingAttention,
} from './interactions'

export {
  awardHostBonus,
  canHostAwardBonus,
  getHostWeeklyBonusBudget,
  type HostAwardError,
  type HostAwardErrorCode,
  type HostAwardResult,
  type HostWeeklyBudget,
} from './host-bonus'
