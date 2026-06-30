import { redirect } from 'next/navigation'
import Link from 'next/link'
import { asc, count, eq, sql } from 'drizzle-orm'

import { canManageBonuses } from '@coinfrenzy/core/auth'
import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'

import { requireAdminSession } from '@/lib/admin-session'
import { formatCoins } from '@/lib/format'

import { ManualAwardForm, type Template } from './manual-award-form'

export const dynamic = 'force-dynamic'

// Mirror the same purpose mapping the templates panel uses so the cards
// here group cleanly by intent (purchase / gift / signup / free code).
const BONUS_TYPE_TO_CATEGORY: Record<string, Template['category']> = {
  package: 'purchase',
  purchase_promocode: 'purchase',
  welcome: 'promo_code_signup',
  crm_promocode: 'promo_code_free',
  promotion: 'player_gift',
  admin_added_sc: 'player_gift',
  affiliate: 'player_gift',
  referral: 'player_gift',
  amoe: 'player_gift',
  daily: 'player_gift',
  tier_up: 'player_gift',
  weekly_tier: 'player_gift',
  monthly_tier: 'player_gift',
  jackpot: 'player_gift',
}

export default async function Page() {
  const session = await requireAdminSession('/admin/bonus/manual-award')
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
      awardSc: schema.bonuses.awardSc,
      awardGc: schema.bonuses.awardGc,
      playthroughMultiplier: schema.bonuses.playthroughMultiplier,
    })
    .from(schema.bonuses)
    .where(eq(schema.bonuses.status, 'active'))
    .orderBy(asc(schema.bonuses.displayName))

  const templates: Template[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    displayName: r.displayName,
    bonusType: r.bonusType,
    awardSc: r.awardSc.toString(),
    awardGc: r.awardGc.toString(),
    playthroughMultiplier: r.playthroughMultiplier,
    category: BONUS_TYPE_TO_CATEGORY[r.bonusType] ?? 'player_gift',
  }))

  const [manualToday] = await db
    .select({ n: count() })
    .from(schema.bonusesAwarded)
    .where(
      sql`${schema.bonusesAwarded.awardReason} = 'manual' and ${schema.bonusesAwarded.createdAt} > now() - interval '24 hours'`,
    )
  const [manual7d] = await db
    .select({ n: count() })
    .from(schema.bonusesAwarded)
    .where(
      sql`${schema.bonusesAwarded.awardReason} = 'manual' and ${schema.bonusesAwarded.createdAt} > now() - interval '7 days'`,
    )
  const [scAwarded7d] = await db
    .select({
      sc: sql<string>`coalesce(sum(${schema.bonusesAwarded.scAmount}), 0)::text`,
    })
    .from(schema.bonusesAwarded)
    .where(
      sql`${schema.bonusesAwarded.awardReason} = 'manual' and ${schema.bonusesAwarded.createdAt} > now() - interval '7 days'`,
    )

  return (
    <ListPageShell
      title="Manual bonus award"
      subtitle="Send a bonus to one player at a time"
      description="Find the player, pick a bonus, ship it. Each award is audit-logged and idempotent on the (admin, player, template, timestamp) tuple."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'Bonus' },
        { label: 'Manual award' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      insights={[
        { label: 'Active templates', value: templates.length.toLocaleString(), tone: 'positive' },
        { label: 'Manual awards (24h)', value: manualToday.n.toLocaleString(), tone: 'neutral' },
        { label: 'Manual awards (7d)', value: manual7d.n.toLocaleString(), tone: 'neutral' },
        {
          label: 'SC awarded (7d)',
          value: `${formatCoins(scAwarded7d.sc)} SC`,
          tone: 'neutral',
        },
      ]}
    >
      <ManualAwardForm templates={templates} />
    </ListPageShell>
  )
}
