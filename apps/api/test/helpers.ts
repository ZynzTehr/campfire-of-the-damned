import { buildSystemPrompt } from '../src/ai/systemPrompt.ts'
import { echoStory, FakeAiClient, type FakeStep } from '../src/ai/fakeClient.ts'
import { createApp, type AppDeps } from '../src/app.ts'
import type { CostConfig } from '../src/config.ts'
import { CostGate } from '../src/limits/costGate.ts'
import { MemoryLimitStore } from '../src/limits/store.ts'

export const TEST_CANARY = 'cotd-test-canary-7f3a'
export const TEST_SYSTEM_PROMPT = buildSystemPrompt(TEST_CANARY)

/** Generous limits so non-cost tests never trip a cap. Cost tests override single fields. */
export const TEST_COST: CostConfig = {
  aiEnabled: true,
  priceInputPerM: 0.3,
  priceOutputPerM: 2.5,
  maxPromptTokens: 900,
  maxOutputTokens: 300,
  maxConcurrentAiCalls: 10,
  appRpmCap: 10_000,
  appRpdCap: 100_000,
  perIpPerMinute: 1_000,
  perIpPerHour: 10_000,
  dailyAiCallCap: 100_000,
  dailyUsdCap: 25,
  monthlyUsdCap: 100,
  degradedAiCallsPerHour: 20,
}

/** Noon Pacific on Oct 10: far from a day or month boundary. */
const START = Date.parse('2026-10-10T19:00:00Z')

type Overrides = Partial<AppDeps> & { limits?: Partial<CostConfig> }

/** App wired with a FakeAiClient, a memory limit store and a manual clock. No network, no real sleep. */
export function makeApp(steps: FakeStep[] = [echoStory], overrides: Overrides = {}) {
  const { limits, ...depOverrides } = overrides
  const ai = new FakeAiClient(...steps)
  const sleeps: number[] = []
  let t = START
  const clock = { now: () => t, advance: (ms: number) => void (t += ms) }
  let n = 0
  const cost = new CostGate({ ...TEST_COST, ...limits }, new MemoryLimitStore(), clock.now, () => `call-${++n}`)
  const app = createApp({
    ai,
    cost,
    clientIp: (c) => c.req.header('x-test-ip') ?? '127.0.0.1',
    canary: TEST_CANARY,
    systemPrompt: TEST_SYSTEM_PROMPT,
    newId: () => 'story-id-1',
    sleep: async (ms) => {
      sleeps.push(ms)
    },
    ...depOverrides,
  })
  const post = (body: unknown, headers: Record<string, string> = { 'content-type': 'application/json' }) =>
    app.request('/api/story', {
      method: 'POST',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  return { app, ai, post, sleeps, clock, cost }
}

export type ErrorBody = { ok: false; kind: string; message: string }
