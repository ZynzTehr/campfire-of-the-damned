import { randomUUID } from 'node:crypto'
import { attachDatabasePool } from '@vercel/functions'
import { Hono, type Context } from 'hono'
import type pg from 'pg'
import { createGeminiClient } from './ai/geminiClient.ts'
import { buildSystemPrompt } from './ai/systemPrompt.ts'
import { createApp } from './app.ts'
import { ConfigError, loadConfig, type Config } from './config.ts'
import { createPool } from './db.ts'
import { CostGate } from './limits/costGate.ts'
import { NeonLimitStore } from './limits/neonStore.ts'
import { MemoryLimitStore } from './limits/store.ts'
import { pickMessage } from './messages.ts'

type Env = Record<string, string | undefined>

/**
 * Wires the real dependencies into createApp(). Shared by both entry points:
 * server.ts (local Node server) and vercel.ts (the deployed function).
 * Throws ConfigError when a setting is missing or out of range (SPEC §8.3).
 * Returns the Neon pool when STORE=neon, so the Vercel entry can hand it to attachDatabasePool.
 */
export function buildApi(
  env: Env,
  opts: { socketIp: (c: Context) => string },
): { app: ReturnType<typeof createApp>; config: Config; pool?: pg.Pool } {
  const config = loadConfig(env)

  // Fresh canary per boot (per instance on Vercel): if it ever appears in output, the prompt leaked.
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

  // Neon: limits shared by every instance (required on Vercel). Memory: tests and local dev only.
  // The pool connects lazily, on the first query.
  const pool = config.store === 'neon' ? createPool(config.databaseUrl!) : undefined
  const cost = new CostGate(config.cost, pool ? new NeonLimitStore(pool) : new MemoryLimitStore())
  const clientIp = config.ipSource === 'vercel' ? vercelIp : opts.socketIp
  return { app: createApp({ ai, cost, clientIp, systemPrompt, canary }), config, ...(pool ? { pool } : {}) }
}

/**
 * Client IP on Vercel: x-real-ip is set by the platform and can't be forged by the client.
 * x-forwarded-for is never read. With no header, all such requests share one bucket (fail closed).
 */
export function vercelIp(c: Context): string {
  return c.req.header('x-real-ip')?.trim() || 'unknown'
}

/**
 * The deployed function's app. A bad config must not crash every request with a raw 500:
 * it answers every /api route with the polite resting message and logs the problem
 * names (never values) for the operator.
 */
export function createVercelApp(
  env: Env,
  log: (line: string) => void = console.error,
  attachPool: (pool: pg.Pool) => void = attachDatabasePool,
) {
  try {
    // No socket on Vercel; config requires IP_SOURCE=vercel there, so this is never used.
    const { app, pool } = buildApi(env, { socketIp: () => 'unknown' })
    // Fluid compute: lets Vercel close idle connections before an instance is suspended (Neon guide).
    if (pool) attachPool(pool)
    return app
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err
    log('[api] Misconfigured; answering every request with "resting". Fix these in Vercel env settings:')
    for (const p of err.problems) log(`  - ${p}`)
    const app = new Hono().basePath('/api')
    app.all('*', (c) => c.json({ ok: false, kind: 'unavailable', message: pickMessage('resting') }, 503))
    return app
  }
}
