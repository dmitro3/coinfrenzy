import 'server-only'

import Link from 'next/link'
import { ExternalLink, FileText } from 'lucide-react'

import { cms as cmsMod, noopLogger } from '@coinfrenzy/core'
import { canEditContent } from '@coinfrenzy/core/auth'
import { getDb } from '@coinfrenzy/db/client'
import { EmptyState } from '@coinfrenzy/ui/admin'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'
import { Button } from '@coinfrenzy/ui/primitives/button'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'

import { requireAdminSession } from '@/lib/admin-session'

import { PagesPanel } from './_panel'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{
    search?: string
    status?: 'active' | 'draft' | 'archived' | 'all'
    category?: string
  }>
}

export default async function Page({ searchParams }: PageProps) {
  const session = await requireAdminSession('/admin/cms')
  const role = session.payload.role
  const sp = await searchParams

  const filters = {
    search: sp.search?.trim() || undefined,
    status: (sp.status as 'active' | 'draft' | 'archived' | 'all' | undefined) ?? 'all',
    category: sp.category && sp.category !== 'all' ? sp.category : ('all' as const),
  }

  // Build the minimal ctx for the listing reads (we don't need a real
  // logger/inngest/audit queue on a read path).
  const db = getDb()
  const ctx = {
    db,
    logger: noopLogger,
    actor: { kind: 'admin' as const, adminId: session.admin.id, role, ip: '' },
    reqId: 'cms-pages-list',
    afterCommit: () => {},
  }

  const [pages, categories] = await Promise.all([
    cmsMod.listPages(ctx as never, filters),
    cmsMod.listCategories(ctx as never),
  ])

  const live = pages.filter((p) => p.status === 'active').length
  const drafts = pages.filter((p) => p.status === 'draft').length
  const archived = pages.filter((p) => p.status === 'archived').length

  const canEdit = canEditContent(role)

  return (
    <ListPageShell
      title="Dynamic CMS"
      subtitle={`${pages.length.toLocaleString()} page${pages.length === 1 ? '' : 's'}`}
      description="Static content pages — Terms, Privacy, Sweepstakes Rules, Bonus Terms, jackpot details, anything that lives in the site footer. Edit here and changes go live instantly at /p/[slug]."
      breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'CMS' }]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      actions={
        canEdit ? (
          <Button asChild>
            <Link href="/admin/cms/new">+ New page</Link>
          </Button>
        ) : (
          <Button disabled>+ New page</Button>
        )
      }
      insights={[
        { label: 'Live', value: live.toLocaleString(), tone: 'positive' },
        {
          label: 'Drafts',
          value: drafts.toLocaleString(),
          tone: drafts > 0 ? 'notice' : 'neutral',
        },
        {
          label: 'Archived',
          value: archived.toLocaleString(),
          tone: 'neutral',
        },
        { label: 'Total', value: pages.length.toLocaleString(), tone: 'neutral' },
      ]}
    >
      {/* Filter bar — server form, no client JS. */}
      <Card>
        <CardContent className="p-3">
          <form className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1 space-y-1">
              <label className="text-xs font-medium text-ink-secondary" htmlFor="cms-search">
                Search
              </label>
              <input
                id="cms-search"
                name="search"
                defaultValue={filters.search ?? ''}
                placeholder="Search title or slug…"
                className="h-9 w-full rounded-md border border-line-default bg-surface px-3 text-sm text-ink-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-ink-secondary" htmlFor="cms-status">
                Status
              </label>
              <select
                id="cms-status"
                name="status"
                defaultValue={filters.status}
                className="h-9 rounded-md border border-line-default bg-surface px-3 text-sm text-ink-primary"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-ink-secondary" htmlFor="cms-category">
                Category
              </label>
              <select
                id="cms-category"
                name="category"
                defaultValue={filters.category}
                className="h-9 rounded-md border border-line-default bg-surface px-3 text-sm text-ink-primary"
              >
                <option value="all">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm">
                Apply
              </Button>
              {filters.search || filters.status !== 'all' || filters.category !== 'all' ? (
                <Button asChild size="sm" variant="ghost">
                  <Link href="/admin/cms">Clear</Link>
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      {pages.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={<FileText />}
              title="No pages match these filters"
              description="Adjust the filters above or create a new page."
              action={
                canEdit ? (
                  <Button asChild>
                    <Link href="/admin/cms/new">Create page</Link>
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <PagesPanel
          rows={pages.map((p) => ({
            id: p.id,
            slug: p.slug,
            title: p.title,
            category: p.category,
            status: p.status,
            audience: p.audience,
            bodyExcerpt: p.bodyExcerpt,
            version: p.version,
            updatedAtLabel: relativeTime(p.updatedAt),
          }))}
          canEdit={canEdit}
        />
      )}

      <Card>
        <CardContent className="flex items-center justify-between gap-3 p-4 text-xs text-ink-tertiary">
          <div className="flex items-center gap-2">
            <ExternalLink className="h-3.5 w-3.5" />
            Public pages render at <span className="font-mono text-ink-secondary">
              /p/[slug]
            </span>{' '}
            with the same chrome the legal pages use today.
          </div>
          <div className="font-mono">Banners live in Banner Management →</div>
        </CardContent>
      </Card>
    </ListPageShell>
  )
}

function relativeTime(d: Date): string {
  const ms = Date.now() - d.getTime()
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 14) return `${days}d ago`
  return d.toISOString().slice(0, 10)
}
