import 'server-only'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, eq, isNull } from 'drizzle-orm'

import { getDb, schema } from '@coinfrenzy/db'
import { PageHeader } from '@coinfrenzy/ui/admin/layout/PageHeader'

import { requireAdminSession } from '@/lib/admin-session'

import { PackageForm, type PackageFormValues } from '../_form'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

// `money` columns are bigint with 10_000 minor units per major. Going
// the other way for the form (which works in dollars / whole coins) is
// just integer division because we always store integers.
function moneyToMajor(value: bigint): number {
  // Try not to drop fractional dollars (SC can fractionate).
  const major = Number(value) / 10_000
  return Number.isFinite(major) ? major : 0
}

function toLocalDatetimeInput(d: Date | null): string {
  if (!d) return ''
  // <input type="datetime-local"> wants YYYY-MM-DDTHH:MM (no seconds / TZ).
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default async function Page({ params }: Props) {
  await requireAdminSession('/admin/packages')
  const { id } = await params

  const db = getDb()
  const row = await db
    .select()
    .from(schema.packages)
    .where(and(eq(schema.packages.id, id), isNull(schema.packages.deletedAt)))
    .limit(1)
  if (!row[0]) notFound()
  const p = row[0]

  const initial: PackageFormValues = {
    slug: p.slug,
    displayName: p.displayName,
    priceUsd: moneyToMajor(p.priceUsd),
    baseGc: moneyToMajor(p.baseGc),
    baseSc: moneyToMajor(p.baseSc),
    bonusGc: moneyToMajor(p.bonusGc),
    bonusSc: moneyToMajor(p.bonusSc),
    playthroughMultiplier: p.playthroughMultiplier,
    bonusScPlaythroughMultiplier: p.bonusScPlaythroughMultiplier,
    bonusGcPlaythroughMultiplier: p.bonusGcPlaythroughMultiplier,
    promotionalLabel: p.promotionalLabel ?? '',
    badgeColor: p.badgeColor ?? '',
    displayImageUrl: p.displayImageUrl ?? '',
    description: p.description ?? '',
    sortOrder: p.sortOrder,
    featuredSlot: (p.featuredSlot as 1 | 2 | null) ?? null,
    bannerHeadline: p.bannerHeadline ?? '',
    bannerSubhead: p.bannerSubhead ?? '',
    bannerImageUrl: p.bannerImageUrl ?? '',
    status: p.status as 'active' | 'inactive' | 'archived',
    validFrom: toLocalDatetimeInput(p.validFrom),
    validUntil: toLocalDatetimeInput(p.validUntil),
    firstPurchaseOnly: p.firstPurchaseOnly,
    maxPerPlayer: p.maxPerPlayer ?? '',
  }

  return (
    <div className="space-y-6 px-8 py-8">
      <PageHeader
        title={`Edit · ${p.displayName}`}
        description={`Slug: ${p.slug} · created ${p.createdAt.toISOString().slice(0, 10)}`}
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'Packages', href: '/admin/packages' },
          { label: p.displayName },
        ]}
        renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      />
      <PackageForm mode="edit" packageId={p.id} initial={initial} />
    </div>
  )
}
