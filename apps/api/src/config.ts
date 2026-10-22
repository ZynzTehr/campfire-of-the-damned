/**
 * Fail-closed config (SPEC §8.3). The server refuses to start if any cost
 * setting is missing, not a number, ≤ 0, or above a sanity ceiling.
 * A typo must stop the app, never silently remove a limit.
 */

export interface CostConfig {
  aiEnabled: boolean
  priceInputPerM: number
  priceOutputPerM: number
  maxPromptTokens: number
  maxOutputTokens: number
  maxConcurrentAiCalls: number
  appRpmCap: number
  appRpdCap: number
  perIpPerMinute: number
  perIpPerHour: number
  dailyAiCallCap: number
  dailyUsdCap: number
  monthlyUsdCap: number
  degradedAiCallsPerHour: number
}

export interface Config {
  geminiApiKey: string
  geminiModel: string
  ipSource: 'socket' | 'vercel'
  store: 'memory'
  port: number
  cost: CostConfig
}

/** Lists every problem by variable name. Never includes a value (it might be a pasted key). */
export class ConfigError extends Error {
  readonly problems: string[]
  constructor(problems: string[]) {
    super(`Invalid config: ${problems.length} problem(s)`)
    this.name = 'ConfigError'
    this.problems = problems
  }
}

type Env = Record<string, string | undefined>

/** Plain decimal only: no exponents, hex, spaces, Infinity. */
const DECIMAL = /^\d+(\.\d+)?$/
const INTEGER = /^\d+$/

export function loadConfig(env: Env): Config {
  const problems: string[] = []

  const text = (key: string): string => {
    const v = env[key]
    if (v === undefined || v.trim() === '') problems.push(`${key} is required`)
    return v?.trim() ?? ''
  }
  const num = (key: string, max: number, opts: { integer?: boolean } = {}): number => {
    const v = env[key]
    if (v === undefined || v === '') {
      problems.push(`${key} is required`)
      return NaN
    }
    if (!(opts.integer ? INTEGER : DECIMAL).test(v)) {
      problems.push(`${key} must be a ${opts.integer ? 'whole' : 'plain decimal'} number`)
      return NaN
    }
    const n = Number(v)
    if (!(n > 0)) problems.push(`${key} must be greater than 0`)
    else if (n > max) problems.push(`${key} is above the sanity ceiling (${max})`)
    return n
  }
  const oneOf = <T extends string>(key: string, allowed: readonly T[]): T => {
    const v = env[key]
    if (v === undefined || !allowed.includes(v as T)) problems.push(`${key} must be one of: ${allowed.join(', ')}`)
    return v as T
  }

  const geminiApiKey = text('GEMINI_API_KEY')
  const geminiModel = text('GEMINI_MODEL')
  const aiEnabled = oneOf('AI_ENABLED', ['true', 'false'] as const) === 'true'

  const cost: CostConfig = {
    aiEnabled,
    priceInputPerM: num('PRICE_INPUT_PER_M_USD', 100),
    priceOutputPerM: num('PRICE_OUTPUT_PER_M_USD', 500),
    maxPromptTokens: num('MAX_PROMPT_TOKENS', 4000, { integer: true }),
    maxOutputTokens: num('MAX_OUTPUT_TOKENS', 1024, { integer: true }),
    maxConcurrentAiCalls: num('MAX_CONCURRENT_AI_CALLS', 10, { integer: true }),
    appRpmCap: num('APP_RPM_CAP', 1000, { integer: true }),
    appRpdCap: num('APP_RPD_CAP', 100_000, { integer: true }),
    perIpPerMinute: num('PER_IP_PER_MINUTE', 100, { integer: true }),
    perIpPerHour: num('PER_IP_PER_HOUR', 1000, { integer: true }),
    dailyAiCallCap: num('DAILY_AI_CALL_CAP', 100_000, { integer: true }),
    dailyUsdCap: num('DAILY_USD_CAP', 25),
    monthlyUsdCap: num('MONTHLY_USD_CAP', 100),
    degradedAiCallsPerHour: num('DEGRADED_AI_CALLS_PER_HOUR', 1000, { integer: true }),
  }

  const store = oneOf('STORE', ['memory', 'neon'] as const)
  const ipSource = oneOf('IP_SOURCE', ['socket', 'vercel'] as const)

  // Cross-field rules.
  if (cost.dailyUsdCap > cost.monthlyUsdCap) problems.push('DAILY_USD_CAP must not exceed MONTHLY_USD_CAP')
  if (cost.perIpPerMinute > cost.perIpPerHour) problems.push('PER_IP_PER_MINUTE must not exceed PER_IP_PER_HOUR')
  const worst = worstCaseCallUsd(cost)
  if (Number.isFinite(worst) && worst > cost.dailyUsdCap) {
    problems.push('DAILY_USD_CAP is smaller than one worst-case call (it would block every call)')
  }
  if (env.VERCEL && store !== 'neon') problems.push('STORE must be neon on Vercel (in-memory limits reset per instance)')
  if (store === 'neon') problems.push('STORE=neon is not available yet (Phase 5); use STORE=memory locally')

  if (problems.length) throw new ConfigError(problems)

  return { geminiApiKey, geminiModel, ipSource, store: 'memory', port: Number(env.PORT ?? 8787), cost }
}

/** Worst case for one call: a full prompt and a full output at paid prices. */
export function worstCaseCallUsd(c: Pick<CostConfig, 'maxPromptTokens' | 'maxOutputTokens' | 'priceInputPerM' | 'priceOutputPerM'>): number {
  return (c.maxPromptTokens * c.priceInputPerM + c.maxOutputTokens * c.priceOutputPerM) / 1_000_000
}
