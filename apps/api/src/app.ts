import { Hono } from 'hono'
import type { Context } from 'hono'
import type { AiClient } from './ai/types.ts'
import { pickMessage } from './messages.ts'
import { AiStory, StoryRequest } from './story.ts'

export interface AppDeps {
  ai: AiClient
  newId?: () => string
  random?: () => number
}

/**
 * Builds the API. Every route lives under /api so the same app works behind
 * the Vite dev proxy locally and the single Vercel function in production.
 *
 * Dependencies are injected so tests pass fakes that simulate every failure.
 * Phase 3 adds input/output guards and retry; Phase 4 the cost layers.
 */
export function createApp(deps: AppDeps) {
  const newId = deps.newId ?? (() => crypto.randomUUID())
  const random = deps.random ?? Math.random
  const app = new Hono().basePath('/api')

  const invalid = (c: Context) => c.json({ ok: false, kind: 'invalid', message: pickMessage('invalid', random) }, 400)
  const unavailable = (c: Context) =>
    c.json({ ok: false, kind: 'unavailable', message: pickMessage('unavailable', random) }, 503)

  app.get('/health', (c) => c.json({ ok: true }))

  app.post('/story', async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return invalid(c)
    }
    const parsed = StoryRequest.safeParse(body)
    if (!parsed.success) return invalid(c)
    const { setting, language, words } = parsed.data

    // THE AI CALL. Only place the model is reached; the key never leaves the server.
    let result
    try {
      result = await deps.ai.generate({ setting, language, words, avoid: [] })
    } catch (err) {
      console.warn('[story] ai call failed:', err instanceof Error ? err.name : 'unknown', (err as { kind?: string }).kind ?? '')
      return unavailable(c)
    }

    if (result.finishReason !== 'STOP') {
      console.warn('[story] ai finishReason:', result.finishReason)
      return unavailable(c)
    }

    let story: AiStory
    try {
      story = AiStory.parse(JSON.parse(result.text))
    } catch {
      console.warn('[story] ai reply failed schema')
      return unavailable(c)
    }

    return c.json({
      ok: true,
      story: { id: newId(), title: story.title, body: story.body, spookFactor: story.spookFactor, setting, words },
      source: 'ai',
    })
  })

  // Unknown routes and wrong methods: same shape every time, nothing to probe.
  app.notFound((c) => c.json({ ok: false, kind: 'not_found' }, 404))

  // Last line of defense: never echo the error. Its message can carry
  // upstream text, SQL, or env values. Log server-side only.
  app.onError((err, c) => {
    console.error('[api] unhandled error:', err.name)
    return unavailable(c)
  })

  return app
}
