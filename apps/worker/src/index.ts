import { createServer } from 'node:http'

import { serve } from 'inngest/node'

import { inngest } from './inngest/client'
import { functions } from './inngest/functions'

// Long-running Node entrypoint for Fly.io. Per docs/02 §3, anything that runs
// > 10s or needs persistent connections lives here (Alea reconciliation,
// CRM rollups, Gamma snapshot ingest, scheduled bonuses, etc.).

const port = Number(process.env.PORT ?? 3030)

const inngestHandler = serve({ client: inngest, functions })

const server = createServer(async (req, res) => {
  if (req.url === '/healthz') {
    res.statusCode = 200
    res.end('ok')
    return
  }
  if (req.url?.startsWith('/api/inngest')) {
    await inngestHandler(req, res)
    return
  }
  res.statusCode = 404
  res.end('not found')
})

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[worker] listening on :${port}`)
})
