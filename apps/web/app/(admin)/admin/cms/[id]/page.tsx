import 'server-only'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, eq, sql } from 'drizzle-orm'

import { getDb, schema } from '@coinfrenzy/db'
import { PageHeader } from '@coinfrenzy/ui/admin/layout/PageHeader'
import { Card, CardContent } from '@coinfrenzy/ui/primitives/card'

import { requireAdminSession } from '@/lib/admin-session'

import { PageForm, type PageFormValues } from '../_form'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export default async function Page({ params }: Props) {
  await requireAdminSession('/admin/cms')
  const { id } = await params

  const db = getDb()
  const row = await db
    .select()
    .from(schema.siteContent)
    .where(
      and(eq(schema.siteContent.id, id), sql`${schema.siteContent.valueJson}->>'kind' = 'page'`),
    )
    .limit(1)
  if (!row[0]) notFound()
  const p = row[0]
  const meta = (p.valueJson ?? {}) as Record<string, unknown>

  const initial: PageFormValues = {
    slug: p.key,
    title: typeof meta.title === 'string' ? meta.title : p.key,
    body: p.value ?? '',
    category: typeof meta.category === 'string' ? meta.category : '',
    status: typeof meta.status === 'string' ? (meta.status as PageFormValues['status']) : 'active',
    audience: p.audience ?? '',
    seoDescription: typeof meta.seoDescription === 'string' ? meta.seoDescription : '',
  }

  return (
    <div className="space-y-6 px-8 py-8">
      <PageHeader
        title={`Edit · ${initial.title}`}
        description={`Slug /p/${p.key} · version ${p.version} · updated ${p.updatedAt.toISOString().slice(0, 10)}`}
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'CMS', href: '/admin/cms' },
          { label: initial.title },
        ]}
        renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      />

      <Card>
        <CardContent className="flex items-center justify-between gap-3 p-4 text-xs text-ink-secondary">
          <div>
            Public URL:{' '}
            <a
              href={`/p/${p.key}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-brand underline-offset-2 hover:underline"
            >
              /p/{p.key}
            </a>
          </div>
          <div className="text-ink-tertiary">
            Status: <span className="text-ink-primary">{initial.status}</span> · audience{' '}
            <span className="text-ink-primary">{p.audience ?? 'public'}</span>
          </div>
        </CardContent>
      </Card>

      <PageForm mode="edit" pageId={p.id} initial={initial} />
    </div>
  )
}
