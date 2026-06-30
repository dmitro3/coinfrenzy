// docs/11 — CRM module barrel.

export {
  validateFilterTree,
  type FilterTree,
  type FilterCondition,
  type FilterGroup,
  type DemographicCondition,
  type BehaviorCondition,
  type BonusCondition,
  type ComplianceCondition,
  type EngagementCondition,
  type AffiliateCondition,
  type InSegmentCondition,
  type AttributeCondition,
} from './filter-tree'

export { compile, type CompiledSegment, type CompileOptions } from './compiler'

export {
  ATTRIBUTE_REGISTRY,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  OPERATOR_LABELS,
  getAttribute,
  getAttributesByCategory,
  type AttributeDef,
  type AttributeSource,
  type AttributeCategory,
  type OperatorKey,
  type ValueType,
} from './attributes'

export {
  countSegment,
  previewSegment,
  listPlayerIds,
  saveSegment,
  getSegment,
  listSegments,
  refreshCachedCount,
  type SaveSegmentInput,
  type SavedSegment,
  type SegmentError,
  type PreviewPlayer,
} from './segments'

export {
  buildPlayerVariableContext,
  renderTemplate,
  renderPlaintextTemplate,
  saveEmailTemplate,
  saveSmsTemplate,
  listEmailTemplates,
  listSmsTemplates,
  getEmailTemplate,
  getEmailTemplateBySlug,
  getSmsTemplate,
  getSmsTemplateBySlug,
  type RenderContext,
  type PlayerVariableContext,
  type CampaignVariableContext,
  type SaveEmailTemplateInput,
  type SaveSmsTemplateInput,
  type TemplateError,
} from './templates'

export {
  fetchExtendedPlayerContext,
  renderPreview,
  extractVariables,
  TEMPLATE_VARIABLES,
  type ExtendedPlayerContext,
  type PreviewResult,
  type PreviewMetrics,
  type PreviewOptions,
  type TemplateVariable,
} from './preview'

export {
  generateInsights,
  type SegmentInsight,
  type InsightTone,
  type InsightsError,
} from './insights'

export {
  analyseCohort,
  type CohortAnalysis,
  type CohortMetric,
  type CohortCellData,
  type CohortKpiTiles,
  type CohortError,
} from './cohort'

export {
  sendAdminTest,
  type TestSendInput,
  type TestSendResult,
  type TestSendError,
} from './test-send'

export { abSignificance, type AbArmStats, type AbSignificanceResult } from './ab-stats'

export { recentEvents, type CrmEvent, type EventKind, type EventsFeedFilter } from './events-feed'

export { canReceive, type EligibilityDecision, type IneligibilityReason } from './eligibility'

export {
  dispatchEmail,
  dispatchSms,
  type EmailSendInput,
  type SmsSendInput,
  type DispatchResult,
} from './dispatchers'

export {
  sendDirectMessage,
  type SendDirectMessageInput,
  type SendDirectMessageOutput,
  type SendDirectError,
  type DirectChannel,
} from './send-direct'

export {
  createCampaign,
  scheduleCampaign,
  cancelCampaign,
  sendOneCampaignMessage,
  runCampaignSend,
  recomputeCampaignCounters,
  decideAbWinner,
  attributeConversions,
  listCampaigns,
  getCampaign,
  type CreateCampaignInput,
  type CampaignError,
  type DispatchToOnePlayerOptions,
} from './campaigns'

export {
  saveFlow,
  pauseFlow,
  resumeFlow,
  enrollPlayer,
  processDueEnrollments,
  recoveryEnrollScan,
  listFlows,
  getFlow,
  flowAnalytics,
  findActiveEnrollments,
  cancelEnrollment,
  type SaveFlowInput,
  type FlowError,
  type FlowStepActionType,
  type FlowStepConfig,
} from './flows'

export {
  CRM_EVENT_REGISTRY,
  CRM_EVENT_CATEGORY_LABELS,
  getTriggerEvents,
  getConversionEvents,
  findCrmEvent,
  type CrmEventDef,
  type EventCategoryKey,
} from './event-registry'

export {
  FLOW_RECIPES,
  buildFlowRecipe,
  findRecipe,
  type FlowRecipe,
  type FlowRecipeStep,
} from './flow-recipes'
