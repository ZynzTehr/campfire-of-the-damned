import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vite-plus/test'
import { MemoryLimitStore, type LimitStore, type Reservation } from '../src/limits/store.ts'
import { NeonLimitStore } from '../src/limits/neonStore.ts'
import { migrate } from '../src/migrate.ts'

/**
 * One contract, two stores (SPEC §9 rule 7, §14 phase 5). The memory store always runs.
 * The Neon store runs against the dedicated "test" branch when TEST_DATABASE_URL is in .env,
 * never against production. Each test uses fresh keys/days, so runs don't collide.
 */
function contract(name: string, make: () => LimitStore, opts: { reset?: () => Promise<unknown>; timeout?: number } = {}) {
  const { reset, timeout } = opts
  describe(`LimitStore contract: ${name}`, { timeout }, () => {
    if (reset) beforeEach(async () => { await reset() })
    const u = () => randomUUID().slice(0, 8)
    const res = (over: Partial<Reservation> = {}): Reservation => ({
      id: `r-${u()}`,
      microUsd: 1_000,
      day: `d-${u()}`,
      month: `m-${u()}`,
      dailyCallCap: 100,
      dailyMicroUsdCap: 1_000_000,
      monthlyMicroUsdCap: 10_000_000,
      ...over,
    })

    it('hit: allows max hits in the window, then refuses with the wait until the oldest expires', async () => {
      const s = make()
      const key = `k-${u()}`
      for (let i = 0; i < 3; i++) expect((await s.hit(key, 3, 60_000, 1_000 + i)).ok).toBe(true)
      const r = await s.hit(key, 3, 60_000, 11_000)
      expect(r).toEqual({ ok: false, retryAfterMs: 50_000 }) // oldest at 1000 frees at 61000
    })

    it('hit: the window slides, and keys are independent', async () => {
      const s = make()
      const key = `k-${u()}`
      expect((await s.hit(key, 1, 1_000, 0)).ok).toBe(true)
      expect((await s.hit(key, 1, 1_000, 500)).ok).toBe(false)
      expect((await s.hit(`${key}-other`, 1, 1_000, 500)).ok).toBe(true)
      expect((await s.hit(key, 1, 1_000, 1_000)).ok).toBe(true)
    })

    it('hit: a refused hit is not counted', async () => {
      const s = make()
      const key = `k-${u()}`
      await s.hit(key, 1, 1_000, 0)
      for (let i = 0; i < 5; i++) await s.hit(key, 1, 1_000, 100 + i)
      expect((await s.hit(key, 1, 1_000, 1_000)).ok).toBe(true)
    })

    it('reserve: counts calls and holds money; totals see both', async () => {
      const s = make()
      const r = res({ microUsd: 700 })
      expect(await s.reserve(r)).toEqual({ ok: true })
      expect(await s.totals(r.day, r.month)).toEqual({ dayMicroUsd: 700, monthMicroUsd: 700, dayCalls: 1 })
    })

    it('reserve: refuses at each cap, with the reason', async () => {
      const s = make()
      const day = `d-${u()}`
      const month = `m-${u()}`
      expect(await s.reserve(res({ day, month, dailyCallCap: 1 }))).toEqual({ ok: true })
      expect(await s.reserve(res({ day, month, dailyCallCap: 1 }))).toEqual({ ok: false, reason: 'daily_calls' })
      expect(await s.reserve(res({ microUsd: 2_000, dailyMicroUsdCap: 1_999 }))).toEqual({ ok: false, reason: 'daily_usd' })
      expect(await s.reserve(res({ microUsd: 2_000, monthlyMicroUsdCap: 1_999 }))).toEqual({ ok: false, reason: 'monthly_usd' })
    })

    it('reserve: a refused reservation changes nothing', async () => {
      const s = make()
      const r = res({ microUsd: 5_000, dailyMicroUsdCap: 4_999 })
      await s.reserve(r)
      expect(await s.totals(r.day, r.month)).toEqual({ dayMicroUsd: 0, monthMicroUsd: 0, dayCalls: 0 })
    })

    it('settle: replaces the hold with the real cost, once; unknown ids are ignored', async () => {
      const s = make()
      const r = res({ microUsd: 1_000 })
      await s.reserve(r)
      await s.settle(r.id, 400)
      await s.settle(r.id, 400) // second settle must not subtract again
      await s.settle('never-reserved', 0)
      expect(await s.totals(r.day, r.month)).toEqual({ dayMicroUsd: 400, monthMicroUsd: 400, dayCalls: 1 })
    })

    it('settle with 0 (nothing billed) releases the money but keeps the call count', async () => {
      const s = make()
      const r = res({ microUsd: 1_000 })
      await s.reserve(r)
      await s.settle(r.id, 0)
      expect(await s.totals(r.day, r.month)).toEqual({ dayMicroUsd: 0, monthMicroUsd: 0, dayCalls: 1 })
    })

    it('reserve: the month spans days', async () => {
      const s = make()
      const month = `m-${u()}`
      await s.reserve(res({ month, microUsd: 600 }))
      expect(await s.reserve(res({ month, microUsd: 600, monthlyMicroUsdCap: 1_000 }))).toEqual({ ok: false, reason: 'monthly_usd' })
    })

    it('reserve: 20 in parallel against a cap that fits 3 → exactly 3 succeed, spend never passes the cap', async () => {
      const s = make()
      const day = `d-${u()}`
      const month = `m-${u()}`
      const results = await Promise.all(
        Array.from({ length: 20 }, () => s.reserve(res({ day, month, microUsd: 1_000, dailyMicroUsdCap: 3_500 }))),
      )
      expect(results.filter((r) => r.ok)).toHaveLength(3)
      expect((await s.totals(day, month)).dayMicroUsd).toBe(3_000)
    })

    it('hit: 20 in parallel with max 5 → exactly 5 succeed', async () => {
      const s = make()
      const key = `k-${u()}`
      const results = await Promise.all(Array.from({ length: 20 }, (_, i) => s.hit(key, 5, 60_000, 1_000 + i)))
      expect(results.filter((r) => r.ok)).toHaveLength(5)
    })

    // Lease tests count every live lease in the store, so each test starts from a clean slate (the reset hook).
    it('leases: at most max at once; release and expiry free a slot', async () => {
      const s = make()
      expect(await s.acquireLease('a', 2, 1_000, 0)).toBe(true)
      expect(await s.acquireLease('b', 2, 1_000, 0)).toBe(true)
      expect(await s.acquireLease('c', 2, 1_000, 10)).toBe(false)
      await s.releaseLease('a')
      expect(await s.acquireLease('c', 2, 1_000, 20)).toBe(true)
      expect(await s.acquireLease('d', 2, 1_000, 30)).toBe(false)
      expect(await s.acquireLease('d', 2, 1_000, 1_000)).toBe(true) // b expired at 1000
    })

    it('leases: 10 in parallel with max 3 → exactly 3 succeed', async () => {
      const s = make()
      const results = await Promise.all(Array.from({ length: 10 }, (_, i) => s.acquireLease(`p-${i}`, 3, 60_000, 5_000)))
      expect(results.filter(Boolean)).toHaveLength(3)
    })
  })
}

contract('memory', () => new MemoryLimitStore())

// ---- Neon (test branch only) ----
function testDbUrls(): { pooled?: string; unpooled?: string; production?: string } {
  const file = new URL('../../../.env', import.meta.url)
  const env = { ...(existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {}), ...process.env }
  return { pooled: env.TEST_DATABASE_URL, unpooled: env.TEST_DATABASE_URL_UNPOOLED, production: env.DATABASE_URL }
}
const urls = testDbUrls()
const realFetch = globalThis.fetch

describe.skipIf(!urls.pooled || !urls.unpooled)('Neon test branch', () => {
  let pool: pg.Pool
  beforeAll(async () => {
    await migrate(urls.unpooled!, () => {})
    pool = new pg.Pool({ connectionString: urls.pooled!, max: 10 })
  }, 60_000)
  afterAll(async () => {
    await pool?.end()
    globalThis.fetch = realFetch
  })

  // Leases are global; wipe them before each test so lease tests start empty. Safe: this is the test branch.
  // Longer timeout: every query crosses the internet from a laptop (about 30 ms a round trip).
  contract('neon', () => new NeonLimitStore(pool), { reset: () => pool.query('DELETE FROM leases'), timeout: 20_000 })

  it('runs against the test branch, not the production database', () => {
    expect(urls.pooled).not.toBe(urls.production)
    expect(urls.unpooled).not.toBe(urls.production)
  })
})
