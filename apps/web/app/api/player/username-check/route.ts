import { NextResponse, type NextRequest } from 'next/server'
import { eq, sql } from 'drizzle-orm'

import { getDb } from '@coinfrenzy/db/client'
import * as schema from '@coinfrenzy/db/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const username = searchParams.get('username')

  if (!username) {
    return NextResponse.json(
      { error: 'invalid_input', message: 'Username is required' },
      { status: 400 },
    )
  }

  // Validate format based on legacy rules: 5-20 chars, >= 1 lowercase, [A-Za-z0-9_]
  if (
    username.length < 5 ||
    username.length > 20 ||
    !/^[A-Za-z0-9_]+$/.test(username) ||
    !/[a-z]/.test(username)
  ) {
    return NextResponse.json({
      data: {
        success: true,
        isUserNameExist: false,
        isValid: false,
        message: 'Username does not meet requirements.',
      },
      errors: [],
    })
  }

  const db = getDb()
  const rows = await db
    .select({ id: schema.players.id })
    .from(schema.players)
    .where(eq(sql`lower(${schema.players.username})`, username.toLowerCase()))
    .limit(1)

  const isUserNameExist = rows.length > 0

  return NextResponse.json({
    data: {
      success: true,
      isUserNameExist,
      isValid: true,
      message: 'Record get successfully',
    },
    errors: [],
  })
}
