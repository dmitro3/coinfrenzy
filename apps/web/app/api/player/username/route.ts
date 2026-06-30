import { NextResponse, type NextRequest } from 'next/server'
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'
import { getPlayerSession } from '@/lib/player-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const usernameBody = z.object({
  username: z
    .string()
    .min(5)
    .max(20)
    .regex(/^[A-Za-z0-9_]+$/, 'Username must only contain letters, digits, and underscores')
    .regex(/[a-z]/, 'Username must contain at least one lowercase letter'),
})

export async function POST(req: NextRequest) {
  const session = await getPlayerSession()
  if (!session) {
    return NextResponse.json({ error: 'unauthorized', message: 'Not logged in' }, { status: 401 })
  }

  let parsed: z.output<typeof usernameBody>
  try {
    parsed = usernameBody.parse(await req.json())
  } catch (e) {
    return NextResponse.json(
      { error: 'invalid_input', details: e instanceof z.ZodError ? e.flatten() : undefined },
      { status: 400 },
    )
  }

  const db = getDb()

  // Ensure user doesn't already have a username
  const currentUser = await db
    .select({ username: schema.players.username })
    .from(schema.players)
    .where(eq(schema.players.id, session.player.id))
    .limit(1)

  if (currentUser[0]?.username) {
    return NextResponse.json(
      { error: 'already_set', message: 'Username is already set for this account.' },
      { status: 400 },
    )
  }

  // Check if username is already taken by someone else
  const existing = await db
    .select({ id: schema.players.id })
    .from(schema.players)
    .where(eq(sql`lower(${schema.players.username})`, parsed.username.toLowerCase()))
    .limit(1)

  if (existing.length > 0) {
    return NextResponse.json(
      { error: 'username_taken', message: 'This username is already in use.' },
      { status: 400 },
    )
  }

  // Update the username
  await db
    .update(schema.players)
    .set({
      username: parsed.username,
      updatedAt: new Date(),
    })
    .where(eq(schema.players.id, session.player.id))

  // In Better Auth, also update the name if it wasn't set, or we can just keep the username in players
  return NextResponse.json({
    data: {
      success: true,
      message: 'Username set successfully',
    },
    errors: [],
  })
}

const changeUsernameBody = usernameBody

export async function PATCH(req: NextRequest) {
  const session = await getPlayerSession()
  if (!session) {
    return NextResponse.json({ error: 'unauthorized', message: 'Not logged in' }, { status: 401 })
  }

  let parsed: z.output<typeof changeUsernameBody>
  try {
    parsed = changeUsernameBody.parse(await req.json())
  } catch (e) {
    return NextResponse.json(
      { error: 'invalid_input', details: e instanceof z.ZodError ? e.flatten() : undefined },
      { status: 400 },
    )
  }

  const db = getDb()

  const [current] = await db
    .select({ username: schema.players.username })
    .from(schema.players)
    .where(eq(schema.players.id, session.player.id))
    .limit(1)

  if (!current) {
    return NextResponse.json({ error: 'not_found', message: 'Player not found.' }, { status: 404 })
  }

  if (current.username?.toLowerCase() === parsed.username.toLowerCase()) {
    return NextResponse.json({
      data: { success: true, message: 'Username unchanged.' },
      errors: [],
    })
  }

  const existing = await db
    .select({ id: schema.players.id })
    .from(schema.players)
    .where(eq(sql`lower(${schema.players.username})`, parsed.username.toLowerCase()))
    .limit(1)

  if (existing.length > 0 && existing[0]!.id !== session.player.id) {
    return NextResponse.json(
      { error: 'username_taken', message: 'This username is already in use.' },
      { status: 400 },
    )
  }

  await db
    .update(schema.players)
    .set({
      username: parsed.username,
      updatedAt: new Date(),
    })
    .where(eq(schema.players.id, session.player.id))

  return NextResponse.json({
    data: {
      success: true,
      message: 'Username updated successfully',
    },
    errors: [],
  })
}
