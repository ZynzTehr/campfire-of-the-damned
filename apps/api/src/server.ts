import { randomUUID } from 'node:crypto'
import { serve } from '@hono/node-server'
import { getConnInfo } from '@hono/node-server/conninfo'
import { createGeminiClient } from './ai/geminiClient.ts'
import { buildSystemPrompt } from './ai/systemPrompt.ts'
import { createApp } from './app.ts'
import { ConfigError, loadConfig, worstCaseCallUsd } from './config.ts'
import { CostGate } from './limits/costGate.ts'
import { MemoryLimitStore } from './limits/store.ts'

// Local entry point only. On Vercel, api/index.ts wraps createApp() instead.
// Fail closed (SPEC §8.3): a missing or out-of-range setting stops the server.
let config
try {
  config = loadConfig(process.env)
} catch (err) {
  if (!(err instanceof ConfigError)) throw err
  console.error('[api] Refusing to start. Fix .env (see .env.example):')
  for (const p of err.problems) console.error(`  - ${p}`)
  process.exit(1)
}

// Fresh canary per boot: if it ever appears in output, the prompt leaked.
const canary = `cotd-${randomUUID()}`
const systemPrompt = buildSystemPrompt(canary)

const ai = createGeminiClient({
  apiKey: config.geminiApiKey,
  model: config.geminiModel,
  systemPrompt,
  maxOutputTokens: config.cost.maxOutputTokens,
  // Phase 2 saw 2/16 calls pass 10 s. 2 × 12 s still fits the 25 s request deadline.
  timeoutMs: 12_000,
})

const cost = new CostGate(config.cost, new MemoryLimitStore())
// Socket address locally. On Vercel (Phase 7) the platform-set x-real-ip is used instead.
const clientIp = (c: Parameters<typeof getConnInfo>[0]) => getConnInfo(c).remote.address ?? 'unknown'

const c = config.cost
serve({ fetch: createApp({ ai, cost, clientIp, systemPrompt, canary }).fetch, port: config.port, hostname: '127.0.0.1' }, (info) => {
  console.log(`[api] listening on http://127.0.0.1:${info.port} (model: ${config.geminiModel}, AI ${c.aiEnabled ? 'on' : 'OFF'})`)
  console.log(
    `[api] caps: ${c.appRpmCap}/min ${c.appRpdCap}/day app-wide, ${c.perIpPerMinute}/min ${c.perIpPerHour}/h per IP, ` +
      `${c.maxConcurrentAiCalls} concurrent, $${c.dailyUsdCap}/day $${c.monthlyUsdCap}/month, worst case $${worstCaseCallUsd(c).toFixed(5)}/call`,
  )
})
