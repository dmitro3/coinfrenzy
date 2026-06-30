import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { vip as vipModule } from '@coinfrenzy/core'
import { hasAtLeast, isHost } from '@coinfrenzy/core/auth'

import { getAdminSession } from '@/lib/admin-session'
import { getDb } from '@coinfrenzy/db/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// M4 — host (or manager+) logs a manual interaction (call, text, in-person,
// email, free-form note). The core module enforces "host owns player" for
// host callers; managers and above can log against any player so they can
// retro-fill or fix mis-attributions.
//
// `metadata.channel` is where we record the actual platform (WhatsApp /
// Telegram / SMS / iMessage / Signal / company_phone / other). The DB
// `interaction_type` enum stays compact; the platform lives in metadata
// so we don't have to migrate the check constraint every time hosts
// start using a new tool.

const CHANNELS = [
  'whatsapp',
  'telegram',
  'sms',
  'imessage',
  'signal',
  'company_phone',
  'other',
] as const

const body = z.object({
  playerId: z.string().uuid(),
  type: z.enum(['call', 'text', 'email', 'in_person', 'note']),
  outcome: z.enum(['positive', 'neutral', 'negative', 'no_response']).nullable().optional(),
  notes: z.string().max(8000).nullable().optional(),
  metadata: z
    .object({
      channel: z.enum(CHANNELS).optional(),
    })
    .passthrough()
    .nullable()
    .optional(),
})

export async function POST(req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Hosts can log against their own players (core enforces ownership);
  // managers and above can log against anyone for corrections + back-fills.
  const isManagerPlus = hasAtLeast(session.payload.role, 'manager')
  if (!isHost(session.payload.role) && !isManagerPlus) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let parsed: z.infer<typeof body>
  try {
    parsed = body.parse(await req.json())
  } catch (e) {
    return NextResponse.json(
      { error: 'invalid_input', details: e instanceof z.ZodError ? e.flatten() : undefined },
      { status: 400 },
    )
  }

  try {
    const row = await vipModule.logInteraction(getDb(), {
      hostId: session.admin.id,
      playerId: parsed.playerId,
      type: parsed.type,
      outcome: parsed.outcome ?? null,
      notes: parsed.notes ?? null,
      metadata: parsed.metadata ?? undefined,
      // Managers and above bypass the "host owns player" check.
      actorRole: isManagerPlus && !isHost(session.payload.role) ? 'manager' : 'host',
    })
    return NextResponse.json({ id: row.id, createdAt: row.createdAt.toISOString() })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('host does not own this player')) {
      return NextResponse.json({ error: 'forbidden', reason: msg }, { status: 403 })
    }
    return NextResponse.json({ error: 'internal_error', reason: msg }, { status: 500 })
  }
}
