import { Hono } from 'hono'
import type { Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { buildUserTurn } from './ai/systemPrompt.ts'
import { AiError, type AiClient, type AiResult } from './ai/types.ts'
import { checkInput } from './guards/input.ts'
import { checkOutput } from './guards/output.ts'
import type { CostGate } from './limits/costGate.ts'
import { pickMessage } from './messages.ts'

export interface AppDeps {
  ai: AiClient
  /** Every cost layer (SPEC §8): kill switch, rate limits, concurrency, budget. */
  cost: CostGate
  /** Who is asking, for the per-IP limit. Socket address locally, x-real-ip on Vercel. */
  clientIp: (c: Context) => string
  /** Same prompt and canary the AI client uses; the output guard checks for leaks of both. */
  systemPrompt: string
  canary: string
  newId?: () => string
  random?: () => number
  sleep?: (ms: number) => Promise<void>
  /** Whole-request budget across both attempts. Vercel maxDuration is 30 s (SPEC §15). */
  requestDeadlineMs?: number
}

const MAX_BODY_BYTES = 1024
/** 1 call + at most 1 more (retry OR regeneration), hard-coded (SPEC §8.1 layer 8). */
const MAX_ATTEMPTS = 2
/** Worth one more try. 429 / auth / bad request are not: retrying burns quota or can't help. */
const RETRYABLE = new Set(['timeout', 'server', 'network'])

/**
 * Builds the API. Every route lives under /api so the same app works behind
 * the Vite dev proxy locally and the single Vercel function in production.
 * Dependencies are injected so tests pass fakes that simulate every failure.
 */
export function createApp(deps: AppDeps) {
  const newId = deps.newId ?? (() => crypto.randomUUID())
  const random = deps.random ?? Math.random
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const deadlineMs = deps.requestDeadlineMs ?? 25_000
  const app = new Hono().basePath('/api')

  const fail = (c: Context, kind: 'invalid' | 'rejected' | 'unavailable', status: 400 | 413 | 415 | 503) =>
    c.json({ ok: false, kind, message: pickMessage(kind, random) }, status)
  const rateLimited = (c: Context, retryAfterSeconds: number) => {
    c.header('Retry-After', String(retryAfterSeconds))
    const message = pickMessage('rate_limited', random).replace('{n}', String(retryAfterSeconds))
    return c.json({ ok: false, kind: 'rate_limited', message, retryAfterSeconds }, 429)
  }
  // Cache-only mode. Phase 5 serves an unseen cached story here before giving up.
  const resting = (c: Context) => c.json({ ok: false, kind: 'unavailable', message: pickMessage('resting', random) }, 503)

  app.get('/health', (c) => c.json({ ok: true }))

  app.post(
    '/story',
    // 1. Size cap before anything is parsed (cost layer 2, input step 1).
    bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => fail(c, 'invalid', 413) }),
    async (c) => {
      // 2. JSON only.
      const type = c.req.header('content-type') ?? ''
      if (!/^application\/json(\s*;|$)/i.test(type)) return fail(c, 'invalid', 415)

      let body: unknown
      try {
        body = await c.req.json()
      } catch {
        return fail(c, 'invalid', 400)
      }

      // 3–8. Shape, normalization, injection/persona/profanity, word format.
      const input = checkInput(body)
      if (!input.ok) {
        console.warn(`[story] input ${input.kind}: ${input.reason}`)
        return fail(c, input.kind, 400)
      }

      // Cost layer 5: per-IP limit. After the input guard, so typos and rejected
      // attempts don't use up an honest user's allowance (they never reach the AI anyway).
      const client = await deps.cost.allowClient(deps.clientIp(c))
      if (!client.ok) return rateLimited(c, client.retryAfterSeconds)

      const { setting, language, words, lastRating } = input.value
      const prompt = { setting, language, words, avoid: [], ...(lastRating !== undefined ? { lastRating } : {}) }
      const promptText = `${deps.systemPrompt}\n${buildUserTurn(prompt)}`
      const guardCtx = { words, language, canary: deps.canary, systemPrompt: deps.systemPrompt }
      const deadline = AbortSignal.timeout(deadlineMs)

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        // Past the deadline: don't start another call (an already-aborted signal never fires 'abort').
        if (deadline.aborted) {
          console.warn(`[story] request deadline hit before attempt ${attempt}`)
          return fail(c, 'unavailable', 503)
        }
        const last = attempt === MAX_ATTEMPTS

        // Cost layers 1, 3, 6, 7, 9, 10: checked before every call, retries included.
        const gate = await deps.cost.beginCall(promptText)
        if (!gate.ok) {
          console.warn(`[story] attempt ${attempt} not started: ${gate.reason}`)
          if (attempt > 1) return fail(c, 'unavailable', 503)
          return gate.mode === 'busy' ? rateLimited(c, gate.retryAfterSeconds) : resting(c)
        }

        // THE AI CALL. The only place the model is reached; the key never leaves the server.
        let result: AiResult
        try {
          result = await withDeadline(deps.ai.generate(prompt, { signal: deadline }), deadline)
        } catch (err) {
          // Log the kind only: an error's message can carry URLs, upstream text, or the key.
          const kind = err instanceof AiError ? err.kind : 'unexpected'
          await deps.cost.endCall(gate.ticket, { errorKind: kind })
          if (kind === 'auth') {
            console.error(`[story] AI auth failed (HTTP ${(err as AiError).status ?? '?'}): check GEMINI_API_KEY`)
          } else {
            console.warn(`[story] attempt ${attempt} failed: ${kind}${kind === 'unexpected' ? ` (${(err as Error)?.name})` : ''}`)
          }
          if (last || !RETRYABLE.has(kind)) return fail(c, 'unavailable', 503)
          if (kind === 'server') await sleep(200 + Math.floor(random() * 400))
          continue
        }
        await deps.cost.endCall(gate.ticket, { usage: result.usage })

        const checked = checkOutput(result, guardCtx)
        if (checked.ok) {
          const { title, body: text, spookFactor } = checked.story
          return c.json({ ok: true, story: { id: newId(), title, body: text, spookFactor, setting, words }, source: 'ai' })
        }

        // The model itself flagged the input as an attempt to steer it: cheeky, and never regenerate.
        if (checked.reason === 'tampering') {
          console.warn('[story] model flagged tampering')
          return fail(c, 'rejected', 400)
        }
        console.warn(`[story] attempt ${attempt} output rejected: ${checked.reason}`)
        if (last) return fail(c, 'unavailable', 503)
      }
      return fail(c, 'unavailable', 503)
    },
  )

  // Unknown routes and wrong methods: same shape every time, nothing to probe.
  app.notFound((c) => c.json({ ok: false, kind: 'not_found' }, 404))

  // Last line of defense: never echo the error. Log the name only.
  app.onError((err, c) => {
    console.error('[api] unhandled error:', err.name)
    return fail(c, 'unavailable', 503)
  })

  return app
}

/** Rejects with a timeout when the deadline fires, even if the client ignores its signal. */
function withDeadline<T>(work: Promise<T>, deadline: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new AiError('timeout'))
    deadline.addEventListener('abort', onAbort, { once: true })
    work.then(resolve, reject).finally(() => deadline.removeEventListener('abort', onAbort))
  })
}
