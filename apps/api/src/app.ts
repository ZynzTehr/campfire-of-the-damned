import { Hono } from 'hono'

/**
 * Builds the API. Every route lives under /api so the same app works behind
 * the Vite dev proxy locally and the single Vercel function in production.
 *
 * Dependencies (AI client, store, clock, limits) are injected here from
 * Phase 2 on, so tests can pass fakes that simulate every failure.
 */
export function createApp() {
  const app = new Hono().basePath('/api')

  app.get('/health', (c) => c.json({ ok: true }))

  // Unknown routes and wrong methods: same shape every time, nothing to probe.
  app.notFound((c) => c.json({ ok: false, kind: 'not_found' }, 404))

  // Last line of defense: never echo the error. Its message can carry
  // upstream text, SQL, or env values. Log server-side only.
  app.onError((err, c) => {
    console.error('[api] unhandled error:', err)
    return c.json({ ok: false, kind: 'unavailable' }, 500)
  })

  return app
}
