import Link from 'next/link'
import { Mail } from 'lucide-react'

import { EmptyState } from '@coinfrenzy/ui/admin'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'
import { Button } from '@coinfrenzy/ui/primitives/button'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'

import { listEmailTemplatesForAdmin } from '../_data'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const CATEGORY_OPTIONS = [
  'all',
  'welcome',
  'lifecycle',
  'promotional',
  'transactional',
  'compliance',
  'vip',
  'recovery',
  'custom',
]

interface PageProps {
  searchParams: Promise<{ search?: string; category?: string }>
}

export default async function Page({ searchParams }: PageProps) {
  const sp = await searchParams
  const filters = {
    search: sp.search?.trim() || undefined,
    category: sp.category,
  }
  const templates = await listEmailTemplatesForAdmin(filters)
  const categories = new Set(templates.map((t) => t.category ?? 'uncategorized')).size
  const totalVersions = templates.reduce((s, t) => s + t.version, 0)
  const recentlyUpdated = templates.filter(
    (t) => Date.now() - new Date(t.updatedAt).getTime() < 7 * 86_400_000,
  ).length
  const hasFilters = !!(filters.search || (filters.category && filters.category !== 'all'))

  return (
    <ListPageShell
      title="Email templates"
      subtitle={`${templates.length.toLocaleString()} loaded`}
      description="Versioned templates used by campaigns and flows."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'CRM', href: '/admin/crm' },
        { label: 'Email templates' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      actions={
        <Button asChild>
          <Link href="/admin/crm/email-templates/new">+ New template</Link>
        </Button>
      }
      insights={[
        { label: 'Total templates', value: templates.length.toLocaleString(), tone: 'neutral' },
        { label: 'Categories', value: categories.toLocaleString(), tone: 'neutral' },
        { label: 'Total versions', value: totalVersions.toLocaleString(), tone: 'neutral' },
        {
          label: 'Updated (7d)',
          value: recentlyUpdated.toLocaleString(),
          tone: recentlyUpdated > 0 ? 'positive' : 'neutral',
        },
      ]}
    >
      <form
        method="get"
        className="mb-3 flex flex-wrap items-end gap-2 rounded-md border border-line-subtle bg-surface p-3"
      >
        <label className="space-y-1 text-xs">
          <div className="text-ink-tertiary">Search</div>
          <input
            name="search"
            defaultValue={filters.search ?? ''}
            placeholder="slug / name / subject…"
            className="h-9 w-[240px] rounded-md border border-line-subtle bg-bg px-2 text-sm text-ink-primary"
          />
        </label>
        <label className="space-y-1 text-xs">
          <div className="text-ink-tertiary">Category</div>
          <select
            name="category"
            defaultValue={filters.category ?? 'all'}
            className="h-9 rounded-md border border-line-subtle bg-bg px-2 text-sm text-ink-primary"
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent/90"
        >
          Filter
        </button>
        {hasFilters ? (
          <Link
            href="/admin/crm/email-templates"
            className="h-9 rounded-md border border-line-subtle px-4 py-1.5 text-sm text-ink-secondary hover:bg-surface-hover"
          >
            Reset
          </Link>
        ) : null}
      </form>

      <Card>
        <CardContent className="p-0">
          {templates.length === 0 ? (
            <EmptyState
              icon={<Mail />}
              title={hasFilters ? 'No templates match these filters' : 'No email templates yet'}
              description={
                hasFilters
                  ? 'Try resetting the filters above.'
                  : 'Create one to use in campaigns and flow steps.'
              }
              action={
                hasFilters ? undefined : (
                  <Button asChild>
                    <Link href="/admin/crm/email-templates/new">Create template</Link>
                  </Button>
                )
              }
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line-subtle text-left text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Slug</th>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2 text-right">Version</th>
                  <th className="px-4 py-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-line-subtle text-sm last:border-b-0 hover:bg-surface-hover"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/crm/email-templates/${t.id}`}
                        className="font-medium text-ink-primary hover:underline"
                      >
                        {t.displayName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-secondary">{t.slug}</td>
                    <td className="px-4 py-3 text-xs uppercase tracking-wide text-ink-tertiary">
                      {t.category ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-secondary">
                      v{t.version}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-tertiary">
                      {new Date(t.updatedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </ListPageShell>
  )
}
