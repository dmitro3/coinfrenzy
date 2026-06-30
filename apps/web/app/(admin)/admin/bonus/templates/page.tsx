import { redirect } from 'next/navigation'
import { desc } from 'drizzle-orm'

import { canManageBonuses } from '@coinfrenzy/core/auth'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

import { requireAdminSession } from '@/lib/admin-session'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'

import { TemplatesPanel, type TemplateRow } from './templates-panel'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const session = await requireAdminSession('/admin/bonus/templates')
  if (!canManageBonuses(session.payload.role)) {
    redirect('/admin')
  }

  const db = getDb()
  const rows = await db
    .select({
      id: schema.bonuses.id,
      slug: schema.bonuses.slug,
      displayName: schema.bonuses.displayName,
      bonusType: schema.bonuses.bonusType,
      awardGc: schema.bonuses.awardGc,
      awardSc: schema.bonuses.awardSc,
      playthroughMultiplier: schema.bonuses.playthroughMultiplier,
      playthroughWindowHours: schema.bonuses.playthroughWindowHours,
      minBetForContribution: schema.bonuses.minBetForContribution,
      maxBetDuringPlaythrough: schema.bonuses.maxBetDuringPlaythrough,
      maxPerPlayer: schema.bonuses.maxPerPlayer,
      cooldownHours: schema.bonuses.cooldownHours,
      stackable: schema.bonuses.stackable,
      status: schema.bonuses.status,
      awardedCountLifetime: schema.bonuses.awardedCountLifetime,
      updatedAt: schema.bonuses.updatedAt,
    })
    .from(schema.bonuses)
    .orderBy(desc(schema.bonuses.updatedAt))

  const templates: TemplateRow[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    displayName: r.displayName,
    bonusType: r.bonusType,
    awardGc: r.awardGc.toString(),
    awardSc: r.awardSc.toString(),
    playthroughMultiplier: r.playthroughMultiplier,
    playthroughWindowHours: r.playthroughWindowHours,
    minBetForContribution: r.minBetForContribution ? r.minBetForContribution.toString() : null,
    maxBetDuringPlaythrough: r.maxBetDuringPlaythrough
      ? r.maxBetDuringPlaythrough.toString()
      : null,
    maxPerPlayer: r.maxPerPlayer,
    cooldownHours: r.cooldownHours,
    stackable: r.stackable,
    status: r.status,
    awardedCountLifetime: r.awardedCountLifetime,
    updatedAt: r.updatedAt.toISOString(),
  }))

  const active = templates.filter((t) => t.status === 'active')
  const totalLifetimeAwards = templates.reduce((s, t) => s + t.awardedCountLifetime, 0)
  const avgPlaythrough =
    templates.length > 0
      ? templates.reduce((s, t) => s + Number(t.playthroughMultiplier), 0) / templates.length
      : 0
  const mostUsed = templates
    .slice()
    .sort((a, b) => b.awardedCountLifetime - a.awardedCountLifetime)[0]
  const draftCount = templates.filter((t) => t.status === 'draft').length

  return (
    <ListPageShell
      title="Bonus templates"
      subtitle="Purchase boosts, player gifts, and promo codes"
      description="Three flavors: percent boosts on purchases, targeted player gifts (VIP / loss-back / win-back), and promo codes (free or signup-only)."
      breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Bonus' }, { label: 'Templates' }]}
      insights={[
        { label: 'Total templates', value: templates.length.toLocaleString(), tone: 'neutral' },
        {
          label: 'Active',
          value: active.length.toLocaleString(),
          delta:
            templates.length > 0
              ? `${Math.round((active.length / templates.length) * 100)}%`
              : undefined,
          tone: 'positive',
        },
        {
          label: 'Avg playthrough',
          value: avgPlaythrough > 0 ? `${avgPlaythrough.toFixed(1)}×` : '—',
          tone: 'neutral',
        },
        {
          label: 'Most used',
          value: mostUsed ? mostUsed.displayName : '—',
          delta: mostUsed ? `${mostUsed.awardedCountLifetime.toLocaleString()} awards` : undefined,
          tone: 'positive',
        },
        {
          label: 'Lifetime awards',
          value: totalLifetimeAwards.toLocaleString(),
          delta: draftCount > 0 ? `${draftCount} draft` : undefined,
          tone: 'neutral',
        },
      ]}
    >
      <TemplatesPanel templates={templates} />
    </ListPageShell>
  )
}
