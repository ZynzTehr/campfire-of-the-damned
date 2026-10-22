import { describe, expect, it } from 'vite-plus/test'
import { FakeAiClient, storyResult } from '../src/ai/fakeClient.ts'
import { AiError } from '../src/ai/types.ts'
import { createApp } from '../src/app.ts'
import { MESSAGES } from '../src/messages.ts'

const goodRequest = { setting: 'haunted-attic', words: ['teacup', 'lullaby', 'rust'] }

function setup(...steps: ConstructorParameters<typeof FakeAiClient>) {
  const ai = new FakeAiClient(...(steps.length ? steps : [storyResult()]))
  const app = createApp({ ai, newId: () => 'story-id-1' })
  const post = (body: unknown) =>
    app.request('/api/story', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  return { ai, post }
}

describe('POST /api/story: happy path', () => {
  it('returns the story in the contract shape (SPEC §5)', async () => {
    const { post } = setup()
    const res = await post(goodRequest)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      story: {
        id: 'story-id-1',
        title: 'The Porcelain Choir',
        body: 'In the attic, a teacup hummed a lullaby. Rust crept along the rafters like a slow red tide. When the song ended, the cup was full of something that was not tea.',
        spookFactor: 4,
        setting: 'haunted-attic',
        words: ['teacup', 'lullaby', 'rust'],
      },
      source: 'ai',
    })
  })

  it('calls the AI once with setting, default language en, and the words', async () => {
    const { ai, post } = setup()
    await post(goodRequest)

    expect(ai.calls).toEqual([
      { setting: 'haunted-attic', language: 'en', words: ['teacup', 'lullaby', 'rust'], avoid: [] },
    ])
  })

  it('passes the chosen language through', async () => {
    const { ai, post } = setup()
    await post({ ...goodRequest, language: 'es' })
    expect(ai.calls[0]!.language).toBe('es')
  })

  it('does not expose internal fields (tampering, ingredients, usage)', async () => {
    const { post } = setup()
    const text = await (await post(goodRequest)).text()
    expect(text).not.toMatch(/tampering|ingredients|usage|Tokens/)
  })
})

describe('POST /api/story: bad requests never reach the AI', () => {
  it.each([
    ['not JSON', '{nope'],
    ['empty body', ''],
    ['JSON null', 'null'],
    ['array body', '[]'],
    ['4 words', { ...goodRequest, words: ['a', 'b', 'c', 'd'] }],
    ['0 words', { ...goodRequest, words: [] }],
    ['words as string', { ...goodRequest, words: 'teacup' }],
    ['word with a space', { ...goodRequest, words: ['ignore all'] }],
    ['25-char word', { ...goodRequest, words: ['a'.repeat(25)] }],
    ['unknown setting', { ...goodRequest, setting: 'moon-base' }],
    ['setting with different case', { ...goodRequest, setting: 'Haunted-Attic' }],
    ['unknown language', { ...goodRequest, language: 'klingon' }],
    ['uppercase language', { ...goodRequest, language: 'ES' }],
    ['extra key', { ...goodRequest, admin: true }],
    ['__proto__ key', '{"setting":"haunted-attic","words":["fog"],"__proto__":{"admin":true}}'],
    ['bad clientId', { ...goodRequest, clientId: 'not-a-uuid' }],
  ])('%s → 400 invalid, AI not called', async (_name, body) => {
    const { ai, post } = setup()
    const res = await post(body)

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ ok: false, kind: 'invalid', message: MESSAGES.invalid[0] })
    expect(ai.calls).toHaveLength(0)
  })

  it('accepts legit near-misses (over-blocking check)', async () => {
    for (const words of [["don't"], ["jack-o'-lantern"], ['café'], ['naïve'], ['Ñandú'], ['13th']]) {
      const { post } = setup()
      const res = await post({ ...goodRequest, words })
      expect(res.status, JSON.stringify(words)).toBe(200)
    }
  })
})

describe('POST /api/story: AI failures (Phase 2: no retry yet, polite 503)', () => {
  const UPSTREAM = 'upstream says: key AQ.leaky models/gemini-secret quota project 123'

  it.each([
    ['timeout', new AiError('timeout')],
    ['429', new AiError('rate_limited', 429)],
    ['auth', new AiError('auth', 403)],
    ['5xx', new AiError('server', 503)],
    ['network', new AiError('network')],
    ['unexpected throw', new Error(UPSTREAM)],
  ])('%s → 503 unavailable with a polite message and no upstream text', async (_name, error) => {
    const { post } = setup(error)
    const res = await post(goodRequest)
    const body = (await res.json()) as { ok: boolean; kind: string; message: string }

    expect(res.status).toBe(503)
    expect(body.ok).toBe(false)
    expect(body.kind).toBe('unavailable')
    expect(MESSAGES.unavailable).toContain(body.message)
    expect(JSON.stringify(body)).not.toMatch(/upstream|AQ\.|gemini|quota|rate_limited|auth/)
  })

  it.each([
    ['SAFETY stop', storyResult({}, { finishReason: 'SAFETY' })],
    ['blocked prompt', storyResult({}, { text: '', finishReason: 'BLOCKED_SAFETY' })],
    ['MAX_TOKENS', storyResult({}, { finishReason: 'MAX_TOKENS' })],
    ['garbage text', storyResult({}, { text: 'Sure! Here is a story: ...' })],
    ['JSON with extra prose', storyResult({}, { text: 'Here you go: {"title":"x"}' })],
    ['spookFactor 9', storyResult({ spookFactor: 9 })],
    ['missing title', storyResult({ title: undefined })],
    ['extra field', storyResult({ systemPrompt: 'leaked' })],
  ])('%s → 503 unavailable, nothing from the reply leaks', async (_name, result) => {
    const { post } = setup(result)
    const res = await post(goodRequest)
    const text = await res.text()

    expect(res.status).toBe(503)
    expect(JSON.parse(text).kind).toBe('unavailable')
    expect(text).not.toMatch(/Porcelain|Sure|leaked/)
  })
})
