import type { AiUsage } from '../ai/types.ts'
import { worstCaseCallUsd, type CostConfig } from '../config.ts'
import type { LimitStore } from './store.ts'

/**
 * Every cost layer of SPEC §8.1 in one place, cheapest check first.
 * The app asks allowClient() once per request and beginCall()/endCall()
 * around every AI call, so retries and regenerations are counted too.
 */
export type CallRefusal =
  /** Cache-only mode: stays true for a while (kill switch, daily/monthly caps). */
  | { ok: false; mode: 'resting'; reason: 'kill_switch' | 'prompt_too_large' | 'app_rpd' | 'daily_calls' | 'daily_usd' | 'monthly_usd' }
  /** Short-lived: try again in a few seconds. */
  | { ok: false; mode: 'busy'; reason: 'app_rpm' | 'concurrency'; retryAfterSeconds: number }

export interface CallTicket {
  id: string
  reservedMicroUsd: number
}

/** Errors where the provider answered with an error status: nothing was billed. */
const NOT_BILLED = new Set(['rate_limited', 'auth', 'bad_request', 'server'])
const MINUTE = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000
const LEASE_TTL_MS = 30_000
const toMicro = (usd: number) => Math.ceil(usd * 1_000_000 - 1e-6)

/** Google's daily quota resets at midnight Pacific, so our day does too. */
const pacificDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' })

export class CostGate {
  private readonly cfg: CostConfig
  private readonly store: LimitStore
  private readonly now: () => number
  private readonly newId: () => string

  // Plain fields, not parameter properties: Node strips types but can't run TS-only syntax.
  constructor(cfg: CostConfig, store: LimitStore, now: () => number = Date.now, newId: () => string = () => crypto.randomUUID()) {
    this.cfg = cfg
    this.store = store
    this.now = now
    this.newId = newId
  }

  /** Layer 5: per-IP sliding windows. Called once per valid request. */
  async allowClient(ip: string): Promise<{ ok: true } | { ok: false; retryAfterSeconds: number }> {
    const now = this.now()
    for (const [name, max, windowMs] of [['m', this.cfg.perIpPerMinute, MINUTE], ['h', this.cfg.perIpPerHour, HOUR]] as const) {
      const r = await this.store.hit(`ip:${name}:${ip}`, max, windowMs, now)
      if (!r.ok) return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(r.retryAfterMs / 1000)) }
    }
    return { ok: true }
  }

  /** Layers 1, 3, 6, 7, 9, 10 before one AI call. On ok, endCall() must follow exactly once. */
  async beginCall(promptText: string): Promise<{ ok: true; ticket: CallTicket } | CallRefusal> {
    const c = this.cfg
    if (!c.aiEnabled) return { ok: false, mode: 'resting', reason: 'kill_switch' }

    const estimate = Math.ceil(promptText.length / 3)
    if (estimate > c.maxPromptTokens) {
      console.error(`[cost] prompt estimate ${estimate} tokens > MAX_PROMPT_TOKENS ${c.maxPromptTokens}: not sent`)
      return { ok: false, mode: 'resting', reason: 'prompt_too_large' }
    }

    const now = this.now()
    const rpm = await this.store.hit('app:rpm', c.appRpmCap, MINUTE, now)
    if (!rpm.ok) return { ok: false, mode: 'busy', reason: 'app_rpm', retryAfterSeconds: Math.max(1, Math.ceil(rpm.retryAfterMs / 1000)) }
    const rpd = await this.store.hit('app:rpd', c.appRpdCap, DAY, now)
    if (!rpd.ok) return { ok: false, mode: 'resting', reason: 'app_rpd' }

    const id = this.newId()
    if (!(await this.store.acquireLease(id, c.maxConcurrentAiCalls, LEASE_TTL_MS, now))) {
      return { ok: false, mode: 'busy', reason: 'concurrency', retryAfterSeconds: 5 }
    }

    const reservedMicroUsd = toMicro(worstCaseCallUsd(c))
    const { day, month } = this.period(now)
    const r = await this.store.reserve({
      id,
      microUsd: reservedMicroUsd,
      day,
      month,
      dailyCallCap: c.dailyAiCallCap,
      dailyMicroUsdCap: toMicro(c.dailyUsdCap),
      monthlyMicroUsdCap: toMicro(c.monthlyUsdCap),
    })
    if (!r.ok) {
      await this.store.releaseLease(id)
      return { ok: false, mode: 'resting', reason: r.reason }
    }
    return { ok: true, ticket: { id, reservedMicroUsd } }
  }

  /**
   * Reconcile: real cost from usage metadata; no metadata keeps the worst case.
   * An error status means nothing was billed (release); a timeout or network
   * error might have been billed, so the worst case stays.
   */
  async endCall(ticket: CallTicket, outcome: { usage: AiUsage | null } | { errorKind: string }): Promise<void> {
    let actual = ticket.reservedMicroUsd
    let detail = 'no usage metadata: worst case kept'
    if ('usage' in outcome && outcome.usage) {
      const u = outcome.usage
      actual = toMicro((u.inputTokens * this.cfg.priceInputPerM + (u.outputTokens + u.thinkingTokens) * this.cfg.priceOutputPerM) / 1_000_000)
      detail = `${u.inputTokens} in, ${u.outputTokens} out, ${u.thinkingTokens} thinking`
    } else if ('errorKind' in outcome) {
      if (NOT_BILLED.has(outcome.errorKind)) actual = 0
      detail = `${outcome.errorKind}: ${actual === 0 ? 'released' : 'worst case kept'}`
    }
    await this.store.settle(ticket.id, actual)
    await this.store.releaseLease(ticket.id)

    const t = await this.totals()
    console.log(`[cost] call $${(actual / 1e6).toFixed(6)} (${detail}) · today $${t.dayUsd.toFixed(6)} of $${this.cfg.dailyUsdCap.toFixed(2)} · ${t.dayCalls} calls`)
    if (t.dayUsd >= 0.8 * this.cfg.dailyUsdCap) console.warn(`[cost] over 80% of the daily cap ($${t.dayUsd.toFixed(4)} of $${this.cfg.dailyUsdCap})`)
    if (t.monthUsd >= 0.8 * this.cfg.monthlyUsdCap) console.warn(`[cost] over 80% of the monthly cap ($${t.monthUsd.toFixed(4)} of $${this.cfg.monthlyUsdCap})`)
  }

  async totals(): Promise<{ dayUsd: number; monthUsd: number; dayCalls: number }> {
    const { day, month } = this.period(this.now())
    const t = await this.store.totals(day, month)
    return { dayUsd: t.dayMicroUsd / 1e6, monthUsd: t.monthMicroUsd / 1e6, dayCalls: t.dayCalls }
  }

  private period(now: number) {
    const day = pacificDate.format(new Date(now))
    return { day, month: day.slice(0, 7) }
  }
}
