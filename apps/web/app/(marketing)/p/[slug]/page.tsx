import 'server-only'

import { notFound } from 'next/navigation'
import { and, eq, sql } from 'drizzle-orm'
import type { Metadata } from 'next'

import { getDb, schema } from '@coinfrenzy/db'

import { PublicPageBody } from './_public-renderer'

export const dynamic = 'force-dynamic'
export const revalidate = 60

interface PageProps {
  params: Promise<{ slug: string }>
}

interface PageMeta {
  kind: 'page'
  title: string
  category: string | null
  status: 'active' | 'draft' | 'archived'
  seoDescription: string | null
}

async function loadPage(slug: string) {
  const db = getDb()
  const rows = await db
    .select({
      key: schema.siteContent.key,
      value: schema.siteContent.value,
      valueJson: schema.siteContent.valueJson,
      audience: schema.siteContent.audience,
      updatedAt: schema.siteContent.updatedAt,
    })
    .from(schema.siteContent)
    .where(
      and(eq(schema.siteContent.key, slug), sql`${schema.siteContent.valueJson}->>'kind' = 'page'`),
    )
    .limit(1)
  return rows[0] ?? null
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const row = await loadPage(slug)
  if (!row) return { title: 'Page not found · Coin Frenzy' }
  const meta = (row.valueJson ?? {}) as Partial<PageMeta>
  return {
    title: `${meta.title ?? slug} · Coin Frenzy`,
    description: meta.seoDescription ?? undefined,
  }
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params
  const row = await loadPage(slug)
  if (!row) notFound()
  const meta = (row.valueJson ?? {}) as Partial<PageMeta>

  // Drafts + archives never render to the public, regardless of route.
  if (meta.status !== 'active') notFound()

  // Audience gating: 'admin' rows are not exposed via this public route.
  // (Logged-in-only is rendered for everyone for now; gate would belong
  // here when player middleware lands on this surface.)
  if (row.audience === 'admin') notFound()

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <header>
        <h1 className="cf-headline cf-gold-text text-4xl font-extrabold uppercase tracking-wide sm:text-5xl">
          {meta.title ?? slug}
        </h1>
        <p className="mt-2 text-xs uppercase tracking-wider text-[var(--cf-gold-light)]">
          Last updated · {row.updatedAt.toISOString().slice(0, 10)}
        </p>
        {meta.seoDescription ? (
          <p className="mt-3 text-sm text-[var(--cf-gray-light)]">{meta.seoDescription}</p>
        ) : null}
      </header>

      <article className="cf-legal-prose mt-8 space-y-6 text-sm leading-relaxed text-[var(--cf-gray-light)]">
        <PublicPageBody body={row.value ?? ''} />
      </article>
    </div>
  )
}
