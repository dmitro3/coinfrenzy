import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { system as systemMod } from '@coinfrenzy/core'
import { hasAtLeast } from '@coinfrenzy/core/auth'

import { buildAdminContext, jsonError } from '@/lib/admin-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/09 — manager+ may edit the public-facing platform identity.
// No money impact, but values are emitted in player-visible email
// templates so we still audit every change.

const putBody = z.object({
  platformName: z.string().trim().min(1).max(80),
  supportEmail: z.string().trim().email().max(254),
  supportHours: z.string().trim().min(1).max(80),
  socialTwitter: z.string().trim().max(80).nullable().optional(),
  socialInstagram: z.string().trim().max(80).nullable().optional(),
  socialFacebook: z.string().trim().max(80).nullable().optional(),
})

export async function PUT(req: NextRequest) {
  const built = await buildAdminContext()
  if (built.kind === 'unauthorized') return built.response
  if (!hasAtLeast(built.data.session.payload.role, 'manager')) {
    return jsonError(403, 'forbidden')
  }

  let parsed: z.infer<typeof putBody>
  try {
    parsed = putBody.parse(await req.json())
  } catch (e) {
    return jsonError(400, 'invalid_input', e instanceof z.ZodError ? e.flatten() : undefined)
  }

  const result = await systemMod.setGeneralSettings(built.data.ctx, {
    platformName: parsed.platformName,
    supportEmail: parsed.supportEmail,
    supportHours: parsed.supportHours,
    socialTwitter: parsed.socialTwitter?.trim() ? parsed.socialTwitter.trim() : null,
    socialInstagram: parsed.socialInstagram?.trim() ? parsed.socialInstagram.trim() : null,
    socialFacebook: parsed.socialFacebook?.trim() ? parsed.socialFacebook.trim() : null,
  })
  await built.data.flushAfterCommit()

  if (!result.ok) {
    if (result.error.code === 'VALIDATION') {
      return jsonError(400, 'validation', { issues: result.error.issues })
    }
    return jsonError(400, 'invalid', { reason: result.error.reason })
  }

  return NextResponse.json({ ok: true, settings: result.value })
}
