// docs/07 §5 — cashier ops core surface.
//
// The redemption flow itself lives in `core/src/redemption`. Anything
// operator-facing that wraps that flow (auto-approval rule sets, the
// upcoming review-policy presets, etc.) lives here.

export {
  archiveRedemptionRule,
  createRedemptionRule,
  evaluateRedemptionRules,
  listActiveRedemptionRules,
  listRedemptionRules,
  loadRedemptionRule,
  setRedemptionRuleActive,
  updateRedemptionRule,
  type RedemptionEvaluationContext,
  type RedemptionRule,
  type RedemptionRuleAction,
  type RuleError,
  type RuleEvaluation,
  type RuleInput,
} from './redemption-rules'
