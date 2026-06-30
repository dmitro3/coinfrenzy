import Link from 'next/link'

import { casino } from '@coinfrenzy/core'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'

import { requireAdminSession } from '@/lib/admin-session'
import { buildAdminRscContext } from '@/lib/admin-rsc-context'

import { LobbyEditorClient, type LobbyEditorAvailableGame } from './lobby-editor-client'

export const dynamic = 'force-dynamic'

export default async function LobbyPage() {
  await requireAdminSession('/admin/casino/lobby')
  const ctx = buildAdminRscContext()

  const [layout, allGames] = await Promise.all([
    casino.getLobbyLayout(ctx, { adminView: true }),
    casino.getGameStats(ctx, '30d'),
  ])

  const inLobbyCount = layout.sections.filter((s) => s.inLobby).length
  const totalGames = layout.sections.reduce((acc, s) => acc + s.games.length, 0)
  const featuredCount = layout.sections.reduce(
    (acc, s) => acc + s.games.filter((g) => g.isFeatured).length,
    0,
  )

  const availableGames: LobbyEditorAvailableGame[] = allGames.map((g) => ({
    id: g.id,
    slug: g.slug,
    displayName: g.displayName,
    providerName: g.providerName,
    providerSlug: g.providerSlug,
    status: g.status,
    customerFacing: g.customerFacing,
    isFeatured: g.isFeatured,
    isNew: g.isNew,
  }))

  return (
    <ListPageShell
      title="Game Lobby"
      subtitle="Drag to rearrange. Save when ready. This is what players see."
      breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Casino' }, { label: 'Lobby' }]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      insights={[
        { label: 'Sections in lobby', value: inLobbyCount.toLocaleString(), tone: 'positive' },
        {
          label: 'Total sections',
          value: layout.sections.length.toLocaleString(),
          tone: 'neutral',
        },
        { label: 'Games placed', value: totalGames.toLocaleString(), tone: 'neutral' },
        { label: 'Featured', value: featuredCount.toLocaleString(), tone: 'notice' },
      ]}
    >
      <LobbyEditorClient
        initialSections={layout.sections.map((s) => ({
          id: s.id,
          slug: s.slug,
          displayName: s.displayName,
          inLobby: s.inLobby,
          status: s.status,
          games: s.games.map((g) => ({
            id: g.id,
            slug: g.slug,
            displayName: g.displayName,
            providerName: g.providerName,
            providerSlug: g.providerSlug,
            thumbnailUrl: g.thumbnailUrl,
            isNew: g.isNew,
            isFeatured: g.isFeatured,
            status: g.status,
            customerFacing: g.customerFacing,
          })),
        }))}
        availableGames={availableGames}
      />
    </ListPageShell>
  )
}
