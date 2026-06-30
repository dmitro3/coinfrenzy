import Link from 'next/link'
import { MessageSquare } from 'lucide-react'

import { EmptyState } from '@coinfrenzy/ui/admin'
import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'
import { Button } from '@coinfrenzy/ui/primitives/button'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'

import { listSmsTemplatesForAdmin } from '../_data'

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
  const templates = await listSmsTemplatesForAdmin(filters)
  const overLimit = templates.filter((t) => t.bodyLength > 160).length
  const avgLength =
    templates.length > 0
      ? Math.round(templates.reduce((s, t) => s + t.bodyLength, 0) / templates.length)
      : 0
  const hasFilters = !!(filters.search || (filters.category && filters.category !== 'all'))

  return (
    <ListPageShell
      title="SMS templates"
      subtitle={`${templates.length.toLocaleString()} loaded`}
      description="Plaintext, 160-character indicator. Auto-appended STOP/HELP per TCPA."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'CRM', href: '/admin/crm' },
        { label: 'SMS templates' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      actions={
        <Button asChild>
          <Link href="/admin/crm/sms-templates/new">+ New template</Link>
        </Button>
      }
      insights={[
        { label: 'Total templates', value: templates.length.toLocaleString(), tone: 'neutral' },
        {
          label: 'Avg length',
          value: `${avgLength} chars`,
          tone: avgLength > 160 ? 'attention' : 'neutral',
        },
        {
          label: 'Over 160 chars',
          value: overLimit.toLocaleString(),
          delta: overLimit > 0 ? 'multi-segment' : undefined,
          tone: overLimit > 0 ? 'attention' : 'positive',
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
            placeholder="slug / name / body…"
            className="h-9 w-[240px] rounded-md border border-line-subtle bg-surface px-2 text-sm text-ink-primary"
          />
        </label>
        <label className="space-y-1 text-xs">
          <div className="text-ink-tertiary">Category</div>
          <select
            name="category"
            defaultValue={filters.category ?? 'all'}
            className="h-9 rounded-md border border-line-subtle bg-surface px-2 text-sm text-ink-primary"
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        {hasFilters ? (
          <Link
            href="/admin/crm/sms-templates"
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
              icon={<MessageSquare />}
              title={hasFilters ? 'No templates match these filters' : 'No SMS templates yet'}
              description={
                hasFilters
                  ? 'Try resetting the filters above.'
                  : 'Create one to use in SMS campaigns.'
              }
              action={
                hasFilters ? undefined : (
                  <Button asChild>
                    <Link href="/admin/crm/sms-templates/new">Create template</Link>
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
                  <th className="px-4 py-2 text-right">Length</th>
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
                        href={`/admin/crm/sms-templates/${t.id}`}
                        className="font-medium text-ink-primary hover:underline"
                      >
                        {t.displayName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-secondary">{t.slug}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span
                        className={t.bodyLength > 160 ? 'text-attention' : 'text-ink-secondary'}
                      >
                        {t.bodyLength}
                      </span>
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
