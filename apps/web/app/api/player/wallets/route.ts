import { NextResponse } from 'next/server'

import { getPlayerSession } from '@/lib/player-session'
import { getPlayerWallets, serializeWallet } from '@/lib/player-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Lightweight read-only endpoint that the realtime layer hits after
// receiving a `balance-update` push. The server-side publisher today
// emits only `{ reason }` for win + purchase paths (see
// packages/core/src/webhooks/alea/handlers/round-win.ts and
// packages/core/src/webhooks/finix/handlers/transfer-succeeded.ts), so
// the client re-pulls the authoritative wallet snapshot here, diffs
// against its last-known balances, and turns the result into a typed
// WinEvent that the chrome can celebrate against.

export async function GET() {
  const session = await getPlayerSession()
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const wallets = await getPlayerWallets(session.player.id)
  return NextResponse.json({ wallets: wallets.map(serializeWallet) })
}
