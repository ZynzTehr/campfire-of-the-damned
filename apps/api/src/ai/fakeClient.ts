import type { PromptInput } from './systemPrompt.ts'
import type { AiClient, AiResult } from './types.ts'

/** One scripted step: a result to return, an error to throw, or a function of the request. */
export type FakeStep = AiResult | Error | ((input: PromptInput) => AiResult | Error)

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
    const scripted = this.steps[Math.min(this.calls.length - 1, this.steps.length - 1)]!
    const step = typeof scripted === 'function' ? scripted(input) : scripted
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

/**
 * A valid English reply built from the request's own words, so it passes the
 * output guard for any input (ingredients, 3 sentences, English function words).
 */
export function echoStory(input: PromptInput): AiResult {
  const [a, b = a, c = b] = input.words
  return storyResult({
    title: 'The Thing by the Fire',
    body: `The ${a} was waiting in the dark and it did not move. Someone whispered about the ${b} as the fire burned low. By morning the ${c} was gone and the snow kept no tracks.`,
    ingredients: [...input.words],
  })
}
