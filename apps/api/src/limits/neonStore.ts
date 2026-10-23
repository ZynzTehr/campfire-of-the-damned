import { tx, type Db } from '../db.ts'
import type { LimitStore, Reservation } from './store.ts'

/**
 * The shared LimitStore (SPEC §8.2): every Vercel instance reads and writes the same Neon rows,
 * so rate limits, the budget and concurrency hold across instances.
 * Each method is one transaction. Check-then-write steps hold a lock until commit (an advisory lock, or the budget row lock),
 * so two instances can't both pass a check that only one should pass. Advisory xact locks work
 * through Neon's pooled (PgBouncer transaction mode) URL.
 * bigint columns come back from pg as strings, hence the Number() calls.
 */
export class NeonLimitStore implements LimitStore {
  private readonly db: Db

  constructor(db: Db) {
    this.db = db
  }

  hit(key: string, max: number, windowMs: number, now: number) {
    return tx(this.db, async (q) => {
      await q.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`cotd:hit:${key}`])
      // Count only hits inside the window; the CTE deletes the expired ones in the same round trip.
      const { rows } = await q.query<{ n: number; oldest: string | null }>(
        `WITH expired AS (DELETE FROM rate_hits WHERE key = $1 AND at <= $2)
         SELECT count(*)::int AS n, min(at) AS oldest FROM rate_hits WHERE key = $1 AND at > $2`,
        [key, now - windowMs],
      )
      const { n, oldest } = rows[0]!
      if (n >= max) return { ok: false as const, retryAfterMs: Number(oldest) + windowMs - now }
      await q.query('INSERT INTO rate_hits (key, at) VALUES ($1, $2)', [key, now])
      return { ok: true as const }
    })
  }

  reserve(r: Reservation) {
    return tx(this.db, async (q) => {
      // The upserts lock the day row, then the month row, until commit, so parallel reserves for
      // the same day queue here and each sees the totals the previous one committed.
      // settle takes the same rows in the same order, so the two cannot deadlock.
      const day = (
        await q.query<{ calls: number; micro_usd: string }>(
          'INSERT INTO usage_day (day) VALUES ($1) ON CONFLICT (day) DO UPDATE SET day = EXCLUDED.day RETURNING calls, micro_usd',
          [r.day],
        )
      ).rows[0]!
      const month = (
        await q.query<{ micro_usd: string }>(
          'INSERT INTO usage_month (month) VALUES ($1) ON CONFLICT (month) DO UPDATE SET month = EXCLUDED.month RETURNING micro_usd',
          [r.month],
        )
      ).rows[0]!
      if (day.calls + 1 > r.dailyCallCap) return { ok: false as const, reason: 'daily_calls' as const }
      if (Number(day.micro_usd) + r.microUsd > r.dailyMicroUsdCap) return { ok: false as const, reason: 'daily_usd' as const }
      if (Number(month.micro_usd) + r.microUsd > r.monthlyMicroUsdCap) return { ok: false as const, reason: 'monthly_usd' as const }
      await q.query(
        `WITH d AS (UPDATE usage_day SET calls = calls + 1, micro_usd = micro_usd + $2 WHERE day = $3),
              m AS (UPDATE usage_month SET micro_usd = micro_usd + $2 WHERE month = $4)
         INSERT INTO reservations (id, micro_usd, day, month) VALUES ($1, $2, $3, $4)`,
        [r.id, r.microUsd, r.day, r.month],
      )
      return { ok: true as const }
    })
  }

  async settle(id: string, actualMicroUsd: number) {
    await tx(this.db, async (q) => {
      // DELETE … RETURNING makes settle happen once: a second settle finds no row.
      const { rows } = await q.query<{ micro_usd: string; day: string; month: string }>(
        'DELETE FROM reservations WHERE id = $1 RETURNING micro_usd, day, month',
        [id],
      )
      const held = rows[0]
      if (!held) return
      const delta = actualMicroUsd - Number(held.micro_usd)
      // Same lock order as reserve (day row, then month row), so the two can't deadlock.
      await q.query('UPDATE usage_day SET micro_usd = micro_usd + $2 WHERE day = $1', [held.day, delta])
      await q.query('UPDATE usage_month SET micro_usd = micro_usd + $2 WHERE month = $1', [held.month, delta])
    })
  }

  acquireLease(id: string, max: number, ttlMs: number, now: number) {
    return tx(this.db, async (q) => {
      await q.query("SELECT pg_advisory_xact_lock(hashtext('cotd:leases'))")
      await q.query('DELETE FROM leases WHERE expires_at <= $1', [now])
      const { rows } = await q.query<{ n: number }>('SELECT count(*)::int AS n FROM leases')
      if (rows[0]!.n >= max) return false
      await q.query(
        'INSERT INTO leases (id, expires_at) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET expires_at = EXCLUDED.expires_at',
        [id, now + ttlMs],
      )
      return true
    })
  }

  async releaseLease(id: string) {
    await this.db.query('DELETE FROM leases WHERE id = $1', [id])
  }

  async totals(day: string, month: string) {
    const d = (await this.db.query<{ calls: number; micro_usd: string }>('SELECT calls, micro_usd FROM usage_day WHERE day = $1', [day])).rows[0]
    const m = (await this.db.query<{ micro_usd: string }>('SELECT micro_usd FROM usage_month WHERE month = $1', [month])).rows[0]
    return { dayMicroUsd: Number(d?.micro_usd ?? 0), monthMicroUsd: Number(m?.micro_usd ?? 0), dayCalls: d?.calls ?? 0 }
  }
}
