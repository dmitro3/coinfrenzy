import Link from 'next/link'
import { notFound } from 'next/navigation'
import { sql } from 'drizzle-orm'

import { crm } from '@coinfrenzy/core'
import { PageContainer, PageHeader } from '@coinfrenzy/ui/admin/layout/PageHeader'
import { getDb } from '@coinfrenzy/db/client'

import { FlowBuilderWrapper } from '../_flow-builder'
import { FlowControls } from './_flow-controls'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

interface PerStepEnroll {
  step_number: number
  active: number
}

export default async function Page({ params }: PageProps) {
  const { id } = await params
  const db = getDb()
  const flowRows = await db.execute(sql`
    SELECT id, name, description, trigger_event, max_enrollments_per_player,
           cooldown_hours_between_enrollments, status, conversion_event, enrollments_count_lifetime
    FROM crm_flows WHERE id = ${id} LIMIT 1
  `)
  const flow = (flowRows as unknown as Array<Record<string, unknown>>)[0]
  if (!flow) return notFound()

  const stepRows = await db.execute(sql`
    SELECT step_number, action_type, config, wait_duration_seconds
    FROM crm_flow_steps WHERE flow_id = ${id} ORDER BY step_number ASC
  `)

  const analyticsRows = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status='active') AS active,
      COUNT(*) FILTER (WHERE status='completed') AS completed,
      COUNT(*) FILTER (WHERE status='errored') AS errored,
      COUNT(*) FILTER (WHERE enrolled_at >= NOW() - INTERVAL '7 days') AS recent
    FROM crm_flow_enrollments WHERE flow_id = ${id}
  `)
  const analytics = (analyticsRows as unknown as Array<Record<string, string>>)[0] ?? {}

  // Per-step enrollment heat — used for live counts on each node.
  const perStep = (await db.execute(sql`
    SELECT current_step AS step_number, count(*)::int AS active
    FROM crm_flow_enrollments
    WHERE flow_id = ${id} AND status = 'active'
    GROUP BY current_step
  `)) as unknown as PerStepEnroll[]
  const enrollByStep = new Map(perStep.map((r) => [Number(r.step_number), Number(r.active)]))

  const emailTemplates = (await db.execute(sql`
    SELECT id, slug, display_name FROM email_templates WHERE is_current = true ORDER BY display_name
  `)) as unknown as Array<{ id: string; slug: string; display_name: string }>
  const smsTemplates = (await db.execute(sql`
    SELECT id, slug, display_name FROM sms_templates WHERE is_current = true ORDER BY display_name
  `)) as unknown as Array<{ id: string; slug: string; display_name: string }>

  return (
    <PageContainer>
      <PageHeader
        title={String(flow.name)}
        subtitle={`${Number(flow.enrollments_count_lifetime ?? 0).toLocaleString()} lifetime enrollments`}
        description={(flow.description as string | null) ?? undefined}
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'CRM', href: '/admin/crm' },
          { label: 'Flows', href: '/admin/crm/flows' },
          { label: String(flow.name) },
        ]}
        renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
        actions={<FlowControls flowId={id} status={String(flow.status)} />}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Lifetime enrollments"
          value={Number(flow.enrollments_count_lifetime ?? 0).toLocaleString()}
        />
        <Stat label="Active" value={Number(analytics.active ?? 0).toLocaleString()} />
        <Stat label="Completed" value={Number(analytics.completed ?? 0).toLocaleString()} />
        <Stat label="Errored" value={Number(analytics.errored ?? 0).toLocaleString()} />
      </div>

      <FlowBuilderWrapper
        flowId={id}
        triggerEventOptions={crm.getTriggerEvents().map((t) => t.name)}
        emailTemplates={emailTemplates.map((t) => ({
          id: t.id,
          slug: t.slug,
          displayName: t.display_name,
        }))}
        smsTemplates={smsTemplates.map((t) => ({
          id: t.id,
          slug: t.slug,
          displayName: t.display_name,
        }))}
        initialMeta={{
          name: String(flow.name),
          description: (flow.description as string | null) ?? null,
          triggerEvent: String(flow.trigger_event),
          maxEnrollmentsPerPlayer: (flow.max_enrollments_per_player as number | null) ?? 1,
          cooldownHoursBetweenEnrollments:
            (flow.cooldown_hours_between_enrollments as number | null) ?? null,
          status: String(flow.status) as 'active' | 'paused' | 'archived',
          conversionEvent: (flow.conversion_event as string | null) ?? null,
        }}
        initialSteps={(stepRows as unknown as Array<Record<string, unknown>>).map((s) => {
          const stepNum = Number(s.step_number)
          return {
            stepNumber: stepNum,
            actionType: String(s.action_type) as never,
            config: (s.config as Record<string, unknown>) ?? {},
            waitDurationSeconds: (s.wait_duration_seconds as number | null) ?? null,
            enrolled: enrollByStep.get(stepNum) ?? 0,
          }
        })}
      />
    </PageContainer>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line-subtle bg-surface p-3">
      <div className="text-xs uppercase tracking-wide text-ink-tertiary">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-ink-primary">{value}</div>
    </div>
  )
}
