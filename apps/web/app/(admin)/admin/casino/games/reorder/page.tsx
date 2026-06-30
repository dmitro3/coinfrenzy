import Link from 'next/link'

import { casino } from '@coinfrenzy/core'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'

import { requireAdminSession } from '@/lib/admin-session'
import { buildAdminRscContext } from '@/lib/admin-rsc-context'

import { GamesReorderClient } from './reorder-client'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function GamesReorderPage({ searchParams }: PageProps) {
  await requireAdminSession('/admin/casino/games/reorder')
  const sp = await searchParams
  const subCategoryParam = typeof sp.subCategory === 'string' ? sp.subCategory : null

  const ctx = buildAdminRscContext()
  const sections = await casino.listSubCategories(ctx)
  const activeSectionId =
    subCategoryParam &&
    sections.find((s) => s.slug === subCategoryParam || s.id === subCategoryParam)
      ? sections.find((s) => s.slug === subCategoryParam || s.id === subCategoryParam)!.id
      : (sections[0]?.id ?? null)

  const games = activeSectionId ? await casino.listGamesInSection(ctx, activeSectionId) : []

  return (
    <ListPageShell
      title="Reorder games"
      subtitle="Drag to reorder. Save when done."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'Casino' },
        { label: 'Games', href: '/admin/casino/games' },
        { label: 'Reorder' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
    >
      <GamesReorderClient
        sections={sections.map((s) => ({
          id: s.id,
          slug: s.slug,
          displayName: s.displayName,
          gameCount: s.gameCount,
        }))}
        activeSectionId={activeSectionId}
        games={games.map((g) => ({
          id: g.gameId,
          slug: g.slug,
          displayName: g.displayName,
          providerName: g.providerName,
          status: g.status,
          customerFacing: g.customerFacing,
          rtp: g.rtp,
        }))}
      />
    </ListPageShell>
  )
}
