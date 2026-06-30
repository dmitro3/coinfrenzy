import 'server-only'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { eq, sql } from 'drizzle-orm'

import { system as systemMod } from '@coinfrenzy/core'
import { getDb, schema } from '@coinfrenzy/db'
import { PageHeader } from '@coinfrenzy/ui/admin/layout/PageHeader'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'

import { buildAdminRscContext } from '@/lib/admin-rsc-context'
import { requireAdminSession } from '@/lib/admin-session'
import { formatCoins } from '@/lib/format'

import { TierForm, type TierFormValues } from '../_form'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

function moneyToMajor(value: bigint): number {
  return Number(value) / 10_000
}

export default async function Page({ params }: Props) {
  await requireAdminSession('/admin/tiers')
  const { id } = await params

  const db = getDb()
  const row = await db.select().from(schema.tiers).where(eq(schema.tiers.id, id)).limit(1)
  if (!row[0]) notFound()
  const t = row[0]

  // Show how many players are currently in this tier — context for any
  // edit decision (don't quietly nuke 1,800 Rookies).
  const countRow = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.tierProgress)
    .where(eq(schema.tierProgress.currentTierId, id))
  const playerCount = countRow[0]?.n ?? 0

  const capsRaw = await systemMod.getTierCaps(buildAdminRscContext())
  const caps = {
    weeklyScMax: Number(capsRaw.weeklyScMax / 10_000n),
    monthlyScMax: Number(capsRaw.monthlyScMax / 10_000n),
    loginMultMax: capsRaw.loginMultMax,
    cashbackPctMax: capsRaw.cashbackPctMax,
  }

  const initial: TierFormValues = {
    slug: t.slug,
    displayName: t.displayName,
    level: t.level,
    xpRequired: moneyToMajor(t.xpRequired),
    weeklyScBonus: moneyToMajor(t.weeklyScBonus),
    monthlyScBonus: moneyToMajor(t.monthlyScBonus),
    dailyLoginBonusMult: t.dailyLoginBonusMult,
    cashbackPctPercent: Number(t.cashbackPct ?? 0) * 100,
    iconUrl: t.iconUrl ?? '',
    badgeColor: t.badgeColor ?? '',
    description: t.description ?? '',
    status: t.status as 'active' | 'inactive',
  }

  const weeklyPayoutLabel = formatCoins((t.weeklyScBonus * BigInt(playerCount)).toString())
  const monthlyPayoutLabel = formatCoins((t.monthlyScBonus * BigInt(playerCount)).toString())

  return (
    <div className="space-y-6 px-8 py-8">
      <PageHeader
        title={`Edit · ${t.displayName}`}
        description={`Level ${t.level} · slug ${t.slug} · ${playerCount.toLocaleString()} players`}
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'Tiers', href: '/admin/tiers' },
          { label: t.displayName },
        ]}
        renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      />

      {playerCount > 0 ? (
        <Card>
          <CardContent className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-ink-tertiary">
                Players in this tier
              </div>
              <div className="text-2xl font-semibold text-ink-primary">
                {playerCount.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-ink-tertiary">
                Weekly cost if all claim
              </div>
              <div className="text-2xl font-semibold text-amber-200">{weeklyPayoutLabel} SC</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-ink-tertiary">
                Monthly cost if all claim
              </div>
              <div className="text-2xl font-semibold text-amber-200">{monthlyPayoutLabel} SC</div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <TierForm mode="edit" tierId={t.id} initial={initial} caps={caps} />
    </div>
  )
}
