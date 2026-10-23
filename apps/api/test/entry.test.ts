import { describe, expect, it } from 'vite-plus/test'
import type { ConfigError } from '../src/config.ts'
import { MESSAGES } from '../src/messages.ts'
import { buildApi, createVercelApp, vercelIp } from '../src/wire.ts'
import { VALID_ENV } from './env.ts'

// The two entry points (local server.ts and the Vercel function) share buildApi().
// AI_ENABLED=false keeps every test offline: requests stop at the kill switch.
const OFF = { ...VALID_ENV, AI_ENABLED: 'false' }
const story = (ip?: string) =>
  new Request('http://x/api/story', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(ip ? { 'x-real-ip': ip } : {}) },
    body: JSON.stringify({ setting: 'haunted-attic', language: 'en', words: ['lantern'] }),
  })
const ctx = (headers: Record<string, string>) => ({ req: { header: (k: string) => headers[k.toLowerCase()] } }) as never

describe('buildApi', () => {
  it('builds a working app from a valid env', async () => {
    const { app } = buildApi(OFF, { socketIp: () => '127.0.0.1' })
    const res = await app.request('/api/health')
    expect(res.status).toBe(200)
  })

  it('throws the config problems instead of starting half-configured', () => {
    let problems: string[] = []
    try {
      buildApi({ ...OFF, DAILY_USD_CAP: '' }, { socketIp: () => 'x' })
    } catch (err) {
      problems = (err as ConfigError).problems
    }
    expect(problems.join('\n')).toMatch(/DAILY_USD_CAP/)
  })

  it('IP_SOURCE=vercel keys the per-IP limit on x-real-ip, not the socket', async () => {
    const { app } = buildApi({ ...OFF, IP_SOURCE: 'vercel' }, { socketIp: () => 'same-proxy' })
    for (let i = 0; i < 5; i++) expect((await app.fetch(story('1.1.1.1'))).status).toBe(503) // resting, counted
    expect((await app.fetch(story('1.1.1.1'))).status).toBe(429)
    expect((await app.fetch(story('2.2.2.2'))).status).toBe(503) // a different visitor is unaffected
  })

  it('IP_SOURCE=socket ignores a client-sent x-real-ip (it would be spoofable locally)', async () => {
    const { app } = buildApi(OFF, { socketIp: () => 'same-socket' })
    for (let i = 0; i < 5; i++) await app.fetch(story(`10.0.0.${i}`))
    expect((await app.fetch(story('10.0.0.99'))).status).toBe(429)
  })
})

describe('vercelIp', () => {
  it('uses the platform-set x-real-ip', () => {
    expect(vercelIp(ctx({ 'x-real-ip': ' 203.0.113.7 ' }))).toBe('203.0.113.7')
  })
  it('never trusts x-forwarded-for, and shares one bucket when the header is missing', () => {
    expect(vercelIp(ctx({ 'x-forwarded-for': '6.6.6.6' }))).toBe('unknown')
    expect(vercelIp(ctx({}))).toBe('unknown')
  })
})

describe('createVercelApp (the deployed function)', () => {
  it('serves the API when config is valid', async () => {
    const app = createVercelApp({ ...OFF, IP_SOURCE: 'vercel' })
    expect((await app.request('/api/health')).status).toBe(200)
  })

  it('fails closed with the polite resting message, never the config problems', async () => {
    const logs: string[] = []
    const app = createVercelApp({ ...OFF, VERCEL: '1', STORE: 'memory' }, (line) => logs.push(line))
    const res = await app.fetch(story('1.1.1.1'))
    expect(res.status).toBe(503)
    const body = (await res.json()) as { ok: boolean; kind: string; message: string }
    expect(body.ok).toBe(false)
    expect(body.kind).toBe('unavailable')
    expect(MESSAGES.resting).toContain(body.message)
    expect(JSON.stringify(body)).not.toMatch(/STORE|IP_SOURCE|neon/i)
    expect((await app.request('/api/health')).status).toBe(503)
    expect(logs.join('\n')).toMatch(/STORE/) // the operator still sees why, in the function logs
  })

  it('never logs secret values while failing closed', () => {
    const logs: string[] = []
    createVercelApp({ ...OFF, VERCEL: '1', GEMINI_API_KEY: 'sekrit-key-123' }, (line) => logs.push(line))
    expect(logs.join('\n')).not.toContain('sekrit-key-123')
  })
})

describe('store wiring (SPEC §8.2)', () => {
  // Port 1 on localhost: nothing listens, and the pool only connects on its first query anyway.
  const NEON = { ...OFF, STORE: 'neon', DATABASE_URL: 'postgresql://127.0.0.1:1/db' }

  it('STORE=neon builds a Neon pool for the limits; STORE=memory builds none', async () => {
    const neon = buildApi(NEON, { socketIp: () => 'x' })
    expect(neon.pool).toBeDefined()
    expect(neon.config.store).toBe('neon')
    await neon.pool!.end()
    expect(buildApi(OFF, { socketIp: () => 'x' }).pool).toBeUndefined()
  })

  it('the Vercel function hands the Neon pool to attachDatabasePool, once', async () => {
    const attached: unknown[] = []
    const app = createVercelApp({ ...NEON, IP_SOURCE: 'vercel' }, () => {}, (p) => attached.push(p))
    expect(attached).toHaveLength(1)
    expect((await app.request('/api/health')).status).toBe(200)
    await (attached[0] as { end: () => Promise<void> }).end()
  })

  it('with the memory store there is no pool to attach', () => {
    const attached: unknown[] = []
    createVercelApp({ ...OFF, IP_SOURCE: 'vercel' }, () => {}, (p) => attached.push(p))
    expect(attached).toHaveLength(0)
  })
})
