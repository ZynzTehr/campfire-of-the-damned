import { buildUserTurn, type PromptInput } from './systemPrompt.ts'
import { AiError, type AiClient, type AiErrorKind, type AiResult, type AiUsage } from './types.ts'

export interface GeminiConfig {
  apiKey: string
  model: string
  systemPrompt: string
  maxOutputTokens: number
  timeoutMs?: number
  /** Injected so adapter tests can replay recorded responses with no network. */
  fetch?: typeof fetch
}

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

/** Structured output: the model can only answer in this shape. */
export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    body: { type: 'STRING' },
    spookFactor: { type: 'INTEGER', minimum: 1, maximum: 5 },
    tampering: { type: 'BOOLEAN' },
    ingredients: { type: 'ARRAY', items: { type: 'STRING' }, maxItems: 3 },
  },
  required: ['title', 'body', 'spookFactor', 'tampering', 'ingredients'],
  propertyOrdering: ['title', 'body', 'spookFactor', 'tampering', 'ingredients'],
} as const

export function buildRequestBody(
  config: Pick<GeminiConfig, 'systemPrompt' | 'maxOutputTokens'>,
  input: PromptInput,
) {
  return {
    systemInstruction: { parts: [{ text: config.systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: buildUserTurn(input) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      maxOutputTokens: config.maxOutputTokens,
      temperature: 1.0,
      // thinkingBudget: 0 is rejected (HTTP 400) by Gemini 3.x; "minimal" is the floor.
      thinkingConfig: { thinkingLevel: 'minimal' },
    },
  }
}

export function geminiUrl(model: string): string {
  return `${API_BASE}/${encodeURIComponent(model)}:generateContent`
}

export function createGeminiClient(config: GeminiConfig): AiClient {
  const doFetch = config.fetch ?? fetch
  const timeoutMs = config.timeoutMs ?? 10_000
  const url = geminiUrl(config.model)

  return {
    async generate(input, opts = {}): Promise<AiResult> {
      const signal = opts.signal
        ? AbortSignal.any([opts.signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs)

      let res: Response
      let raw: string
      try {
        res = await doFetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': config.apiKey },
          body: JSON.stringify(buildRequestBody(config, input)),
          signal,
        })
        raw = await res.text()
      } catch {
        // The caught error can contain the URL or socket details: drop it.
        throw new AiError(signal.aborted ? 'timeout' : 'network')
      }

      if (!res.ok) throw new AiError(kindForStatus(res.status, raw), res.status)

      let json: unknown
      try {
        json = JSON.parse(raw)
      } catch {
        throw new AiError('server', res.status)
      }
      return parseResponse(json)
    },
  }
}

function kindForStatus(status: number, raw: string): AiErrorKind {
  if (status === 429) return 'rate_limited'
  if (status === 401 || status === 403) return 'auth'
  // Google answers a bad key with 400 + reason API_KEY_INVALID, not 401.
  if (status === 400 && raw.includes('"API_KEY_INVALID"')) return 'auth'
  if (status >= 500) return 'server'
  return 'bad_request'
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: unknown; thought?: unknown }> }
    finishReason?: unknown
  }>
  promptFeedback?: { blockReason?: unknown }
  usageMetadata?: { promptTokenCount?: unknown; candidatesTokenCount?: unknown; thoughtsTokenCount?: unknown }
}

function parseResponse(json: unknown): AiResult {
  if (!json || typeof json !== 'object') throw new AiError('server')
  const r = json as GeminiResponse
  if (r.candidates !== undefined && !Array.isArray(r.candidates)) throw new AiError('server')

  const usage = parseUsage(r.usageMetadata)
  const candidate = r.candidates?.[0]

  if (!candidate) {
    const reason = typeof r.promptFeedback?.blockReason === 'string' ? r.promptFeedback.blockReason : 'NO_CANDIDATE'
    return { text: '', finishReason: `BLOCKED_${reason}`, usage }
  }

  const parts = Array.isArray(candidate.content?.parts) ? candidate.content.parts : []
  const text = parts
    .filter((p) => p.thought !== true && typeof p.text === 'string')
    .map((p) => p.text as string)
    .join('')
  const finishReason = typeof candidate.finishReason === 'string' ? candidate.finishReason : 'UNKNOWN'

  return { text, finishReason, usage }
}

function parseUsage(u: GeminiResponse['usageMetadata']): AiUsage | null {
  if (!u || typeof u.promptTokenCount !== 'number') return null
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  return {
    inputTokens: n(u.promptTokenCount),
    outputTokens: n(u.candidatesTokenCount),
    thinkingTokens: n(u.thoughtsTokenCount),
  }
}
