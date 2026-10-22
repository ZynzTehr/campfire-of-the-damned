import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vite-plus/test'
import { createGeminiClient, type GeminiConfig } from '../src/ai/geminiClient.ts'
import type { PromptInput } from '../src/ai/systemPrompt.ts'
import { AiError } from '../src/ai/types.ts'

const KEY = 'fake-test-key-that-must-never-leak-0123456789'
const input: PromptInput = { setting: 'haunted-attic', language: 'en', words: ['teacup', 'lullaby', 'rust'], avoid: [] }

interface Recorded {
  status: number
  body: any
}
function fixture(name: string): Recorded {
  return JSON.parse(readFileSync(new URL(`./fixtures/gemini/${name}.json`, import.meta.url), 'utf8'))
}

interface Captured {
  url: string
  init: RequestInit
}

/** A fetch that replays a response and records what it was asked. */
function replay(rec: Recorded, captured: Captured[] = []): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    captured.push({ url: String(url), init: init ?? {} })
    return new Response(typeof rec.body === 'string' ? rec.body : JSON.stringify(rec.body), {
      status: rec.status,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
}

function client(overrides: Partial<GeminiConfig> = {}) {
  return createGeminiClient({
    apiKey: KEY,
    model: 'gemini-test-model',
    systemPrompt: 'SYSTEM PROMPT TEXT',
    maxOutputTokens: 300,
    timeoutMs: 1000,
    ...overrides,
  })
}

async function catchAiError(p: Promise<unknown>): Promise<AiError> {
  const err = await p.then(
    () => {
      throw new Error('expected an AiError, got success')
    },
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(AiError)
  return err as AiError
}

describe('GeminiClient: recorded real responses', () => {
  it('parses a real English story response', async () => {
    const rec = fixture('story-en')
    const result = await client({ fetch: replay(rec) }).generate(input)

    expect(result.finishReason).toBe('STOP')
    const story = JSON.parse(result.text)
    expect(story).toHaveProperty('title')
    expect(story).toHaveProperty('body')
    const u = rec.body.usageMetadata
    expect(result.usage).toEqual({
      inputTokens: u.promptTokenCount,
      outputTokens: u.candidatesTokenCount ?? 0,
      thinkingTokens: u.thoughtsTokenCount ?? 0,
    })
  })

  it('parses a real Spanish story response', async () => {
    const result = await client({ fetch: replay(fixture('story-es')) }).generate(input)
    expect(result.finishReason).toBe('STOP')
    expect(JSON.parse(result.text).ingredients).toHaveLength(2)
  })

  it('maps a real bad-key response to auth, without upstream text', async () => {
    const rec = fixture('error-bad-key')
    const err = await catchAiError(client({ fetch: replay(rec) }).generate(input))

    expect(err.kind).toBe('auth')
    expect(err.message).not.toContain(rec.body.error.message)
  })

  it('maps a real unknown-model response to bad_request (a config error, not retryable)', async () => {
    const err = await catchAiError(client({ fetch: replay(fixture('error-bad-model')) }).generate(input))
    expect(err.kind).toBe('bad_request')
  })
})

describe('GeminiClient: request it sends', () => {
  it('puts the key in a header, never in the URL', async () => {
    const captured: Captured[] = []
    await client({ fetch: replay(fixture('story-en'), captured) }).generate(input)

    expect(captured).toHaveLength(1)
    const { url, init } = captured[0]!
    expect(url).not.toContain(KEY)
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent')
    expect(new Headers(init.headers).get('x-goog-api-key')).toBe(KEY)
    expect(init.method).toBe('POST')
  })

  it('sends the system prompt, sorted words, output cap, and JSON schema', async () => {
    const captured: Captured[] = []
    await client({ fetch: replay(fixture('story-en'), captured) }).generate(input)

    const body = JSON.parse(String(captured[0]!.init.body))
    expect(body.systemInstruction.parts[0].text).toBe('SYSTEM PROMPT TEXT')
    expect(body.contents[0].parts[0].text).toContain('["lullaby","rust","teacup"]')
    expect(body.generationConfig.maxOutputTokens).toBe(300)
    expect(body.generationConfig.responseMimeType).toBe('application/json')
    expect(body.generationConfig.responseSchema.required).toContain('tampering')
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'minimal' })
  })
})

describe('GeminiClient: response edge cases', () => {
  const okBody = (candidate: object, extra: object = {}) => ({
    status: 200,
    body: { candidates: [candidate], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 }, ...extra },
  })

  it('ignores thought parts and joins only answer text', async () => {
    const rec = okBody({
      content: { parts: [{ thought: true, text: 'secret reasoning' }, { text: '{"a":' }, { text: '1}' }] },
      finishReason: 'STOP',
    })
    const result = await client({ fetch: replay(rec) }).generate(input)
    expect(result.text).toBe('{"a":1}')
  })

  it('reports a candidate stopped for SAFETY as a non-STOP result, not a crash', async () => {
    const result = await client({ fetch: replay(okBody({ finishReason: 'SAFETY' })) }).generate(input)
    expect(result).toEqual({ text: '', finishReason: 'SAFETY', usage: { inputTokens: 10, outputTokens: 5, thinkingTokens: 0 } })
  })

  it('reports a blocked prompt (no candidates) as BLOCKED_<reason>', async () => {
    const rec = { status: 200, body: { promptFeedback: { blockReason: 'SAFETY' } } }
    const result = await client({ fetch: replay(rec) }).generate(input)
    expect(result.finishReason).toBe('BLOCKED_SAFETY')
    expect(result.text).toBe('')
  })

  it('returns usage null when usage metadata is missing (cost code keeps worst case)', async () => {
    const rec = { status: 200, body: { candidates: [{ content: { parts: [{ text: '{}' }] }, finishReason: 'STOP' }] } }
    const result = await client({ fetch: replay(rec) }).generate(input)
    expect(result.usage).toBeNull()
  })

  it('treats a non-JSON 200 (e.g. a proxy HTML page) as a server error', async () => {
    const err = await catchAiError(client({ fetch: replay({ status: 200, body: '<html>oops</html>' }) }).generate(input))
    expect(err.kind).toBe('server')
  })

  it('treats a 200 with a wrong shape as a server error', async () => {
    const rec = { status: 200, body: { candidates: 'nope' } }
    const err = await catchAiError(client({ fetch: replay(rec) }).generate(input))
    expect(err.kind).toBe('server')
  })
})

describe('GeminiClient: failures map to kinds (SPEC §7.3)', () => {
  const googleError = (code: number, status: string, reason?: string) => ({
    status: code,
    body: {
      error: {
        code,
        message: `upstream detail for ${KEY} at projects/123`,
        status,
        ...(reason ? { details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason }] } : {}),
      },
    },
  })

  it.each([
    [429, 'RESOURCE_EXHAUSTED', undefined, 'rate_limited'],
    [500, 'INTERNAL', undefined, 'server'],
    [503, 'UNAVAILABLE', undefined, 'server'],
    [504, 'DEADLINE_EXCEEDED', undefined, 'server'],
    [401, 'UNAUTHENTICATED', undefined, 'auth'],
    [403, 'PERMISSION_DENIED', undefined, 'auth'],
    [400, 'INVALID_ARGUMENT', 'API_KEY_INVALID', 'auth'],
    [400, 'INVALID_ARGUMENT', undefined, 'bad_request'],
    [404, 'NOT_FOUND', undefined, 'bad_request'],
  ] as const)('HTTP %i %s (%s) → %s', async (code, status, reason, kind) => {
    const err = await catchAiError(client({ fetch: replay(googleError(code, status, reason)) }).generate(input))
    expect(err.kind).toBe(kind)
    expect(err.status).toBe(code)
    // Never carry the upstream message or the key.
    expect(err.message).not.toContain(KEY)
    expect(err.message).not.toContain('upstream detail')
    expect(JSON.stringify(err)).not.toContain(KEY)
  })

  it('maps a network failure to network, without the URL', async () => {
    const failing = (async () => {
      throw new TypeError(`fetch failed for https://x?key=${KEY}`)
    }) as typeof fetch
    const err = await catchAiError(client({ fetch: failing }).generate(input))
    expect(err.kind).toBe('network')
    expect(err.message).not.toContain(KEY)
  })

  it('aborts a hung request after timeoutMs and reports timeout', async () => {
    const hang = ((_url: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))
      })) as typeof fetch
    const started = Date.now()
    const err = await catchAiError(client({ fetch: hang, timeoutMs: 30 }).generate(input))
    expect(err.kind).toBe('timeout')
    expect(Date.now() - started).toBeLessThan(500)
  })

  it('honors a caller abort signal (request deadline) as timeout', async () => {
    const hang = ((_url: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))
      })) as typeof fetch
    const controller = new AbortController()
    const p = client({ fetch: hang, timeoutMs: 10_000 }).generate(input, { signal: controller.signal })
    controller.abort()
    const err = await catchAiError(p)
    expect(err.kind).toBe('timeout')
  })
})
