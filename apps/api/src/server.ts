import { serve } from '@hono/node-server'
import { createApp } from './app.ts'

// Local entry point only. On Vercel, api/index.ts wraps createApp() instead.
const port = Number(process.env.PORT ?? 8787)

serve({ fetch: createApp().fetch, port, hostname: '127.0.0.1' }, (info) => {
  console.log(`[api] listening on http://127.0.0.1:${info.port}`)
})
