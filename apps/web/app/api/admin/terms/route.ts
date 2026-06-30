import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { legal as coreLegal } from '@coinfrenzy/core'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const slugSchema = z.enum(['tos', 'privacy', 'rg_policy'])

const publishSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1).max(200),
  bodyHtml: z.string().min(1).max(200_000),
  summary: z.string().max(500).optional(),
  effectiveAt: z.string().datetime().optional(),
})

export async function GET(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const ctx = built.data.ctx

  const url = new URL(req.url)
  const rawSlug = url.searchParams.get('slug')
  const slug =
    rawSlug && slugSchema.safeParse(rawSlug).success
      ? (rawSlug as 'tos' | 'privacy' | 'rg_policy')
      : undefined

  const rows = await coreLegal.listTermsVersions(ctx.db, slug)
  return NextResponse.json({ versions: rows })
}

export async function POST(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  const { ctx, session } = built.data

  // Publishing a new legal version forces every existing player to
  // re-accept — gate to manager+ (master required for the highest-impact
  // RG policy bump).
  const role = session.payload.role
  if (role !== 'manager' && role !== 'master') {
    return jsonError(403, 'forbidden')
  }

  const parsed = publishSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return jsonError(400, 'invalid_input', parsed.error.flatten())
  }
  if (parsed.data.slug === 'rg_policy' && role !== 'master') {
    return jsonError(403, 'master_required_for_rg_policy')
  }

  const result = await coreLegal.publishNewTermsVersion(ctx, {
    slug: parsed.data.slug,
    title: parsed.data.title,
    bodyHtml: parsed.data.bodyHtml,
    summary: parsed.data.summary ?? null,
    effectiveAt: parsed.data.effectiveAt ? new Date(parsed.data.effectiveAt) : undefined,
  })

  return NextResponse.json({ ok: true, ...result })
}
