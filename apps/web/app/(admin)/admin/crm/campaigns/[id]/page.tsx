import Link from 'next/link'
import { notFound } from 'next/navigation'
import { sql } from 'drizzle-orm'

import { PageContainer, PageHeader } from '@coinfrenzy/ui/admin/layout/PageHeader'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'
import { StatusPill, type StatusPillTone } from '@coinfrenzy/ui/admin'
import { getDb } from '@coinfrenzy/db/client'

import { SendControls } from './_send-controls'
import { CampaignFunnel } from './_funnel'
import { AbWinnerCard } from './_ab-winner'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface PageProps {
  params: Promise<{ id: string }>
}

const STATUS_TONE: Record<string, StatusPillTone> = {
  draft: 'neutral',
  scheduled: 'notice',
  sending: 'attention',
  sent: 'positive',
  cancelled: 'critical',
  paused: 'neutral',
}

interface RecipientRow {
  id: string
  player_id: string
  email: string
  status: string
  sent_at: string | null
  opened_at: string | null
  clicked_at: string | null
  ab_variant: string | null
}

interface AuditRow {
  id: string
  action: string
  actor_email: string | null
  occurred_at: string
}

export default async function Page({ params }: PageProps) {
  const { id } = await params
  const db = getDb()
  const rows = await db.execute(sql`
    SELECT
      c.id, c.name, c.description, c.channel, c.status, c.scheduled_for,
      c.sent_started_at, c.sent_completed_at,
      c.recipients_count, c.eligible_count, c.sent_count, c.delivered_count,
      c.opened_count, c.clicked_count, c.bounced_count, c.unsubscribed_count,
      c.conversion_count, c.conversion_event,
      c.ab_variant_a_template_id, c.ab_variant_b_template_id, c.ab_winning_variant,
      c.ab_split_pct, c.ab_winner_metric,
      s.id AS segment_id, s.name AS segment_name, s.cached_count AS segment_count,
      t.display_name AS template_name
    FROM crm_campaigns c
    LEFT JOIN crm_segments s ON s.id = c.segment_id
    LEFT JOIN email_templates t ON t.id = c.template_id
    WHERE c.id = ${id}
    LIMIT 1
  `)
  const row = (rows as unknown as Array<Record<string, unknown>>)[0]
  if (!row) return notFound()

  const recipientRows = (await db.execute(sql`
    SELECT m.id, m.player_id, m.recipient AS email, m.status, m.sent_at, m.opened_at,
      m.clicked_at, m.ab_variant
    FROM crm_message_log m
    WHERE m.campaign_id = ${id}
      AND m.ab_variant IS DISTINCT FROM 'test_send'
    ORDER BY m.created_at DESC
    LIMIT 50
  `)) as unknown as RecipientRow[]

  const auditRows = (await db.execute(sql`
    SELECT a.id, a.action, adm.email AS actor_email, a.occurred_at
    FROM audit_log a
    LEFT JOIN admins adm ON adm.id = a.actor_id
    WHERE a.resource_kind = 'campaign' AND a.resource_id = ${id}
    ORDER BY a.occurred_at DESC
    LIMIT 30
  `)) as unknown as AuditRow[]

  const sent = Number(row.sent_count ?? 0)
  const delivered = Number(row.delivered_count ?? 0)
  const opened = Number(row.opened_count ?? 0)
  const clicked = Number(row.clicked_count ?? 0)
  const conv = Number(row.conversion_count ?? 0)
  const recipients = Number(row.recipients_count ?? 0)

  const openRate = sent > 0 ? (opened / sent) * 100 : 0
  const clickRate = sent > 0 ? (clicked / sent) * 100 : 0
  const convRate = sent > 0 ? (conv / sent) * 100 : 0

  // Compute A/B variant A vs B aggregates from message log.
  const abAggregates = (await db.execute(sql`
    SELECT
      ab_variant,
      count(*)::int AS sent,
      sum(case when opened_at is not null then 1 else 0 end)::int AS opened,
      sum(case when clicked_at is not null then 1 else 0 end)::int AS clicked
    FROM crm_message_log
    WHERE campaign_id = ${id}
      AND ab_variant IN ('a', 'b')
    GROUP BY ab_variant
  `)) as unknown as Array<{ ab_variant: string; sent: number; opened: number; clicked: number }>

  return (
    <PageContainer>
      <PageHeader
        title={String(row.name)}
        subtitle={
          recipients > 0
            ? `${recipients.toLocaleString()} recipients · ${row.channel}`
            : String(row.channel)
        }
        description={(row.description as string | null) ?? undefined}
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'CRM', href: '/admin/crm' },
          { label: 'Campaigns', href: '/admin/crm/campaigns' },
          { label: String(row.name) },
        ]}
        renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
        actions={<SendControls campaignId={id} status={String(row.status)} />}
      />

      <div className="space-y-6">
        {/* Status + KPI tiles */}
        <div className="grid gap-3 md:grid-cols-4">
          <Tile label="Status">
            <StatusPill
              status="custom"
              color={STATUS_TONE[String(row.status)] ?? 'neutral'}
              label={String(row.status)}
            />
          </Tile>
          <Tile label="Recipients" value={recipients.toLocaleString()} />
          <Tile
            label="Sent"
            value={sent.toLocaleString()}
            sub={
              recipients > 0 ? `${((sent / recipients) * 100).toFixed(1)}% of audience` : undefined
            }
          />
          <Tile label="Delivered" value={delivered.toLocaleString()} />
          <Tile
            label="Open rate"
            value={`${openRate.toFixed(1)}%`}
            sub={`${opened.toLocaleString()} opens`}
          />
          <Tile
            label="Click rate"
            value={`${clickRate.toFixed(1)}%`}
            sub={`${clicked.toLocaleString()} clicks`}
          />
          <Tile
            label="Conversion"
            value={`${convRate.toFixed(1)}%`}
            sub={
              row.conversion_event
                ? `${conv.toLocaleString()} · ${row.conversion_event}`
                : `${conv.toLocaleString()} (no event set)`
            }
          />
          <Tile label="Bounced" value={Number(row.bounced_count ?? 0).toLocaleString()} />
        </div>

        {/* Funnel + meta */}
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Card>
            <CardContent className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-ink-primary">Funnel</h3>
              <CampaignFunnel
                stages={[
                  { label: 'Recipients', value: recipients },
                  { label: 'Sent', value: sent },
                  { label: 'Delivered', value: delivered },
                  { label: 'Opened', value: opened },
                  { label: 'Clicked', value: clicked },
                  ...(row.conversion_event ? [{ label: 'Converted', value: conv }] : []),
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-ink-primary">Configuration</h3>
              <dl className="space-y-2 text-sm">
                <Field label="Channel" value={String(row.channel)} />
                <Field
                  label="Segment"
                  value={
                    row.segment_id ? (
                      <Link
                        href={`/admin/crm/segments/${row.segment_id}`}
                        className="text-accent hover:underline"
                      >
                        {String(row.segment_name)}
                      </Link>
                    ) : (
                      '—'
                    )
                  }
                />
                <Field label="Template" value={String(row.template_name ?? '—')} />
                <Field
                  label="Scheduled for"
                  value={
                    row.scheduled_for
                      ? new Date(String(row.scheduled_for)).toLocaleString()
                      : 'immediate on Send'
                  }
                />
                <Field
                  label="Sent started"
                  value={
                    row.sent_started_at
                      ? new Date(String(row.sent_started_at)).toLocaleString()
                      : '—'
                  }
                />
                <Field
                  label="Sent completed"
                  value={
                    row.sent_completed_at
                      ? new Date(String(row.sent_completed_at)).toLocaleString()
                      : '—'
                  }
                />
                <Field label="Conversion event" value={String(row.conversion_event ?? '—')} />
              </dl>
            </CardContent>
          </Card>
        </div>

        {/* A/B winner card */}
        {row.ab_variant_a_template_id && row.ab_variant_b_template_id ? (
          <AbWinnerCard
            variantA={
              abAggregates.find((a) => a.ab_variant === 'a') ?? { sent: 0, opened: 0, clicked: 0 }
            }
            variantB={
              abAggregates.find((a) => a.ab_variant === 'b') ?? { sent: 0, opened: 0, clicked: 0 }
            }
            metric={
              (row.ab_winner_metric as 'open_rate' | 'click_rate' | 'conversion') ?? 'open_rate'
            }
            declaredWinner={(row.ab_winning_variant as string | null) ?? null}
          />
        ) : null}

        {/* Recipients list */}
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-line-subtle px-4 py-3">
              <h3 className="text-sm font-semibold text-ink-primary">Recent recipients</h3>
              <span className="text-xs text-ink-tertiary">
                Showing latest {recipientRows.length}
              </span>
            </div>
            {recipientRows.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-ink-tertiary">
                No recipients yet.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                    <th className="px-4 py-2">Recipient</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Sent</th>
                    <th className="px-4 py-2">Opened</th>
                    <th className="px-4 py-2">Clicked</th>
                    <th className="px-4 py-2">Variant</th>
                  </tr>
                </thead>
                <tbody>
                  {recipientRows.map((r) => (
                    <tr key={r.id} className="border-t border-line-subtle hover:bg-surface-hover">
                      <td className="px-4 py-2 text-sm">
                        <Link
                          href={`/admin/players/${r.player_id}`}
                          className="text-ink-primary hover:underline"
                        >
                          {r.email}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-xs uppercase tracking-wide text-ink-secondary">
                        {r.status}
                      </td>
                      <td className="px-4 py-2 text-xs text-ink-tertiary">
                        {r.sent_at ? new Date(r.sent_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-2 text-xs text-ink-tertiary">
                        {r.opened_at ? '✓' : '—'}
                      </td>
                      <td className="px-4 py-2 text-xs text-ink-tertiary">
                        {r.clicked_at ? '✓' : '—'}
                      </td>
                      <td className="px-4 py-2 text-xs text-ink-tertiary">{r.ab_variant ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Audit log */}
        {auditRows.length > 0 ? (
          <Card>
            <CardContent className="p-0">
              <div className="border-b border-line-subtle px-4 py-3">
                <h3 className="text-sm font-semibold text-ink-primary">Audit log</h3>
              </div>
              <ul className="divide-y divide-line-subtle">
                {auditRows.map((a) => (
                  <li key={a.id} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className="font-mono text-xs text-ink-primary">{a.action}</span>
                    <span className="text-xs text-ink-tertiary">
                      {a.actor_email ?? 'system'} · {new Date(a.occurred_at).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </PageContainer>
  )
}

function Tile({
  label,
  value,
  sub,
  children,
}: {
  label: string
  value?: string
  sub?: string
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-line-subtle bg-surface p-4">
      <div className="text-xs uppercase tracking-wide text-ink-tertiary">{label}</div>
      {value ? (
        <div className="mt-1 text-2xl font-semibold tabular-nums text-ink-primary">{value}</div>
      ) : children ? (
        <div className="mt-1">{children}</div>
      ) : null}
      {sub ? <div className="text-xs text-ink-tertiary">{sub}</div> : null}
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3">
      <dt className="text-ink-tertiary">{label}</dt>
      <dd className="font-medium text-ink-primary">{value}</dd>
    </div>
  )
}
