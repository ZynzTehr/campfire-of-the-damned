import { describe, expect, it, vi } from 'vite-plus/test'
import { requestStory, OFFLINE_MESSAGE } from './api.ts'

const req = { setting: 'haunted-attic' as const, language: 'en' as const, words: ['teacup', 'rust'] }
const story = { id: 's1', title: 'The Porcelain Choir', body: 'One. Two. Three.', spookFactor: 4, setting: 'haunted-attic', words: ['teacup', 'rust'] }
const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))

describe('requestStory', () => {
  it('POSTs JSON to /api/story with the request and the client id', async () => {
    const f = reply(200, { ok: true, story, source: 'ai' })
    await requestStory(req, { fetch: f, clientId: '1b4e28ba-2fa1-4d3b-a3f5-ef19b5a7633b' })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/story')
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('content-type')).toBe('application/json')
    expect(JSON.parse(init.body as string)).toEqual({ ...req, clientId: '1b4e28ba-2fa1-4d3b-a3f5-ef19b5a7633b' })
  })

  it('200 → the story', async () => {
    expect(await requestStory(req, { fetch: reply(200, { ok: true, story, source: 'ai' }) })).toEqual({ kind: 'story', story })
  })

  it.each(['invalid', 'rejected', 'unavailable'] as const)('%s → that kind with the server\'s message', async (kind) => {
    const status = kind === 'unavailable' ? 503 : 400
    expect(await requestStory(req, { fetch: reply(status, { ok: false, kind, message: `msg ${kind}` }) })).toEqual({ kind, message: `msg ${kind}` })
  })

  it('429 → rate_limited with the wait time', async () => {
    const out = await requestStory(req, { fetch: reply(429, { ok: false, kind: 'rate_limited', message: 'Come back in 12 seconds.', retryAfterSeconds: 12 }) })
    expect(out).toEqual({ kind: 'rate_limited', message: 'Come back in 12 seconds.', retryAfterSeconds: 12 })
  })

  it('network failure → offline with the frontend-only message (SPEC §13)', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(await requestStory(req, { fetch: f })).toEqual({ kind: 'offline', message: OFFLINE_MESSAGE })
  })

  it.each([
    ['HTML error page', new Response('<html>502 Bad Gateway</html>', { status: 502 })],
    ['JSON of the wrong shape', new Response(JSON.stringify({ hello: 'world' }), { status: 200 })],
    ['a story missing fields', new Response(JSON.stringify({ ok: true, story: { title: 'x' } }), { status: 200 })],
    ['an unknown error kind', new Response(JSON.stringify({ ok: false, kind: 'boom', message: '<b>x</b>' }), { status: 500 })],
    ['a 429 with no wait time', new Response(JSON.stringify({ ok: false, kind: 'rate_limited', message: 'x' }), { status: 429 })],
  ])('%s → unavailable, never raw server text', async (_n, res) => {
    const out = await requestStory(req, { fetch: vi.fn(async () => res) })
    expect(out.kind).toBe('unavailable')
    if (out.kind === 'unavailable') expect(out.message).not.toMatch(/html|Bad Gateway|<b>/)
  })
})
