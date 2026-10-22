import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { storyResult, type FakeStep } from '../src/ai/fakeClient.ts'
import { AiError, type AiClient } from '../src/ai/types.ts'
import { MESSAGES } from '../src/messages.ts'
import { makeApp, type ErrorBody } from './helpers.ts'

const req = { setting: 'haunted-attic', words: ['teacup', 'lullaby', 'rust'] }
const good = storyResult()
const bad = storyResult({ body: 'Too short.' }) // fails the output guard
const hostile = storyResult({ body: '<script>alert(1)</script> Sure! As an AI I cannot.' })
const tampering = storyResult({ tampering: true })
const timeout = new AiError('timeout')
const server = new AiError('server', 503)
const network = new AiError('network')
const rateLimited = new AiError('rate_limited', 429)
const auth = new AiError('auth', 403)
const badRequest = new AiError('bad_request', 400)

let logs: string[]
beforeEach(() => {
  logs = []
  for (const level of ['log', 'warn', 'error'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '))
    })
  }
})
afterEach(() => vi.restoreAllMocks())

async function run(...steps: FakeStep[]) {
  const t = makeApp(steps)
  const res = await t.post(req)
  const body = (await res.json()) as { ok: boolean; kind?: string; message?: string }
  return { ...t, res, body }
}

describe('retry: transient errors get exactly one more attempt', () => {
  it.each([
    ['timeout', timeout],
    ['5xx', server],
    ['network', network],
  ])('%s then success → 200 after 2 calls', async (_n, err) => {
    const { res, ai } = await run(err, good)
    expect(res.status).toBe(200)
    expect(ai.calls).toHaveLength(2)
  })

  it.each([
    ['timeout', timeout],
    ['5xx', server],
    ['network', network],
  ])('%s twice → 503 unavailable after 2 calls', async (_n, err) => {
    const { res, body, ai } = await run(err, err)
    expect(res.status).toBe(503)
    expect(body.kind).toBe('unavailable')
    expect(ai.calls).toHaveLength(2)
  })

  it('5xx waits a jittered 200–600 ms before retrying', async () => {
    const { sleeps } = await run(server, good)
    expect(sleeps).toHaveLength(1)
    expect(sleeps[0]).toBeGreaterThanOrEqual(200)
    expect(sleeps[0]).toBeLessThanOrEqual(600)
  })
})

describe('no retry: errors where trying again cannot help (or costs quota)', () => {
  it.each([
    ['429 rate limited', rateLimited],
    ['401/403 auth', auth],
    ['400 bad request', badRequest],
    ['unexpected exception', new Error('boom')],
  ])('%s → 503 after 1 call', async (_n, err) => {
    const { res, body, ai } = await run(err, good)
    expect(res.status).toBe(503)
    expect(body.kind).toBe('unavailable')
    expect(ai.calls).toHaveLength(1)
  })

  it('auth failure is logged loudly server-side', async () => {
    await run(auth)
    expect(logs.some((l) => /auth/i.test(l) && /GEMINI_API_KEY/.test(l))).toBe(true)
  })
})

describe('regeneration: bad output gets one more try, then falls back', () => {
  it('bad output then good → 200 after 2 calls', async () => {
    const { res, ai } = await run(bad, good)
    expect(res.status).toBe(200)
    expect(ai.calls).toHaveLength(2)
  })

  it('bad output twice → 503 and nothing from the replies leaks', async () => {
    const { res, body, ai } = await run(hostile, hostile)
    expect(res.status).toBe(503)
    expect(body.kind).toBe('unavailable')
    expect(ai.calls).toHaveLength(2)
    expect(JSON.stringify(body)).not.toMatch(/script|As an AI|Sure/)
  })

  it('the reason for a bad output is logged, never the output itself', async () => {
    await run(hostile, hostile)
    expect(logs.some((l) => /markup|character|sentences/.test(l))).toBe(true)
    expect(logs.join('\n')).not.toContain('<script>')
  })
})

describe('tampering: the model flagged the input → rejected, no regeneration', () => {
  it('tampering on the first reply → 400 rejected (cheeky) after 1 call', async () => {
    const { res, body, ai } = await run(tampering, good)
    expect(res.status).toBe(400)
    expect(body.kind).toBe('rejected')
    expect(MESSAGES.rejected).toContain(body.message)
    expect(ai.calls).toHaveLength(1)
  })

  it('tampering on the retry → rejected', async () => {
    const { body, ai } = await run(timeout, tampering)
    expect(body.kind).toBe('rejected')
    expect(ai.calls).toHaveLength(2)
  })
})

describe('attempt cap: never more than 2 AI calls per request (SPEC §8.1 layer 8)', () => {
  const kinds: Array<[string, FakeStep]> = [
    ['timeout', timeout],
    ['5xx', server],
    ['network', network],
    ['429', rateLimited],
    ['auth', auth],
    ['bad output', bad],
    ['tampering', tampering],
    ['good', good],
  ]
  const combos = kinds.flatMap(([a, x]) => kinds.map(([b, y]) => [`${a} → ${b}`, x, y] as const))

  it.each(combos)('%s', async (_n, first, second) => {
    // A third step that would succeed: if the app ever calls it, the cap is broken.
    const { ai, res } = await run(first, second, good)
    expect(ai.calls.length).toBeLessThanOrEqual(2)
    expect([200, 400, 503]).toContain(res.status)
  })
})

describe('request deadline', () => {
  it('a hung AI is abandoned at the request deadline with a polite 503', async () => {
    let calls = 0
    const hanging: AiClient = {
      generate: (_input, opts) => {
        calls++
        return new Promise((_resolve, reject) => {
          opts?.signal?.addEventListener('abort', () => reject(new AiError('timeout')))
        })
      },
    }
    const { post } = makeApp([good], { ai: hanging, requestDeadlineMs: 50 })
    const started = Date.now()
    const res = await post(req)

    expect(res.status).toBe(503)
    expect(((await res.json()) as ErrorBody).kind).toBe('unavailable')
    expect(Date.now() - started).toBeLessThan(1000)
    expect(calls).toBeLessThanOrEqual(2)
  })

  it('a client that ignores its abort signal is still abandoned at the deadline', async () => {
    const deaf: AiClient = { generate: () => new Promise(() => {}) }
    const { post } = makeApp([good], { ai: deaf, requestDeadlineMs: 50 })
    const started = Date.now()
    const res = await post(req)

    expect(res.status).toBe(503)
    expect(Date.now() - started).toBeLessThan(1000)
  })
})

describe('secrets never leak (SPEC §11.5)', () => {
  const FAKE_KEY = 'AIza' + 'FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE12'

  it.each([
    ['plain Error carrying the key', new Error(`request to https://x?key=${FAKE_KEY} failed`)],
    ['TypeError carrying the key', new TypeError(`fetch failed ${FAKE_KEY}`)],
  ])('%s: not in the response, not in any log line', async (_n, err) => {
    const { res, body } = await run(err)
    expect(res.status).toBe(503)
    const text = JSON.stringify(body)
    expect(text).not.toContain(FAKE_KEY)
    expect(logs.join('\n')).not.toContain(FAKE_KEY)
  })
})
