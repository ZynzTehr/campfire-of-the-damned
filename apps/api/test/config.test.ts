import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vite-plus/test'
import { ConfigError, loadConfig } from '../src/config.ts'
import { VALID_ENV } from './env.ts'

function problemsFor(env: Record<string, string | undefined>): string[] {
  try {
    loadConfig(env)
  } catch (err) {
    if (err instanceof ConfigError) return err.problems
    throw err
  }
  return []
}

describe('loadConfig: a valid env loads', () => {
  it('parses every cost setting into numbers and flags', () => {
    const cfg = loadConfig(VALID_ENV)
    expect(cfg.cost).toEqual({
      aiEnabled: true,
      priceInputPerM: 0.3,
      priceOutputPerM: 2.5,
      maxPromptTokens: 900,
      maxOutputTokens: 300,
      maxConcurrentAiCalls: 3,
      appRpmCap: 12,
      appRpdCap: 1000,
      perIpPerMinute: 5,
      perIpPerHour: 30,
      dailyAiCallCap: 500,
      dailyUsdCap: 1,
      monthlyUsdCap: 10,
      degradedAiCallsPerHour: 20,
    })
    expect(cfg.geminiModel).toBe('gemini-3.5-flash-lite')
    expect(cfg.ipSource).toBe('socket')
    expect(cfg.port).toBe(8787)
  })

  it('AI_ENABLED=false is the kill switch, not an error', () => {
    expect(loadConfig({ ...VALID_ENV, AI_ENABLED: 'false' }).cost.aiEnabled).toBe(false)
  })
})

describe('loadConfig fails closed: a typo stops the app, it never removes a limit (SPEC §8.3)', () => {
  const COST_KEYS = Object.keys(VALID_ENV).filter((k) => !['GEMINI_API_KEY', 'GEMINI_MODEL', 'STORE', 'IP_SOURCE', 'AI_ENABLED'].includes(k))

  it.each(Object.keys(VALID_ENV))('missing %s → refuses to start', (key) => {
    const env = { ...VALID_ENV, [key]: undefined }
    expect(problemsFor(env).join('\n')).toContain(key)
  })

  it.each(COST_KEYS)('empty %s → refuses (an empty value must not mean "no limit")', (key) => {
    expect(problemsFor({ ...VALID_ENV, [key]: '' }).join('\n')).toContain(key)
  })

  it.each(['abc', '-1', '0', '0.0', '1e3', '0x10', ' 5', 'Infinity', 'NaN', '5 calls'])('DAILY_USD_CAP=%j → refuses', (bad) => {
    expect(problemsFor({ ...VALID_ENV, DAILY_USD_CAP: bad }).join('\n')).toContain('DAILY_USD_CAP')
  })

  it.each([
    ['MAX_PROMPT_TOKENS', '1.5'],
    ['MAX_OUTPUT_TOKENS', '300.5'],
    ['MAX_CONCURRENT_AI_CALLS', '2.5'],
    ['PER_IP_PER_MINUTE', '0.5'],
  ])('%s=%s → refuses (must be a whole number)', (key, bad) => {
    expect(problemsFor({ ...VALID_ENV, [key]: bad }).join('\n')).toContain(key)
  })

  it.each([
    ['DAILY_USD_CAP', '25.01'],
    ['MONTHLY_USD_CAP', '100.01'],
    ['MAX_OUTPUT_TOKENS', '1025'],
    ['MAX_CONCURRENT_AI_CALLS', '11'],
    ['MAX_PROMPT_TOKENS', '4001'],
  ])('%s=%s → refuses (above the sanity ceiling)', (key, bad) => {
    expect(problemsFor({ ...VALID_ENV, [key]: bad }).join('\n')).toContain(key)
  })

  it('daily cap above monthly cap → refuses', () => {
    expect(problemsFor({ ...VALID_ENV, DAILY_USD_CAP: '20', MONTHLY_USD_CAP: '10' }).join('\n')).toMatch(/DAILY_USD_CAP.*MONTHLY_USD_CAP/)
  })

  it('per-minute limit above per-hour limit → refuses', () => {
    expect(problemsFor({ ...VALID_ENV, PER_IP_PER_MINUTE: '50', PER_IP_PER_HOUR: '30' }).join('\n')).toContain('PER_IP_PER_MINUTE')
  })

  it('a daily cap smaller than one worst-case call → refuses (it would block every call)', () => {
    // 900 × 0.30 + 300 × 2.50 per 1M = $0.00102 worst case.
    expect(problemsFor({ ...VALID_ENV, DAILY_USD_CAP: '0.001' }).join('\n')).toContain('DAILY_USD_CAP')
  })

  it.each(['yes', 'TRUE', '1', ''])('AI_ENABLED=%j → refuses (only "true" or "false")', (bad) => {
    expect(problemsFor({ ...VALID_ENV, AI_ENABLED: bad }).join('\n')).toContain('AI_ENABLED')
  })

  it.each([['STORE', 'redis'], ['IP_SOURCE', 'header']])('%s=%s → refuses', (key, bad) => {
    expect(problemsFor({ ...VALID_ENV, [key]: bad }).join('\n')).toContain(key)
  })

  it('on Vercel, STORE=memory → refuses (in-memory limits reset per instance, SPEC §8.2)', () => {
    expect(problemsFor({ ...VALID_ENV, VERCEL: '1' }).join('\n')).toMatch(/STORE/)
  })

  it('reports every problem at once, not just the first', () => {
    expect(problemsFor({ ...VALID_ENV, DAILY_USD_CAP: 'x', MAX_OUTPUT_TOKENS: '0', AI_ENABLED: 'yes' })).toHaveLength(3)
  })

  it('never echoes a value back (a key pasted into the wrong variable must not reach the logs)', () => {
    const secretish = 'AQ.pasted-into-the-wrong-var'
    const problems = problemsFor({ ...VALID_ENV, DAILY_USD_CAP: secretish, GEMINI_MODEL: '' })
    expect(problems.join('\n')).not.toContain(secretish)
  })
})

describe('.env.example documents every setting the server reads', () => {
  it('has a line for each key in the valid env', () => {
    const example = readFileSync(new URL('../../../.env.example', import.meta.url), 'utf8')
    const keys = new Set([...example.matchAll(/^([A-Z0-9_]+)=/gm)].map((m) => m[1]))
    for (const key of Object.keys(VALID_ENV)) expect(keys, key).toContain(key)
  })
})

describe('config: client IP source on Vercel', () => {
  it('VERCEL with IP_SOURCE=socket → refuses (every visitor would share the proxy address)', () => {
    expect(problemsFor({ ...VALID_ENV, VERCEL: '1', IP_SOURCE: 'socket' }).join('\n')).toMatch(/IP_SOURCE must be vercel/)
  })
  it('VERCEL with IP_SOURCE=vercel → no IP problem', () => {
    expect(problemsFor({ ...VALID_ENV, VERCEL: '1', IP_SOURCE: 'vercel' }).join('\n')).not.toMatch(/IP_SOURCE/)
  })
})
