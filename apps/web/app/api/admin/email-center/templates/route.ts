import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'

import { schema } from '@coinfrenzy/db'

import { buildAdminContext } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Returns the current published email templates so the Email Center
 * compose dialog can offer "Load from template" without each admin
 * having to memorise template slugs. Only the current version of each
 * template is returned. We deliberately don't expose draft revisions.
 */
export async function GET() {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response

  const rows = await built.data.ctx.db
    .select({
      id: schema.emailTemplates.id,
      slug: schema.emailTemplates.slug,
      displayName: schema.emailTemplates.displayName,
      category: schema.emailTemplates.category,
      subjectTemplate: schema.emailTemplates.subjectTemplate,
      bodyHtmlTemplate: schema.emailTemplates.bodyHtmlTemplate,
      bodyTextTemplate: schema.emailTemplates.bodyTextTemplate,
      fromEmail: schema.emailTemplates.fromEmail,
      replyTo: schema.emailTemplates.replyTo,
    })
    .from(schema.emailTemplates)
    .where(and(eq(schema.emailTemplates.isCurrent, true)))
    .orderBy(schema.emailTemplates.displayName)
    .limit(500)

  return NextResponse.json({ templates: rows })
}
