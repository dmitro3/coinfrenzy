import { NextResponse } from 'next/server'
import { getPlayerSession } from '@/lib/player-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getPlayerSession()

  if (!session) {
    return NextResponse.json({ error: 'unauthorized', message: 'Not logged in' }, { status: 401 })
  }

  // The legacy frontend expects this shape
  return NextResponse.json({
    data: {
      success: true,
      data: {
        userId: session.player.id,
        username: session.user.name,
        email: session.user.email,
        isEmailVerified: session.user.emailVerified,
        kycStatus: 'K1', // Dummy mapping or logic if available
        // Return other standard fields if necessary
      },
      message: 'Record get successfully',
    },
    errors: [],
  })
}
