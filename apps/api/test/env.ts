/** A complete, valid env. Each test breaks one thing. */
export const VALID_ENV: Record<string, string> = {
  GEMINI_API_KEY: 'fake-test-key-not-real',
  GEMINI_MODEL: 'gemini-3.5-flash-lite',
  AI_ENABLED: 'true',
  PRICE_INPUT_PER_M_USD: '0.30',
  PRICE_OUTPUT_PER_M_USD: '2.50',
  MAX_PROMPT_TOKENS: '900',
  MAX_OUTPUT_TOKENS: '300',
  MAX_CONCURRENT_AI_CALLS: '3',
  APP_RPM_CAP: '12',
  APP_RPD_CAP: '1000',
  PER_IP_PER_MINUTE: '5',
  PER_IP_PER_HOUR: '30',
  DAILY_AI_CALL_CAP: '500',
  DAILY_USD_CAP: '1.00',
  MONTHLY_USD_CAP: '10.00',
  DEGRADED_AI_CALLS_PER_HOUR: '20',
  STORE: 'memory',
  IP_SOURCE: 'socket',
}

