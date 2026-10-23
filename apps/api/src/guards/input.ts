import { z } from 'zod'
import { LANGUAGES, SETTINGS, WORD_REGEX, type Language, type Setting } from '../story.ts'

export interface CleanRequest {
  setting: Setting
  language: Language
  words: string[]
  clientId?: string
  lastRating?: number
}

export type InputResult =
  | { ok: true; value: CleanRequest }
  | { ok: false; kind: 'invalid' | 'rejected'; reason: string }

/**
 * Shape only. Words are raw strings here (capped at 64 chars) because they must
 * be normalized before the word regex runs: a zero-width space inside "ignore"
 * should be caught as an attack, not bounced as a typo.
 */
const RawRequest = z
  .object({
    setting: z.enum(SETTINGS),
    language: z.enum(LANGUAGES).default('en'),
    words: z.array(z.string().max(64)).min(1).max(3),
    clientId: z.uuid({ version: 'v4' }).optional(),
    lastRating: z.number().int().min(1).max(5).optional(),
  })
  .strict()

// Zero-width and bidi control characters (SPEC §7.1 step 4).
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g
const CURLY_APOSTROPHES = /[\u2018\u2019\u02BC\u2032]/g

/** NFKC, strip invisibles, straighten apostrophes, trim, lowercase. */
export function normalizeWord(raw: string): string {
  return raw.normalize('NFKC').replace(INVISIBLE, '').replace(CURLY_APOSTROPHES, "'").trim().toLowerCase()
}

/**
 * Cyrillic/Greek letters that look like Latin ones. Folded only for matching the
 * blocklists, so "іgnоrе" (Cyrillic і, о, е) is caught; the word itself is untouched.
 */
const CONFUSABLES: Record<string, string> = {
  а: 'a', в: 'b', е: 'e', ё: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x',
  і: 'i', ї: 'i', ј: 'j', ѕ: 's', ԁ: 'd', ɡ: 'g', һ: 'h', ӏ: 'l', ԛ: 'q', ԝ: 'w',
  α: 'a', ε: 'e', ι: 'i', κ: 'k', ν: 'v', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x',
}
const fold = (s: string) => s.replace(/[^\x00-\x7F]/g, (ch) => CONFUSABLES[ch] ?? ch)

/** Characters with no business in a story ingredient: delimiters, markup, code. */
const MARKUP = /[<>{}[\]`|\\]/

/** Single words that only make sense as instructions to a model (SPEC §7.1 steps 6–7). */
const STEERING_WORDS = new Set([
  'ignore', 'system', 'prompt', 'instructions', 'instruction', 'assistant', 'jailbreak', 'developer',
  'override', 'disregard', 'roleplay', 'persona', 'pretend', 'uncensored', 'nsfw',
])

/** Short phrases that only make sense as instructions. Matched on whole tokens. */
const STEERING_PHRASES = [
  'act as', 'you are', "you're now", 'you re now', 'role play', 'speak like', 'talk like', 'respond in',
  'reply in', 'write as', 'from now', 'stay in character', 'dan mode', 'developer mode', 'god mode',
]

/** Small profanity/slur list (SPEC §7.1 step 8). Whole tokens only, so "scunthorpe" and "grape" pass. */
const BLOCKED_WORDS = new Set([
  'fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'cunt', 'bitch', 'whore', 'slut', 'cock', 'dick',
  'pussy', 'porn', 'rape', 'rapist', 'nigger', 'nigga', 'faggot', 'fag', 'retard', 'kike', 'spic', 'chink',
])

const tokens = (s: string) => s.split(/[^\p{L}\p{N}']+/u).filter(Boolean)
const hasPhrase = (joined: string) => STEERING_PHRASES.some((p) => ` ${joined} `.includes(` ${p} `))

/**
 * Input guard (SPEC §7.1). Order: shape → normalize → abuse checks → word regex.
 * Abuse is checked before the regex so an attack gets the cheeky "rejected"
 * message even when it would also fail the regex (e.g. "</INGREDIENTS>",
 * or a whole sentence in one slot). Honest typos get the helpful "invalid".
 */
export function checkInput(body: unknown): InputResult {
  const parsed = RawRequest.safeParse(body)
  if (!parsed.success) return { ok: false, kind: 'invalid', reason: 'shape' }

  const { setting, language, clientId, lastRating } = parsed.data
  const words = parsed.data.words.map(normalizeWord)

  if (words.some((w) => MARKUP.test(w))) return { ok: false, kind: 'rejected', reason: 'markup' }

  const typed = words.flatMap((w) => tokens(fold(w)))
  const sorted = [...words].sort().flatMap((w) => tokens(fold(w)))

  if (typed.some((t) => STEERING_WORDS.has(t))) return { ok: false, kind: 'rejected', reason: 'steering_word' }
  // Both orders: sorting is what the model sees, and it can create a phrase ("as act dan" → "act as dan").
  if (hasPhrase(typed.join(' ')) || hasPhrase(sorted.join(' '))) {
    return { ok: false, kind: 'rejected', reason: 'steering_phrase' }
  }
  if (typed.some((t) => BLOCKED_WORDS.has(t))) return { ok: false, kind: 'rejected', reason: 'blocklist' }

  if (!words.every((w) => WORD_REGEX.test(w))) return { ok: false, kind: 'invalid', reason: 'word_format' }

  return {
    ok: true,
    value: {
      setting,
      language,
      words,
      ...(clientId ? { clientId } : {}),
      ...(lastRating !== undefined ? { lastRating } : {}),
    },
  }
}
