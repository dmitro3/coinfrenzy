import Link from 'next/link'
import { sql } from 'drizzle-orm'
import { Mail, MessageSquare } from 'lucide-react'

import { ListPageShell } from '@coinfrenzy/ui/admin/layout/ListPageShell'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'
import { getDb } from '@coinfrenzy/db/client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface LibraryRow {
  id: string
  slug: string
  display_name: string
  category: string | null
  channel: 'email' | 'sms'
  usage_count: number
  updated_at: string
}

const CATEGORY_ORDER = [
  'welcome',
  'lifecycle',
  'promotional',
  'transactional',
  'compliance',
  'vip',
  'recovery',
  'custom',
] as const

export default async function Page() {
  const db = getDb()
  const emailRows = (await db.execute(sql`
    SELECT
      t.id, t.slug, t.display_name, t.category, t.updated_at,
      (SELECT count(*)::int FROM crm_campaigns WHERE template_id = t.id) +
      (SELECT count(*)::int FROM crm_flow_steps WHERE config::text LIKE '%' || t.id::text || '%') AS usage_count
    FROM email_templates t
    WHERE t.is_current = true
    ORDER BY t.category NULLS LAST, t.display_name
  `)) as unknown as Array<Omit<LibraryRow, 'channel'>>

  const smsRows = (await db.execute(sql`
    SELECT
      t.id, t.slug, t.display_name, t.category, t.updated_at,
      (SELECT count(*)::int FROM crm_campaigns WHERE template_id = t.id) +
      (SELECT count(*)::int FROM crm_flow_steps WHERE config::text LIKE '%' || t.id::text || '%') AS usage_count
    FROM sms_templates t
    WHERE t.is_current = true
    ORDER BY t.category NULLS LAST, t.display_name
  `)) as unknown as Array<Omit<LibraryRow, 'channel'>>

  const all: LibraryRow[] = [
    ...emailRows.map((r) => ({ ...r, channel: 'email' as const })),
    ...smsRows.map((r) => ({ ...r, channel: 'sms' as const })),
  ]

  const byCategory = new Map<string, LibraryRow[]>()
  for (const r of all) {
    const cat = (r.category ?? 'custom').toLowerCase()
    const existing = byCategory.get(cat) ?? []
    existing.push(r)
    byCategory.set(cat, existing)
  }

  const orderedCategories = [
    ...CATEGORY_ORDER.filter((c) => byCategory.has(c)),
    ...[...byCategory.keys()].filter((c) => !(CATEGORY_ORDER as readonly string[]).includes(c)),
  ]

  return (
    <ListPageShell
      title="Template library"
      subtitle={`${all.length.toLocaleString()} templates · ${orderedCategories.length} categories`}
      description="Reusable templates organized by category. Clone, preview, and reuse across campaigns and flows."
      breadcrumb={[
        { label: 'Admin', href: '/admin' },
        { label: 'CRM', href: '/admin/crm' },
        { label: 'Library' },
      ]}
      renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
    >
      <div className="space-y-6">
        {orderedCategories.length === 0 ? (
          <Card>
            <CardContent className="px-4 py-12 text-center text-sm text-ink-tertiary">
              No templates yet — create one in Email or SMS templates.
            </CardContent>
          </Card>
        ) : (
          orderedCategories.map((cat) => {
            const list = byCategory.get(cat) ?? []
            return (
              <Card key={cat}>
                <CardContent className="p-0">
                  <div className="flex items-center justify-between border-b border-line-subtle px-4 py-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-primary">
                      {cat}
                    </h3>
                    <span className="text-xs text-ink-tertiary">{list.length}</span>
                  </div>
                  <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map((t) => {
                      const Icon = t.channel === 'email' ? Mail : MessageSquare
                      const href =
                        t.channel === 'email'
                          ? `/admin/crm/email-templates/${t.id}`
                          : `/admin/crm/sms-templates/${t.id}`
                      return (
                        <Link
                          key={t.id}
                          href={href}
                          className="group rounded-lg border border-line-subtle bg-surface p-3 transition hover:border-accent/40 hover:bg-surface-hover"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <Icon className="h-3.5 w-3.5 text-ink-tertiary" />
                                <span className="truncate text-sm font-medium text-ink-primary">
                                  {t.display_name}
                                </span>
                              </div>
                              <div className="mt-1 truncate font-mono text-xs text-ink-tertiary">
                                {t.slug}
                              </div>
                            </div>
                            <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink-tertiary">
                              {t.channel}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-xs text-ink-tertiary">
                            <span>{Number(t.usage_count ?? 0)} uses</span>
                            <span>
                              {new Date(t.updated_at).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </ListPageShell>
  )
}
