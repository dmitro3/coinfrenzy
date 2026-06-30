import 'server-only'

import Link from 'next/link'
import { ImageIcon } from 'lucide-react'
import { desc } from 'drizzle-orm'

import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'
import { EmptyState, StatusPill } from '@coinfrenzy/ui/admin'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'
import { Button } from '@coinfrenzy/ui/primitives/button'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'

import { requireAdminSession } from '@/lib/admin-session'

export const dynamic = 'force-dynamic'

interface BannerRow {
  id: string
  slug: string
  title: string | null
  ctaLabel: string | null
  ctaUrl: string | null
  imageUrl: string | null
  pages: string[] | null
  startsAt: Date | null
  endsAt: Date | null
  sortOrder: number
  status: string
}

function classify(b: BannerRow): {
  label: string
  tone: 'positive' | 'notice' | 'critical' | 'neutral'
} {
  if (b.status !== 'active') return { label: 'Inactive', tone: 'neutral' }
  const now = Date.now()
  if (b.startsAt && b.startsAt.getTime() > now) return { label: 'Scheduled', tone: 'notice' }
  if (b.endsAt && b.endsAt.getTime() < now) return { label: 'Expired', tone: 'critical' }
  return { label: 'Live', tone: 'positive' }
}

export default async function Page() {
  await requireAdminSession('/admin/banners')
  const db = getDb()

  const rows = (await db
    .select({
      id: schema.banners.id,
      slug: schema.banners.slug,
      title: schema.banners.title,
      ctaLabel: schema.banners.ctaLabel,
      ctaUrl: schema.banners.ctaUrl,
      imageUrl: schema.banners.imageUrl,
      pages: schema.banners.pages,
      startsAt: schema.banners.startsAt,
      endsAt: schema.banners.endsAt,
      sortOrder: schema.banners.sortOrder,
      status: schema.banners.status,
    })
    .from(schema.banners)
    .orderBy(desc(schema.banners.updatedAt))
    .limit(200)) as BannerRow[]

  // Synthesise CTR from seed metadata if available; otherwise placeholder zeros
  const live = rows.filter((b) => classify(b).label === 'Live').length
  const scheduled = rows.filter((b) => classify(b).label === 'Scheduled').length
  const expired = rows.filter((b) => classify(b).label === 'Expired').length

  return (
    <ListPageShell
      title="Banners"
      subtitle={`${rows.length.toLocaleString()} loaded`}
      description="Promotional banners shown across the player site."
      breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Banners' }]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      actions={<Button disabled>+ New banner</Button>}
      insights={[
        { label: 'Live', value: live.toLocaleString(), tone: 'positive' },
        {
          label: 'Scheduled',
          value: scheduled.toLocaleString(),
          tone: scheduled > 0 ? 'notice' : 'neutral',
        },
        {
          label: 'Expired',
          value: expired.toLocaleString(),
          tone: expired > 0 ? 'attention' : 'neutral',
        },
        { label: 'Total', value: rows.length.toLocaleString(), tone: 'neutral' },
      ]}
    >
      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              icon={<ImageIcon />}
              title="No banners yet"
              description="Create a banner to promote a feature, sale, or event."
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line-subtle text-left text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                  <th className="px-4 py-2">Banner</th>
                  <th className="px-4 py-2">Pages</th>
                  <th className="px-4 py-2">CTA</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Schedule</th>
                  <th className="px-4 py-2 text-right">Order</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const c = classify(r)
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-line-subtle text-sm last:border-b-0 hover:bg-surface-hover"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-16 rounded bg-elevated" />
                          <div className="min-w-0">
                            <div className="truncate text-ink-primary">{r.title ?? r.slug}</div>
                            <div className="truncate font-mono text-xs text-ink-tertiary">
                              {r.slug}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-secondary">
                        {(r.pages ?? []).join(', ') || (
                          <span className="text-ink-tertiary">all</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-secondary">
                        {r.ctaLabel ?? <span className="text-ink-tertiary">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status="custom" color={c.tone} label={c.label} />
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-tertiary">
                        {r.startsAt ? r.startsAt.toLocaleDateString() : 'always'}
                        {' → '}
                        {r.endsAt ? r.endsAt.toLocaleDateString() : 'forever'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink-tertiary">
                        {r.sortOrder}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </ListPageShell>
  )
}
