import type { NextRequest } from 'next/server'

import { getAdminSession } from '@/lib/admin-session'

import { buildIntegrityFrame } from '@/app/(admin)/admin/integrity/_snapshot'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// docs/05 §8 + docs/12 §5.3 — SSE feed for the Integrity page. Every 30s
// we re-query integration_health + vendor-mode flags + pending webhooks +
// aml_review_queue and push a frame. Smaller and simpler than Pusher for
// ~10 tiles refreshed once per cycle. Auth is checked once at connection
// time; everything else lives in `_snapshot.ts` so the RSC initial render
// and the SSE stream agree on shape.

const REFRESH_MS = 30_000

export async function GET(_req: NextRequest) {
  const session = await getAdminSession()
  if (!session) return new Response('unauthorized', { status: 401 })

  const encoder = new TextEncoder()
  let interval: ReturnType<typeof setInterval> | null = null
  let heartbeat: ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream({
    async start(controller) {
      // First frame goes out immediately so the UI doesn't sit on the
      // server-rendered values for 30s.
      const initial = await buildIntegrityFrame()
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(initial)}\n\n`))

      interval = setInterval(async () => {
        try {
          const frame = await buildIntegrityFrame()
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`))
        } catch (e) {
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ message: e instanceof Error ? e.message : String(e) })}\n\n`,
            ),
          )
        }
      }, REFRESH_MS)

      // Heartbeat keeps proxies / load balancers from killing the connection
      // during an idle 30s gap.
      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`))
      }, 15_000)
    },
    cancel() {
      if (interval) clearInterval(interval)
      if (heartbeat) clearInterval(heartbeat)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
