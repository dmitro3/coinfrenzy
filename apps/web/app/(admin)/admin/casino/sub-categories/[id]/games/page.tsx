import Link from 'next/link'
import { notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'

import { casino } from '@coinfrenzy/core'
import { schema } from '@coinfrenzy/db'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'

import { requireAdminSession } from '@/lib/admin-session'
import { buildAdminRscContext } from '@/lib/admin-rsc-context'

import { SectionGamesClient } from './section-games-client'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function SectionGamesPage({ params }: PageProps) {
  await requireAdminSession('/admin/casino/sub-categories')
  const { id } = await params
  const ctx = buildAdminRscContext()

  const [section] = await ctx.db
    .select()
    .from(schema.casinoSubCategories)
    .where(eq(schema.casinoSubCategories.id, id))
    .limit(1)
  if (!section) notFound()

  const [inSection, allGames, providers] = await Promise.all([
    casino.listGamesInSection(ctx, id),
    ctx.db
      .select({
        id: schema.games.id,
        slug: schema.games.slug,
        displayName: schema.games.displayName,
        providerId: schema.games.providerId,
        providerName: schema.gameProviders.displayName,
        providerSlug: schema.gameProviders.slug,
        status: schema.games.status,
        customerFacing: schema.games.customerFacing,
        rtp: schema.games.rtp,
      })
      .from(schema.games)
      .leftJoin(schema.gameProviders, eq(schema.gameProviders.id, schema.games.providerId))
      .orderBy(schema.games.displayName)
      .limit(2000),
    ctx.db
      .select({
        id: schema.gameProviders.id,
        slug: schema.gameProviders.slug,
        displayName: schema.gameProviders.displayName,
      })
      .from(schema.gameProviders)
      .orderBy(schema.gameProviders.displayName),
  ])

  const inSectionIds = new Set(inSection.map((g) => g.gameId))

  return (
    <ListPageShell
      title={section.displayName}
      subtitle={`${inSection.length} games in this section`}
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'Casino' },
        { label: 'Sub Categories', href: '/admin/casino/sub-categories' },
        { label: section.displayName },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
    >
      <SectionGamesClient
        sectionId={section.id}
        sectionName={section.displayName}
        addedGames={inSection.map((g) => ({
          id: g.gameId,
          slug: g.slug,
          displayName: g.displayName,
          providerName: g.providerName,
          providerSlug: g.providerSlug,
          status: g.status,
          customerFacing: g.customerFacing,
          rtp: g.rtp,
        }))}
        availableGames={allGames
          .filter((g) => !inSectionIds.has(g.id))
          .map((g) => ({
            id: g.id,
            slug: g.slug,
            displayName: g.displayName,
            providerId: g.providerId,
            providerName: g.providerName ?? '—',
            providerSlug: g.providerSlug ?? '',
            status: g.status,
            customerFacing: g.customerFacing,
            rtp: g.rtp,
          }))}
        providers={providers.map((p) => ({ id: p.id, slug: p.slug, displayName: p.displayName }))}
      />
    </ListPageShell>
  )
}
