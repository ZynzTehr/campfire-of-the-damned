import type { PromptInput } from './systemPrompt.ts'
import type { AiClient, AiResult } from './types.ts'

/** One scripted step: a result to return, or an error to throw. */
export type FakeStep = AiResult | Error

/**
 * Test double implementing the same AiClient interface as Gemini.
 * Replays scripted steps in order (the last step repeats) and records every call,
 * so tests can simulate timeouts, 429s, garbage JSON, or hostile output for free.
 */
export class FakeAiClient implements AiClient {
  readonly calls: PromptInput[] = []
  private readonly steps: FakeStep[]

  constructor(...steps: FakeStep[]) {
    if (steps.length === 0) throw new Error('FakeAiClient needs at least one step')
    this.steps = steps
  }

  async generate(input: PromptInput): Promise<AiResult> {
    this.calls.push(input)
    const step = this.steps[Math.min(this.calls.length - 1, this.steps.length - 1)]!
    if (step instanceof Error) throw step
    return step
  }
}

/** A valid model reply, with optional overrides for hostile variants. */
export function storyResult(story: Record<string, unknown> = {}, extra: Partial<AiResult> = {}): AiResult {
  return {
    text: JSON.stringify({
      title: 'The Porcelain Choir',
      body: 'In the attic, a teacup hummed a lullaby. Rust crept along the rafters like a slow red tide. When the song ended, the cup was full of something that was not tea.',
      spookFactor: 4,
      tampering: false,
      ingredients: ['lullaby', 'rust', 'teacup'],
      ...story,
    }),
    finishReason: 'STOP',
    usage: { inputTokens: 420, outputTokens: 110, thinkingTokens: 0 },
    ...extra,
  }
}
