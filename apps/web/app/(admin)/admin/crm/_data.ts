import 'server-only'

import { sql } from 'drizzle-orm'

import { getDb } from '@coinfrenzy/db/client'

// Lightweight RSC data loaders for the CRM admin pages. They mirror the
// API routes but skip the auth/Inngest plumbing because RSCs run after
// requireAdminSession() on the layout.

export interface SegmentListRow {
  id: string
  name: string
  description: string | null
  cachedCount: number | null
  countUpdatedAt: string | null
  status: string
  updatedAt: string
  campaignsUsing: number
  flowsUsing: number
}

export interface ListSegmentFilters {
  search?: string
  status?: string
  usage?: 'used' | 'unused'
}

export async function listSegmentsForAdmin(
  filters: ListSegmentFilters = {},
): Promise<SegmentListRow[]> {
  const db = getDb()
  const conds: string[] = ['TRUE']
  if (filters.search?.trim()) {
    const q = filters.search.replace(/'/g, "''").toLowerCase()
    conds.push(`(lower(s.name) LIKE '%${q}%' OR lower(coalesce(s.description, '')) LIKE '%${q}%')`)
  }
  if (filters.status && filters.status !== 'all') {
    conds.push(`s.status = '${filters.status.replace(/'/g, "''")}'`)
  }
  const where = conds.join(' AND ')

  // The usage filter is applied post-aggregation because the count columns
  // come from sub-selects.
  const rows = await db.execute(
    sql.raw(`
    SELECT
      s.id, s.name, s.description, s.cached_count, s.count_updated_at, s.status, s.updated_at,
      (SELECT count(*)::int FROM crm_campaigns c WHERE c.segment_id = s.id) AS campaigns_using,
      (SELECT count(DISTINCT f.id)::int
        FROM crm_flows f
        LEFT JOIN crm_flow_steps fs ON fs.flow_id = f.id
        WHERE f.trigger_filter::text LIKE '%' || s.id::text || '%'
           OR fs.config::text LIKE '%' || s.id::text || '%') AS flows_using
    FROM crm_segments s
    WHERE ${where}
    ORDER BY s.updated_at DESC
    LIMIT 200
  `),
  )
  const out = (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    description: (r.description as string | null) ?? null,
    cachedCount: (r.cached_count as number | null) ?? null,
    countUpdatedAt: r.count_updated_at instanceof Date ? r.count_updated_at.toISOString() : null,
    status: String(r.status),
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
    campaignsUsing: Number(r.campaigns_using ?? 0),
    flowsUsing: Number(r.flows_using ?? 0),
  }))
  if (filters.usage === 'used') {
    return out.filter((s) => s.campaignsUsing + s.flowsUsing > 0)
  }
  if (filters.usage === 'unused') {
    return out.filter((s) => s.campaignsUsing + s.flowsUsing === 0)
  }
  return out
}

export interface CampaignListRow {
  id: string
  name: string
  channel: string
  status: string
  scheduledFor: string | null
  sentCount: number
  openedCount: number
  clickedCount: number
  updatedAt: string
}

export interface ListCampaignFilters {
  search?: string
  status?: string
  channel?: string
}

export async function listCampaignsForAdmin(
  filters: ListCampaignFilters = {},
): Promise<CampaignListRow[]> {
  const db = getDb()
  const conds: string[] = ['TRUE']
  if (filters.search?.trim()) {
    const q = filters.search.replace(/'/g, "''").toLowerCase()
    conds.push(`(lower(name) LIKE '%${q}%' OR lower(coalesce(description, '')) LIKE '%${q}%')`)
  }
  if (filters.status && filters.status !== 'all') {
    conds.push(`status = '${filters.status.replace(/'/g, "''")}'`)
  }
  if (filters.channel && filters.channel !== 'all') {
    conds.push(`channel = '${filters.channel.replace(/'/g, "''")}'`)
  }
  const where = conds.join(' AND ')

  const rows = await db.execute(
    sql.raw(`
    SELECT id, name, channel, status, scheduled_for, sent_count, opened_count, clicked_count, updated_at
    FROM crm_campaigns
    WHERE ${where}
    ORDER BY updated_at DESC
    LIMIT 200
  `),
  )
  return (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    channel: String(r.channel),
    status: String(r.status),
    scheduledFor:
      r.scheduled_for instanceof Date
        ? r.scheduled_for.toISOString()
        : ((r.scheduled_for as string | null) ?? null),
    sentCount: Number(r.sent_count ?? 0),
    openedCount: Number(r.opened_count ?? 0),
    clickedCount: Number(r.clicked_count ?? 0),
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  }))
}

export interface FlowListRow {
  id: string
  name: string
  triggerEvent: string
  status: string
  enrollmentsCountLifetime: number
  active: number
  updatedAt: string
}

export interface ListFlowFilters {
  search?: string
  status?: string
  triggerEvent?: string
}

export async function listFlowsForAdmin(filters: ListFlowFilters = {}): Promise<FlowListRow[]> {
  const db = getDb()
  const conds: string[] = ['TRUE']
  if (filters.search?.trim()) {
    const q = filters.search.replace(/'/g, "''").toLowerCase()
    conds.push(`(lower(f.name) LIKE '%${q}%' OR lower(coalesce(f.description, '')) LIKE '%${q}%')`)
  }
  if (filters.status && filters.status !== 'all') {
    conds.push(`f.status = '${filters.status.replace(/'/g, "''")}'`)
  }
  if (filters.triggerEvent && filters.triggerEvent !== 'all') {
    conds.push(`f.trigger_event = '${filters.triggerEvent.replace(/'/g, "''")}'`)
  }
  const where = conds.join(' AND ')

  const rows = await db.execute(
    sql.raw(`
    SELECT
      f.id, f.name, f.trigger_event, f.status, f.enrollments_count_lifetime, f.updated_at,
      COALESCE((SELECT COUNT(*) FROM crm_flow_enrollments e WHERE e.flow_id = f.id AND e.status = 'active'), 0) AS active
    FROM crm_flows f
    WHERE ${where}
    ORDER BY f.updated_at DESC
    LIMIT 200
  `),
  )
  return (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    triggerEvent: String(r.trigger_event),
    status: String(r.status),
    enrollmentsCountLifetime: Number(r.enrollments_count_lifetime ?? 0),
    active: Number(r.active ?? 0),
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  }))
}

export interface TemplateListRow {
  id: string
  slug: string
  displayName: string
  version: number
  category: string | null
  updatedAt: string
}

export interface ListTemplateFilters {
  search?: string
  category?: string
}

export async function listEmailTemplatesForAdmin(
  filters: ListTemplateFilters = {},
): Promise<TemplateListRow[]> {
  const db = getDb()
  const conds: string[] = ['is_current = true']
  if (filters.search?.trim()) {
    const q = filters.search.replace(/'/g, "''").toLowerCase()
    conds.push(
      `(lower(slug) LIKE '%${q}%' OR lower(display_name) LIKE '%${q}%' OR lower(coalesce(subject_template, '')) LIKE '%${q}%')`,
    )
  }
  if (filters.category && filters.category !== 'all') {
    conds.push(`category = '${filters.category.replace(/'/g, "''")}'`)
  }
  const where = conds.join(' AND ')

  const rows = await db.execute(
    sql.raw(`
    SELECT id, slug, display_name, version, category, updated_at
    FROM email_templates
    WHERE ${where}
    ORDER BY updated_at DESC
    LIMIT 200
  `),
  )
  return (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    slug: String(r.slug),
    displayName: String(r.display_name),
    version: Number(r.version ?? 1),
    category: (r.category as string | null) ?? null,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  }))
}

export async function listSmsTemplatesForAdmin(
  filters: ListTemplateFilters = {},
): Promise<Array<TemplateListRow & { bodyLength: number }>> {
  const db = getDb()
  const conds: string[] = ['is_current = true']
  if (filters.search?.trim()) {
    const q = filters.search.replace(/'/g, "''").toLowerCase()
    conds.push(
      `(lower(slug) LIKE '%${q}%' OR lower(display_name) LIKE '%${q}%' OR lower(coalesce(body_template, '')) LIKE '%${q}%')`,
    )
  }
  if (filters.category && filters.category !== 'all') {
    conds.push(`category = '${filters.category.replace(/'/g, "''")}'`)
  }
  const where = conds.join(' AND ')

  const rows = await db.execute(
    sql.raw(`
    SELECT id, slug, display_name, version, category, updated_at, length(body_template) AS body_length
    FROM sms_templates
    WHERE ${where}
    ORDER BY updated_at DESC
    LIMIT 200
  `),
  )
  return (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    slug: String(r.slug),
    displayName: String(r.display_name),
    version: Number(r.version ?? 1),
    category: (r.category as string | null) ?? null,
    bodyLength: Number(r.body_length ?? 0),
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  }))
}

export interface SmsTemplateDetailRow {
  id: string
  slug: string
  displayName: string
  version: number
  bodyTemplate: string
  category: string | null
}

export async function getSmsTemplateForAdmin(id: string): Promise<SmsTemplateDetailRow | null> {
  const db = getDb()
  const rows = await db.execute(sql`
    SELECT id, slug, display_name, version, body_template, category
    FROM sms_templates
    WHERE id = ${id}
    LIMIT 1
  `)
  const row = (rows as unknown as Array<Record<string, unknown>>)[0]
  if (!row) return null
  return {
    id: String(row.id),
    slug: String(row.slug),
    displayName: String(row.display_name),
    version: Number(row.version ?? 1),
    bodyTemplate: String(row.body_template),
    category: (row.category as string | null) ?? null,
  }
}

export interface MessageLogRow {
  id: string
  playerId: string
  campaignId: string | null
  channel: string
  recipient: string
  subject: string | null
  status: string
  createdAt: string
  sentAt: string | null
  openedAt: string | null
  clickedAt: string | null
}

export async function listMessageLogForAdmin(opts: {
  limit?: number
  campaignId?: string
  playerId?: string
}): Promise<MessageLogRow[]> {
  const db = getDb()
  const limit = opts.limit ?? 100
  const conds: string[] = ['TRUE']
  if (opts.campaignId) conds.push(`campaign_id = '${opts.campaignId.replace(/'/g, "''")}'`)
  if (opts.playerId) conds.push(`player_id = '${opts.playerId.replace(/'/g, "''")}'`)
  const where = conds.join(' AND ')
  const rows = await db.execute(
    sql.raw(`
    SELECT id, player_id, campaign_id, channel, recipient, subject, status,
      created_at, sent_at, opened_at, clicked_at
    FROM crm_message_log
    WHERE ${where}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `),
  )
  return (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    playerId: String(r.player_id),
    campaignId: (r.campaign_id as string | null) ?? null,
    channel: String(r.channel),
    recipient: String(r.recipient),
    subject: (r.subject as string | null) ?? null,
    status: String(r.status),
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    sentAt:
      r.sent_at instanceof Date ? r.sent_at.toISOString() : ((r.sent_at as string | null) ?? null),
    openedAt:
      r.opened_at instanceof Date
        ? r.opened_at.toISOString()
        : ((r.opened_at as string | null) ?? null),
    clickedAt:
      r.clicked_at instanceof Date
        ? r.clicked_at.toISOString()
        : ((r.clicked_at as string | null) ?? null),
  }))
}

export interface SuppressionRow {
  emailOrPhone: string
  reason: string
  source: string
  addedAt: string
}

export async function listSuppressionForAdmin(): Promise<SuppressionRow[]> {
  const db = getDb()
  const rows = await db.execute(sql`
    SELECT email_or_phone, reason, source, added_at
    FROM crm_suppression
    ORDER BY added_at DESC
    LIMIT 500
  `)
  return (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    emailOrPhone: String(r.email_or_phone),
    reason: String(r.reason),
    source: String(r.source),
    addedAt: r.added_at instanceof Date ? r.added_at.toISOString() : String(r.added_at),
  }))
}

/* -------------------------------------------------------------------------- */
/* Insights — lightweight aggregates that power the QuickInsights tiles.      */
/* -------------------------------------------------------------------------- */

export interface SegmentInsights {
  total: number
  largest: { name: string; count: number } | null
  mostUsedByCampaigns: { name: string; count: number } | null
  activeCampaignsUsingSegments: number
}

export async function fetchSegmentInsights(): Promise<SegmentInsights> {
  const db = getDb()
  const [aggRow] = (await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM crm_segments) AS total,
      (SELECT count(*)::int FROM crm_campaigns
        WHERE status IN ('scheduled', 'sending') AND segment_id IS NOT NULL) AS active_campaigns
  `)) as unknown as Array<{ total: number; active_campaigns: number }>
  const [largest] = (await db.execute(sql`
    SELECT name, cached_count
    FROM crm_segments
    WHERE cached_count IS NOT NULL
    ORDER BY cached_count DESC
    LIMIT 1
  `)) as unknown as Array<{ name: string; cached_count: number }>
  const [topUsed] = (await db.execute(sql`
    SELECT s.name, count(c.id)::int AS uses
    FROM crm_segments s
    LEFT JOIN crm_campaigns c ON c.segment_id = s.id
    GROUP BY s.id, s.name
    ORDER BY uses DESC
    LIMIT 1
  `)) as unknown as Array<{ name: string; uses: number }>

  return {
    total: aggRow?.total ?? 0,
    activeCampaignsUsingSegments: aggRow?.active_campaigns ?? 0,
    largest: largest ? { name: largest.name, count: Number(largest.cached_count ?? 0) } : null,
    mostUsedByCampaigns: topUsed ? { name: topUsed.name, count: topUsed.uses ?? 0 } : null,
  }
}

export interface CampaignInsights {
  sentToday: number
  recipientsToday: number
  openRate7d: number
  clickRate7d: number
}

export async function fetchCampaignInsights(): Promise<CampaignInsights> {
  const db = getDb()
  const [today] = (await db.execute(sql`
    SELECT
      coalesce(sum(case when sent_at::date = current_date then 1 else 0 end), 0)::int AS sent_today,
      coalesce(sum(case when sent_at::date = current_date then 1 else 0 end), 0)::int AS recipients_today
    FROM crm_message_log
  `)) as unknown as Array<{ sent_today: number; recipients_today: number }>
  const [rates] = (await db.execute(sql`
    SELECT
      coalesce(sum(case when opened_at is not null then 1 else 0 end), 0)::int AS opened,
      coalesce(sum(case when clicked_at is not null then 1 else 0 end), 0)::int AS clicked,
      count(*)::int AS total
    FROM crm_message_log
    WHERE created_at > now() - interval '7 days' AND status IN ('sent', 'delivered', 'opened', 'clicked')
  `)) as unknown as Array<{ opened: number; clicked: number; total: number }>

  const total = rates?.total ?? 0
  return {
    sentToday: today?.sent_today ?? 0,
    recipientsToday: today?.recipients_today ?? 0,
    openRate7d: total > 0 ? ((rates?.opened ?? 0) / total) * 100 : 0,
    clickRate7d: total > 0 ? ((rates?.clicked ?? 0) / total) * 100 : 0,
  }
}

export interface FlowInsights {
  active: number
  enrolled: number
  completed24h: number
  topFlow: { name: string; count: number } | null
}

export async function fetchFlowInsights(): Promise<FlowInsights> {
  const db = getDb()
  const [agg] = (await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM crm_flows WHERE status = 'active') AS active,
      (SELECT count(*)::int FROM crm_flow_enrollments WHERE status = 'active') AS enrolled,
      (SELECT count(*)::int FROM crm_flow_enrollments
        WHERE status = 'completed' AND completed_at > now() - interval '24 hours') AS completed_24h
  `)) as unknown as Array<{ active: number; enrolled: number; completed_24h: number }>
  const [top] = (await db.execute(sql`
    SELECT f.name, f.enrollments_count_lifetime AS count
    FROM crm_flows f
    ORDER BY f.enrollments_count_lifetime DESC
    LIMIT 1
  `)) as unknown as Array<{ name: string; count: number }>
  return {
    active: agg?.active ?? 0,
    enrolled: agg?.enrolled ?? 0,
    completed24h: agg?.completed_24h ?? 0,
    topFlow: top ? { name: top.name, count: Number(top.count ?? 0) } : null,
  }
}

/* -------------------------------------------------------------------------- */
/* CRM landing — overview tiles + top campaigns + quick actions               */
/* -------------------------------------------------------------------------- */

export interface CrmOverview {
  sentToday: number
  openRate7d: number
  clickRate7d: number
  conversions7d: number
  unsubscribed7d: number
  flowsActive: number
  segmentsTotal: number
  campaignsScheduled: number
}

export async function fetchCrmOverview(): Promise<CrmOverview> {
  const db = getDb()
  const [overview] = (await db.execute(sql`
    WITH msg AS (
      SELECT
        sum(case when sent_at::date = current_date then 1 else 0 end)::int AS sent_today,
        sum(case when opened_at is not null and created_at > now() - interval '7 days' then 1 else 0 end)::int AS opened_7d,
        sum(case when clicked_at is not null and created_at > now() - interval '7 days' then 1 else 0 end)::int AS clicked_7d,
        sum(case when status = 'unsubscribed' and created_at > now() - interval '7 days' then 1 else 0 end)::int AS unsubscribed_7d,
        sum(case when created_at > now() - interval '7 days' and status in ('sent','delivered','opened','clicked') then 1 else 0 end)::int AS reachable_7d
      FROM crm_message_log
      WHERE ab_variant IS DISTINCT FROM 'test_send'
    ),
    camp AS (
      SELECT
        sum(case when status in ('scheduled','sending') then 1 else 0 end)::int AS scheduled,
        sum(conversion_count)::int AS conversions
      FROM crm_campaigns
      WHERE updated_at > now() - interval '7 days'
    ),
    flw AS (
      SELECT count(*)::int AS active FROM crm_flows WHERE status = 'active'
    ),
    seg AS (
      SELECT count(*)::int AS total FROM crm_segments
    )
    SELECT
      coalesce(msg.sent_today, 0) AS sent_today,
      CASE WHEN coalesce(msg.reachable_7d, 0) > 0
        THEN (coalesce(msg.opened_7d, 0)::float / msg.reachable_7d) * 100
        ELSE 0 END AS open_rate_7d,
      CASE WHEN coalesce(msg.reachable_7d, 0) > 0
        THEN (coalesce(msg.clicked_7d, 0)::float / msg.reachable_7d) * 100
        ELSE 0 END AS click_rate_7d,
      coalesce(camp.conversions, 0) AS conversions_7d,
      coalesce(msg.unsubscribed_7d, 0) AS unsubscribed_7d,
      coalesce(flw.active, 0) AS flows_active,
      coalesce(seg.total, 0) AS segments_total,
      coalesce(camp.scheduled, 0) AS campaigns_scheduled
    FROM msg, camp, flw, seg
  `)) as unknown as Array<Record<string, unknown>>

  return {
    sentToday: Number(overview?.sent_today ?? 0),
    openRate7d: Number(overview?.open_rate_7d ?? 0),
    clickRate7d: Number(overview?.click_rate_7d ?? 0),
    conversions7d: Number(overview?.conversions_7d ?? 0),
    unsubscribed7d: Number(overview?.unsubscribed_7d ?? 0),
    flowsActive: Number(overview?.flows_active ?? 0),
    segmentsTotal: Number(overview?.segments_total ?? 0),
    campaignsScheduled: Number(overview?.campaigns_scheduled ?? 0),
  }
}

export interface TopCampaignRow {
  id: string
  name: string
  channel: string
  status: string
  sentCount: number
  openedCount: number
  clickedCount: number
  conversionCount: number
  openRate: number
  clickRate: number
  conversionRate: number
  lastUpdated: string
}

export async function fetchTopCampaigns(limit = 8): Promise<TopCampaignRow[]> {
  const db = getDb()
  const rows = await db.execute(sql`
    SELECT id, name, channel, status, sent_count, opened_count, clicked_count,
      conversion_count, updated_at
    FROM crm_campaigns
    WHERE status IN ('sent', 'sending')
      AND sent_count > 0
    ORDER BY sent_count DESC, conversion_count DESC
    LIMIT ${limit}
  `)
  return (rows as unknown as Array<Record<string, unknown>>).map((r) => {
    const sent = Number(r.sent_count ?? 0)
    const opened = Number(r.opened_count ?? 0)
    const clicked = Number(r.clicked_count ?? 0)
    const conv = Number(r.conversion_count ?? 0)
    return {
      id: String(r.id),
      name: String(r.name),
      channel: String(r.channel),
      status: String(r.status),
      sentCount: sent,
      openedCount: opened,
      clickedCount: clicked,
      conversionCount: conv,
      openRate: sent > 0 ? (opened / sent) * 100 : 0,
      clickRate: sent > 0 ? (clicked / sent) * 100 : 0,
      conversionRate: sent > 0 ? (conv / sent) * 100 : 0,
      lastUpdated: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
    }
  })
}

/* -------------------------------------------------------------------------- */
/* Performance dashboards                                                     */
/* -------------------------------------------------------------------------- */

export interface ChannelStats {
  channel: string
  sent: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  unsubscribed: number
  deliveryRate: number
  openRate: number
  clickRate: number
}

export async function fetchChannelStats(): Promise<ChannelStats[]> {
  const db = getDb()
  const rows = await db.execute(sql`
    SELECT
      channel,
      count(*)::int AS sent,
      sum(case when status in ('delivered','opened','clicked') then 1 else 0 end)::int AS delivered,
      sum(case when opened_at is not null then 1 else 0 end)::int AS opened,
      sum(case when clicked_at is not null then 1 else 0 end)::int AS clicked,
      sum(case when status = 'bounced' then 1 else 0 end)::int AS bounced,
      sum(case when status = 'unsubscribed' then 1 else 0 end)::int AS unsubscribed
    FROM crm_message_log
    WHERE ab_variant IS DISTINCT FROM 'test_send'
      AND created_at > now() - interval '30 days'
    GROUP BY channel
    ORDER BY sent DESC
  `)
  return (rows as unknown as Array<Record<string, unknown>>).map((r) => {
    const sent = Number(r.sent ?? 0)
    const delivered = Number(r.delivered ?? 0)
    const opened = Number(r.opened ?? 0)
    const clicked = Number(r.clicked ?? 0)
    return {
      channel: String(r.channel),
      sent,
      delivered,
      opened,
      clicked,
      bounced: Number(r.bounced ?? 0),
      unsubscribed: Number(r.unsubscribed ?? 0),
      deliveryRate: sent > 0 ? (delivered / sent) * 100 : 0,
      openRate: sent > 0 ? (opened / sent) * 100 : 0,
      clickRate: sent > 0 ? (clicked / sent) * 100 : 0,
    }
  })
}

export interface SuppressionAnalytics {
  total: number
  byReason: Array<{ reason: string; count: number }>
  bySource: Array<{ source: string; count: number }>
  trend: Array<{ day: string; count: number }>
  topCampaignsTriggering: Array<{ campaignName: string; unsubs: number }>
}

export async function fetchSuppressionAnalytics(): Promise<SuppressionAnalytics> {
  const db = getDb()
  const [agg] = (await db.execute(sql`
    SELECT count(*)::int AS total FROM crm_suppression
  `)) as unknown as Array<{ total: number }>

  const reasons = await db.execute(sql`
    SELECT reason, count(*)::int AS count
    FROM crm_suppression
    GROUP BY reason
    ORDER BY count DESC
  `)
  const sources = await db.execute(sql`
    SELECT source, count(*)::int AS count
    FROM crm_suppression
    GROUP BY source
    ORDER BY count DESC
  `)
  const trend = await db.execute(sql`
    SELECT date_trunc('day', added_at)::date AS day, count(*)::int AS count
    FROM crm_suppression
    WHERE added_at > now() - interval '30 days'
    GROUP BY day
    ORDER BY day ASC
  `)
  const topUnsubs = await db.execute(sql`
    SELECT c.name AS campaign_name, count(*)::int AS unsubs
    FROM crm_message_log m
    JOIN crm_campaigns c ON c.id = m.campaign_id
    WHERE m.status = 'unsubscribed'
      AND m.created_at > now() - interval '30 days'
    GROUP BY c.id, c.name
    ORDER BY unsubs DESC
    LIMIT 5
  `)

  return {
    total: Number(agg?.total ?? 0),
    byReason: (reasons as unknown as Array<Record<string, unknown>>).map((r) => ({
      reason: String(r.reason),
      count: Number(r.count ?? 0),
    })),
    bySource: (sources as unknown as Array<Record<string, unknown>>).map((r) => ({
      source: String(r.source),
      count: Number(r.count ?? 0),
    })),
    trend: (trend as unknown as Array<Record<string, unknown>>).map((r) => ({
      day: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10),
      count: Number(r.count ?? 0),
    })),
    topCampaignsTriggering: (topUnsubs as unknown as Array<Record<string, unknown>>).map((r) => ({
      campaignName: String(r.campaign_name),
      unsubs: Number(r.unsubs ?? 0),
    })),
  }
}

export interface MessageLogInsights {
  totalToday: number
  delivered7d: number
  bounce7d: number
  unsubscribed7d: number
}

export async function fetchMessageLogInsights(): Promise<MessageLogInsights> {
  const db = getDb()
  const [agg] = (await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM crm_message_log
        WHERE created_at::date = current_date) AS total_today,
      (SELECT count(*)::int FROM crm_message_log
        WHERE status IN ('delivered', 'opened', 'clicked')
          AND created_at > now() - interval '7 days') AS delivered_7d,
      (SELECT count(*)::int FROM crm_message_log
        WHERE status = 'bounced' AND created_at > now() - interval '7 days') AS bounce_7d,
      (SELECT count(*)::int FROM crm_message_log
        WHERE status = 'unsubscribed' AND created_at > now() - interval '7 days') AS unsubscribed_7d
  `)) as unknown as Array<{
    total_today: number
    delivered_7d: number
    bounce_7d: number
    unsubscribed_7d: number
  }>
  return {
    totalToday: agg?.total_today ?? 0,
    delivered7d: agg?.delivered_7d ?? 0,
    bounce7d: agg?.bounce_7d ?? 0,
    unsubscribed7d: agg?.unsubscribed_7d ?? 0,
  }
}
