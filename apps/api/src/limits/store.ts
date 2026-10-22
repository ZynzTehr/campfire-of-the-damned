/**
 * Everything a limit needs to remember between requests (SPEC §8.2).
 * Each method is one atomic step, so parallel requests can't both pass a check
 * that only one should pass. Memory store: tests and local dev only.
 * Phase 5 adds a Neon store with the same interface (required on Vercel).
 * Money is integer micro-dollars (µUSD) so sums never drift.
 */
export interface LimitStore {
  /** Sliding window: record a hit, or refuse with how long until a slot frees up. */
  hit(key: string, max: number, windowMs: number, now: number): Promise<{ ok: true } | { ok: false; retryAfterMs: number }>
  /** Count a call and hold its worst-case cost, unless that would pass a cap. */
  reserve(r: Reservation): Promise<{ ok: true } | { ok: false; reason: 'daily_calls' | 'daily_usd' | 'monthly_usd' }>
  /** Replace a reservation with the real cost (0 = nothing billed). */
  settle(id: string, actualMicroUsd: number): Promise<void>
  /** Take a concurrency slot. Leases expire after ttlMs so a crashed request can't hold one forever. */
  acquireLease(id: string, max: number, ttlMs: number, now: number): Promise<boolean>
  releaseLease(id: string): Promise<void>
  totals(day: string, month: string): Promise<{ dayMicroUsd: number; monthMicroUsd: number; dayCalls: number }>
}

export interface Reservation {
  id: string
  microUsd: number
  day: string
  month: string
  dailyCallCap: number
  dailyMicroUsdCap: number
  monthlyMicroUsdCap: number
}

export class MemoryLimitStore implements LimitStore {
  private readonly windows = new Map<string, number[]>()
  private readonly dayUsd = new Map<string, number>()
  private readonly monthUsd = new Map<string, number>()
  private readonly dayCalls = new Map<string, number>()
  private readonly held = new Map<string, { microUsd: number; day: string; month: string }>()
  private readonly leases = new Map<string, number>()

  async hit(key: string, max: number, windowMs: number, now: number) {
    const hits = (this.windows.get(key) ?? []).filter((t) => t > now - windowMs)
    if (hits.length >= max) {
      this.windows.set(key, hits)
      return { ok: false as const, retryAfterMs: hits[0]! + windowMs - now }
    }
    hits.push(now)
    this.windows.set(key, hits)
    return { ok: true as const }
  }

  async reserve(r: Reservation) {
    const calls = this.dayCalls.get(r.day) ?? 0
    const day = this.dayUsd.get(r.day) ?? 0
    const month = this.monthUsd.get(r.month) ?? 0
    if (calls + 1 > r.dailyCallCap) return { ok: false as const, reason: 'daily_calls' as const }
    if (day + r.microUsd > r.dailyMicroUsdCap) return { ok: false as const, reason: 'daily_usd' as const }
    if (month + r.microUsd > r.monthlyMicroUsdCap) return { ok: false as const, reason: 'monthly_usd' as const }
    this.dayCalls.set(r.day, calls + 1)
    this.dayUsd.set(r.day, day + r.microUsd)
    this.monthUsd.set(r.month, month + r.microUsd)
    this.held.set(r.id, { microUsd: r.microUsd, day: r.day, month: r.month })
    return { ok: true as const }
  }

  async settle(id: string, actualMicroUsd: number) {
    const h = this.held.get(id)
    if (!h) return
    this.held.delete(id)
    const delta = actualMicroUsd - h.microUsd
    this.dayUsd.set(h.day, (this.dayUsd.get(h.day) ?? 0) + delta)
    this.monthUsd.set(h.month, (this.monthUsd.get(h.month) ?? 0) + delta)
  }

  async acquireLease(id: string, max: number, ttlMs: number, now: number) {
    for (const [k, expires] of this.leases) if (expires <= now) this.leases.delete(k)
    if (this.leases.size >= max) return false
    this.leases.set(id, now + ttlMs)
    return true
  }

  async releaseLease(id: string) {
    this.leases.delete(id)
  }

  async totals(day: string, month: string) {
    return { dayMicroUsd: this.dayUsd.get(day) ?? 0, monthMicroUsd: this.monthUsd.get(month) ?? 0, dayCalls: this.dayCalls.get(day) ?? 0 }
  }
}
