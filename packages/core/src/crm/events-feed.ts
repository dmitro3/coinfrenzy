// CRM real-time events feed service.
//
// Shapes the recent crm_message_log + audit_log activity into a stream
// the EventsFeed UI component consumes. Polling-based (5s) for now;
// can be swapped to Pusher once the realtime channel is live.

import { sql } from 'drizzle-orm'

import type { Context } from '../context'

export type EventKind =
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'unsubscribed'
  | 'campaign_created'
  | 'campaign_sent'
  | 'segment_created'
  | 'flow_published'

export interface CrmEvent {
  id: string
  kind: EventKind
  /** ISO timestamp. */
  occurredAt: string
  /** Short subject of the event ("Welcome Series Email 1"). */
  subject: string
  /** Object affected ("as@gmail.com"). */
  target: string | null
  /** Optional secondary detail rendered after the subject. */
  detail?: string
  /** Where to deep-link in the admin. */
  href?: string
}

export interface EventsFeedFilter {
  /** Restrict to a single kind. */
  kind?: EventKind
  /** Limit. Defaults to 50. */
  limit?: number
  /** Filter by min event timestamp (ISO). */
  since?: string
}

export async function recentEvents(
  ctx: Context,
  filter: EventsFeedFilter = {},
): Promise<CrmEvent[]> {
  const limit = Math.max(1, Math.min(filter.limit ?? 50, 200))

  const sinceClause = filter.since ? sql`AND occurred_at >= ${filter.since}::timestamptz` : sql``

  // We pull from two sources: crm_message_log (sends/opens/clicks) and
  // audit_log (segment/campaign/flow lifecycle events). Both are unioned
  // with a normalised shape and ordered by `occurred_at desc`.
  const rows = await ctx.db.execute(sql`
    SELECT * FROM (
      SELECT
        m.id::text AS id,
        CASE
          WHEN m.opened_at IS NOT NULL  AND m.opened_at  >= NOW() - INTERVAL '24 hours' THEN 'opened'
          WHEN m.clicked_at IS NOT NULL AND m.clicked_at >= NOW() - INTERVAL '24 hours' THEN 'clicked'
          WHEN m.status = 'bounced'                                                   THEN 'bounced'
          WHEN m.status = 'unsubscribed'                                              THEN 'unsubscribed'
          WHEN m.status = 'delivered'                                                 THEN 'delivered'
          ELSE 'sent'
        END AS kind,
        COALESCE(m.opened_at, m.clicked_at, m.delivered_at, m.sent_at, m.created_at) AS occurred_at,
        coalesce(m.subject, et.display_name, st.display_name, 'Message') AS subject,
        m.recipient AS target,
        c.name AS detail,
        ('/admin/crm/message-log?id=' || m.id::text) AS href
      FROM crm_message_log m
      LEFT JOIN crm_campaigns c ON c.id = m.campaign_id
      LEFT JOIN email_templates et ON et.id = m.template_id
      LEFT JOIN sms_templates st ON st.id = m.template_id
      WHERE m.created_at > NOW() - INTERVAL '7 days'
        AND m.ab_variant IS DISTINCT FROM 'test_send'
      UNION ALL
      SELECT
        a.id::text AS id,
        CASE a.action
          WHEN 'crm.campaign.create' THEN 'campaign_created'
          WHEN 'crm.campaign.send'   THEN 'campaign_sent'
          WHEN 'crm.segment.create'  THEN 'segment_created'
          WHEN 'crm.flow.create'     THEN 'flow_published'
          ELSE 'campaign_created'
        END AS kind,
        a.occurred_at AS occurred_at,
        coalesce(a.after->>'name', a.action) AS subject,
        adm.email AS target,
        a.action AS detail,
        CASE
          WHEN a.resource_kind = 'crm_campaign' THEN '/admin/crm/campaigns/' || a.resource_id::text
          WHEN a.resource_kind = 'crm_segment'  THEN '/admin/crm/segments/'  || a.resource_id::text
          WHEN a.resource_kind = 'crm_flow'     THEN '/admin/crm/flows/'     || a.resource_id::text
          ELSE NULL
        END AS href
      FROM audit_log a
      LEFT JOIN admins adm ON adm.id = a.actor_id
      WHERE a.action LIKE 'crm.%'
        AND a.occurred_at > NOW() - INTERVAL '7 days'
    ) t
    WHERE TRUE
      ${filter.kind ? sql`AND kind = ${filter.kind}` : sql``}
      ${sinceClause}
    ORDER BY occurred_at DESC
    LIMIT ${limit}
  `)

  return (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    kind: String(r.kind) as EventKind,
    occurredAt: r.occurred_at instanceof Date ? r.occurred_at.toISOString() : String(r.occurred_at),
    subject: String(r.subject ?? ''),
    target: (r.target as string | null) ?? null,
    detail: (r.detail as string | undefined) ?? undefined,
    href: (r.href as string | undefined) ?? undefined,
  }))
}
