import { toNextJsHandler } from 'better-auth/next-js'

import { auth } from '@/lib/auth'

// docs/09 §5.1 — single Better Auth handler. Mounted at /api/auth/* so
// the client SDK and any direct API calls land here.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const { GET, POST } = toNextJsHandler(auth.handler)
