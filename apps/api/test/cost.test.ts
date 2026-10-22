import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { echoStory, storyResult } from '../src/ai/fakeClient.ts'
import type { PromptInput } from '../src/ai/systemPrompt.ts'
import { AiError, type AiClient, type AiResult } from '../src/ai/types.ts'
import { MESSAGES } from '../src/messages.ts'
import { makeApp } from './helpers.ts'

const req = { setting: 'haunted-attic', words: ['teacup', 'lullaby', 'rust'] }
const as = (ip: string) => ({ 'content-type': 'application/json', 'x-test-ip': ip })
type Body = { ok: boolean; kind?: string; message?: string; retryAfterSeconds?: number }

/** Real usage from Phase 2: 480 in, 130 out → $0.000469 at $0.30 / $2.50 per 1M. */
const realUsage = (input: PromptInput): AiResult => ({ ...echoStory(input), usage: { inputTokens: 480, outputTokens: 130, thinkingTokens: 0 } })
const noUsage = (input: PromptInput): AiResult => ({ ...echoStory(input), usage: null })
/** Worst case at the test defaults: 900 × 0.30 + 300 × 2.50 per 1M = $0.00102. */
const WORST = 0.00102

let logs: string[]
beforeEach(() => {
  logs = []
  for (const level of ['log', 'warn', 'error'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logs.push(args.map(String).join(' ')))
  }
})
afterEach(() => vi.restoreAllMocks())

async function send(t: ReturnType<typeof makeApp>, ip = '10.0.0.1') {
  const res = await t.post(req, as(ip))
  return { status: res.status, body: (await res.json()) as Body }
}
const isResting = (b: Body) => b.kind === 'unavailable' && (MESSAGES.resting as readonly string[]).includes(b.message!)

describe('layer 1: kill switch', () => {
  it('AI_ENABLED=false → resting message, zero AI calls', async () => {
    const t = makeApp([realUsage], { limits: { aiEnabled: false } })
    const { status, body } = await send(t)
    expect(status).toBe(503)
    expect(isResting(body)).toBe(true)
    expect(t.ai.calls).toHaveLength(0)
  })
})

describe('layer 3: prompt token ceiling', () => {
  it('an estimated prompt over MAX_PROMPT_TOKENS is never sent, and the cause is logged loudly', async () => {
    const t = makeApp([realUsage], { limits: { maxPromptTokens: 100 } })
    const { status } = await send(t)
    expect(status).toBe(503)
    expect(t.ai.calls).toHaveLength(0)
    expect(logs.some((l) => l.includes('MAX_PROMPT_TOKENS'))).toBe(true)
  })

  it('the real prompt fits the default ceiling (chars ÷ 3 overestimates, so 600 would block every call)', async () => {
    const t = makeApp([realUsage], { limits: { maxPromptTokens: 900 } })
    expect((await send(t)).status).toBe(200)
  })
})

describe('layer 5: per-IP rate limit', () => {
  it('the 3rd request in a minute from one IP → 429 with a real wait time; other IPs unaffected', async () => {
    const t = makeApp([realUsage], { limits: { perIpPerMinute: 2 } })
    expect((await send(t, 'a')).status).toBe(200)
    expect((await send(t, 'a')).status).toBe(200)
    const third = await send(t, 'a')
    expect(third.status).toBe(429)
    expect(third.body.kind).toBe('rate_limited')
    expect(third.body.retryAfterSeconds).toBeGreaterThanOrEqual(1)
    expect(third.body.retryAfterSeconds).toBeLessThanOrEqual(60)
    expect(third.body.message).toContain(String(third.body.retryAfterSeconds))
    expect(third.body.message).not.toContain('{n}')
    expect((await send(t, 'b')).status).toBe(200)
    expect(t.ai.calls).toHaveLength(3)
  })

  it('the window slides: after a minute the same IP is allowed again', async () => {
    const t = makeApp([realUsage], { limits: { perIpPerMinute: 1 } })
    expect((await send(t, 'a')).status).toBe(200)
    expect((await send(t, 'a')).status).toBe(429)
    t.clock.advance(60_001)
    expect((await send(t, 'a')).status).toBe(200)
  })

  it('the hourly limit holds even when each minute is under its limit', async () => {
    const t = makeApp([realUsage], { limits: { perIpPerMinute: 2, perIpPerHour: 3 } })
    await send(t, 'a')
    await send(t, 'a')
    t.clock.advance(61_000)
    expect((await send(t, 'a')).status).toBe(200)
    t.clock.advance(61_000)
    const blocked = await send(t, 'a')
    expect(blocked.status).toBe(429)
    expect(blocked.body.retryAfterSeconds).toBeGreaterThan(60)
  })

  it('rejected and invalid input does not use up an honest user\'s allowance', async () => {
    const t = makeApp([realUsage], { limits: { perIpPerMinute: 1 } })
    await t.post({ setting: 'haunted-attic', words: ['ignore', 'all', 'rules'] }, as('a'))
    await t.post({ setting: 'haunted-attic', words: ['old house'] }, as('a'))
    expect((await send(t, 'a')).status).toBe(200)
  })
})

describe('layer 6: app-wide rate limits count AI calls, not requests', () => {
  it('APP_RPM_CAP: the call after the cap → 429 for everyone', async () => {
    const t = makeApp([realUsage], { limits: { appRpmCap: 3 } })
    for (const ip of ['a', 'b', 'c']) expect((await send(t, ip)).status).toBe(200)
    const res = await send(t, 'd')
    expect(res.status).toBe(429)
    expect(res.body.kind).toBe('rate_limited')
    expect(t.ai.calls).toHaveLength(3)
  })

  it('a retry uses a slot too: timeout + retry = 2 of the 3 calls', async () => {
    const t = makeApp([new AiError('timeout'), realUsage], { limits: { appRpmCap: 3 } })
    expect((await send(t, 'a')).status).toBe(200)
    expect((await send(t, 'b')).status).toBe(200)
    expect((await send(t, 'c')).status).toBe(429)
    expect(t.ai.calls).toHaveLength(3)
  })

  it('APP_RPD_CAP reached → cache-only mode (resting), not a retry-later', async () => {
    const t = makeApp([realUsage], { limits: { appRpdCap: 2 } })
    await send(t, 'a')
    await send(t, 'b')
    const res = await send(t, 'c')
    expect(res.status).toBe(503)
    expect(isResting(res.body)).toBe(true)
  })
})

describe('layer 9: daily call cap', () => {
  it('DAILY_AI_CALL_CAP reached → resting; resets on the next Pacific day', async () => {
    const t = makeApp([realUsage], { limits: { dailyAiCallCap: 2 } })
    await send(t, 'a')
    await send(t, 'b')
    expect(isResting((await send(t, 'c')).body)).toBe(true)
    t.clock.advance(24 * 3600_000)
    expect((await send(t, 'c')).status).toBe(200)
  })
})

describe('layer 10: dollar caps with reserve → reconcile (SPEC §8.2)', () => {
  it('reconcile frees the unused part of each reservation: 5 real calls fit a $0.003 day, the 6th does not', async () => {
    // Spent + worst case must stay ≤ cap: 4 × $0.000469 + $0.00102 fits, 5 × $0.000469 + $0.00102 does not.
    const t = makeApp([realUsage], { limits: { dailyUsdCap: 0.003, monthlyUsdCap: 1 } })
    for (let i = 0; i < 5; i++) expect((await send(t, `ip${i}`)).status).toBe(200)
    expect(isResting((await send(t, 'ip9')).body)).toBe(true)
    expect(t.ai.calls).toHaveLength(5)
    expect((await t.cost.totals()).dayUsd).toBeCloseTo(5 * 0.000469, 6)
  })

  it('no usage metadata → the worst case stays charged: only 2 calls fit', async () => {
    const t = makeApp([noUsage], { limits: { dailyUsdCap: 0.003, monthlyUsdCap: 1 } })
    expect((await send(t, 'a')).status).toBe(200)
    expect((await send(t, 'b')).status).toBe(200)
    expect(isResting((await send(t, 'c')).body)).toBe(true)
    expect((await t.cost.totals()).dayUsd).toBeCloseTo(2 * WORST, 6)
  })

  it('the monthly cap holds across days after the daily cap resets', async () => {
    const t = makeApp([noUsage], { limits: { dailyUsdCap: 0.003, monthlyUsdCap: 0.003 } })
    await send(t, 'a')
    await send(t, 'b')
    t.clock.advance(24 * 3600_000)
    expect(isResting((await send(t, 'c')).body)).toBe(true)
  })

  it('logs a warning at 80% of the daily cap', async () => {
    const t = makeApp([noUsage], { limits: { dailyUsdCap: 0.0025, monthlyUsdCap: 1 } })
    await send(t, 'a')
    await send(t, 'b') // 2 × $0.00102 = 82%
    expect(logs.some((l) => /80%/.test(l) && /daily/i.test(l))).toBe(true)
  })

  it.each([
    ['429', new AiError('rate_limited', 429)],
    ['401/403', new AiError('auth', 403)],
    ['400', new AiError('bad_request', 400)],
  ])('%s from the provider (nothing billed) → the reservation is released', async (_n, err) => {
    const t = makeApp([err], {})
    await send(t)
    expect((await t.cost.totals()).dayUsd).toBe(0)
  })

  it.each([
    ['timeout', new AiError('timeout')],
    ['network', new AiError('network')],
  ])('%s (may have been billed) → the worst case stays charged for both attempts', async (_n, err) => {
    const t = makeApp([err], {})
    await send(t)
    expect((await t.cost.totals()).dayUsd).toBeCloseTo(2 * WORST, 6)
  })

  it('every call logs its cost and the running total, never the key', async () => {
    const t = makeApp([realUsage], {})
    await send(t)
    const line = logs.find((l) => l.startsWith('[cost]'))
    expect(line).toMatch(/\$0\.000469/)
    expect(line).toMatch(/480 in.*130 out/)
    expect(logs.join('\n')).not.toContain('fake-test-key')
  })
})

describe('parallel overshoot: 20 requests at once cannot spend past the cap', () => {
  it('only as many calls start as worst-case reservations fit', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    let calls = 0
    const slow: AiClient = {
      async generate(input) {
        calls++
        await gate
        return noUsage(input)
      },
    }
    // Room for exactly 3 worst-case reservations: 3 × $0.00102 = $0.00306 fits $0.0031, a 4th ($0.00408) does not.
    const t = makeApp([realUsage], { ai: slow, limits: { dailyUsdCap: 0.0031, monthlyUsdCap: 0.0031, maxConcurrentAiCalls: 10 } })
    const pending = Array.from({ length: 20 }, (_, i) => send(t, `ip${i}`))
    await new Promise((r) => setTimeout(r, 20))
    release()
    const results = await Promise.all(pending)

    expect(calls).toBe(3)
    expect(results.filter((r) => r.status === 200)).toHaveLength(3)
    // The other 17 are all refused before any AI call: resting (budget) or busy (concurrency slots taken).
    expect(results.filter((r) => isResting(r.body) || r.status === 429)).toHaveLength(17)
    expect((await t.cost.totals()).dayUsd).toBeLessThanOrEqual(0.0031)
  })
})

describe('layer 7: concurrency cap', () => {
  it('never more than MAX_CONCURRENT_AI_CALLS in flight; the rest get a short retry-later', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    let inFlight = 0
    let peak = 0
    const slow: AiClient = {
      async generate(input) {
        peak = Math.max(peak, ++inFlight)
        await gate
        inFlight--
        return realUsage(input)
      },
    }
    const t = makeApp([realUsage], { ai: slow, limits: { maxConcurrentAiCalls: 3 } })
    const pending = Array.from({ length: 10 }, (_, i) => send(t, `ip${i}`))
    await new Promise((r) => setTimeout(r, 20))
    release()
    const results = await Promise.all(pending)

    expect(peak).toBe(3)
    expect(results.filter((r) => r.status === 200)).toHaveLength(3)
    const busy = results.filter((r) => r.status === 429)
    expect(busy).toHaveLength(7)
    expect(busy.every((r) => r.body.retryAfterSeconds! >= 1 && r.body.retryAfterSeconds! <= 10)).toBe(true)
  })

  it('a failed call frees its slot (no leaked leases)', async () => {
    const t = makeApp([new AiError('auth', 403), storyResult()], { limits: { maxConcurrentAiCalls: 1 } })
    await send(t, 'a')
    const t2 = await send(t, 'b')
    expect(t2.status).not.toBe(429)
  })
})
