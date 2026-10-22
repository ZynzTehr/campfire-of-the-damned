import { randomUUID } from 'node:crypto'
import { serve } from '@hono/node-server'
import { createGeminiClient } from './ai/geminiClient.ts'
import { buildSystemPrompt } from './ai/systemPrompt.ts'
import { createApp } from './app.ts'

// Local entry point only. On Vercel, api/index.ts wraps createApp() instead.
// Phase 4 replaces these reads with full fail-closed config validation (SPEC §8.3).
const apiKey = process.env.GEMINI_API_KEY
const model = process.env.GEMINI_MODEL
if (!apiKey || !model) {
  console.error('[api] GEMINI_API_KEY and GEMINI_MODEL must be set (see .env.example). Refusing to start.')
  process.exit(1)
}

// Fresh canary per boot: if it ever appears in output, the prompt leaked.
const canary = `cotd-${randomUUID()}`
const systemPrompt = buildSystemPrompt(canary)

const ai = createGeminiClient({
  apiKey,
  model,
  systemPrompt,
  maxOutputTokens: 300,
  // Phase 2 saw 2/16 calls pass 10 s. 2 × 12 s still fits the 25 s request deadline.
  timeoutMs: 12_000,
})

const port = Number(process.env.PORT ?? 8787)
serve({ fetch: createApp({ ai, systemPrompt, canary }).fetch, port, hostname: '127.0.0.1' }, (info) => {
  console.log(`[api] listening on http://127.0.0.1:${info.port} (model: ${model})`)
})
