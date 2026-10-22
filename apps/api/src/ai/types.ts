import type { PromptInput } from './systemPrompt.ts'

/** Why a single AI attempt failed. The app decides retry vs fallback (SPEC §7.3). */
export type AiErrorKind = 'timeout' | 'rate_limited' | 'auth' | 'server' | 'network' | 'bad_request'

/**
 * Carries only a kind and HTTP status. Never the upstream body, URL, or key:
 * the message of this error is safe to log and never reaches users anyway.
 */
export class AiError extends Error {
  readonly kind: AiErrorKind
  readonly status: number | undefined

  constructor(kind: AiErrorKind, status?: number) {
    super(`ai_${kind}${status ? `_${status}` : ''}`)
    this.name = 'AiError'
    this.kind = kind
    this.status = status
  }
}

export interface AiUsage {
  inputTokens: number
  outputTokens: number
  thinkingTokens: number
}

export interface AiResult {
  /** Raw model text (expected to be JSON). Parsed and guarded by the caller. */
  text: string
  /** "STOP" on success; anything else (SAFETY, MAX_TOKENS, a block reason) is a failure. */
  finishReason: string
  /** null when the response had no usage metadata (cost code keeps the worst case). */
  usage: AiUsage | null
}

/** One attempt, no retries. Real (Gemini) and fake clients both implement this. */
export interface AiClient {
  generate(input: PromptInput, opts?: { signal?: AbortSignal }): Promise<AiResult>
}
