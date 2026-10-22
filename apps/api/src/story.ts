import { z } from 'zod'

export const SETTINGS = [
  'haunted-attic',
  'abandoned-asylum',
  'foggy-graveyard',
  'cursed-carnival',
  'sunken-lighthouse',
  'witchs-cottage',
] as const
export type Setting = (typeof SETTINGS)[number]

/** To ship English only, change this to ['en'] (SPEC §14). */
export const LANGUAGES = ['en', 'es', 'fr', 'pt', 'de', 'it'] as const
export type Language = (typeof LANGUAGES)[number]

/** Unicode letters/digits, hyphen, apostrophe; 1–24 chars; no spaces. */
export const WORD_REGEX = /^[\p{L}\p{N}][\p{L}\p{N}'-]{0,23}$/u

/**
 * POST /api/story request. Phase 2 has only this schema; Phase 3 adds the
 * byte cap, Unicode normalization, and the injection and persona checks.
 */
export const StoryRequest = z
  .object({
    setting: z.enum(SETTINGS),
    language: z.enum(LANGUAGES).default('en'),
    words: z.array(z.string().regex(WORD_REGEX)).min(1).max(3),
    clientId: z.uuid({ version: 'v4' }).optional(),
  })
  .strict()
export type StoryRequest = z.infer<typeof StoryRequest>

/** What the model must return (enforced again by Zod; never trust the model). */
export const AiStory = z
  .object({
    title: z.string().min(1).max(60),
    body: z.string().min(1).max(600),
    spookFactor: z.number().int().min(1).max(5),
    tampering: z.boolean(),
    ingredients: z.array(z.string()),
  })
  .strict()
export type AiStory = z.infer<typeof AiStory>
