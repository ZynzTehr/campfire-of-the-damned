import { buildSystemPrompt } from '../src/ai/systemPrompt.ts'
import { echoStory, FakeAiClient, type FakeStep } from '../src/ai/fakeClient.ts'
import { createApp, type AppDeps } from '../src/app.ts'

export const TEST_CANARY = 'cotd-test-canary-7f3a'
export const TEST_SYSTEM_PROMPT = buildSystemPrompt(TEST_CANARY)

/** App wired with a FakeAiClient. No network, no real sleep. */
export function makeApp(steps: FakeStep[] = [echoStory], overrides: Partial<AppDeps> = {}) {
  const ai = new FakeAiClient(...steps)
  const sleeps: number[] = []
  const app = createApp({
    ai,
    canary: TEST_CANARY,
    systemPrompt: TEST_SYSTEM_PROMPT,
    newId: () => 'story-id-1',
    sleep: async (ms) => {
      sleeps.push(ms)
    },
    ...overrides,
  })
  const post = (body: unknown, headers: Record<string, string> = { 'content-type': 'application/json' }) =>
    app.request('/api/story', {
      method: 'POST',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  return { app, ai, post, sleeps }
}

export type ErrorBody = { ok: false; kind: string; message: string }
