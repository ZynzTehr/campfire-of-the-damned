import type { AiResult } from '../ai/types.ts'
import { AiStory, type Language } from '../story.ts'

export type OutputFailure =
  | 'finish'
  | 'schema'
  | 'tampering'
  | 'markup'
  | 'leak'
  | 'format'
  | 'language'
  | 'sentences'
  | 'ingredients'
  | 'character'

export type OutputResult = { ok: true; story: AiStory } | { ok: false; reason: OutputFailure }

export interface OutputContext {
  /** Normalized words from the input guard, in the order typed. */
  words: readonly string[]
  language: Language
  canary: string
  systemPrompt: string
}

const clean = (s: string) => s.normalize('NFKC').replace(/[\u2018\u2019\u02BC]/g, "'").toLowerCase()
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const words = (s: string) => clean(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean)
/** Remove quoted dialogue, so a ghost may say "I'm sorry" without the narrator breaking character. */
const outsideQuotes = (s: string) => s.replace(/"[^"]*"|“[^”]*”|«[^»]*»|„[^“”]*[“”]/g, ' ')

// --- 4. markup -------------------------------------------------------------
const MARKUP = /https?:\/\/|www\.|<\/?[a-z!][^>]*>|```|[{}]/i

// --- 5. leak: any 6-word run copied from the system prompt -------------------
const SHINGLE = 6
function shingles(text: string): Set<string> {
  const w = words(text)
  const out = new Set<string>()
  for (let i = 0; i + SHINGLE <= w.length; i++) out.add(w.slice(i, i + SHINGLE).join(' '))
  return out
}
const shingleCache = new Map<string, Set<string>>()
function promptShingles(systemPrompt: string): Set<string> {
  let s = shingleCache.get(systemPrompt)
  if (!s) {
    s = shingles(systemPrompt.replace(/\[canary:[^\]]*\]/, ''))
    shingleCache.set(systemPrompt, s)
  }
  return s
}

// --- 8. format: prose, not a poem / script / list ----------------------------
const LIST_MARKER = /^\s*(?:[-*•]|\d+[.)])\s/mu
const SPEAKER_LABEL = /^\s*\p{Lu}[\p{L} ]{0,20}:\s/mu

// --- 9. language: distinctive function words (shared ones like "la"/"de" left out) ---
const FUNCTION_WORDS: Record<Language, Set<string>> = {
  en: new Set(['the', 'and', 'of', 'was', 'with', 'his', 'her', 'that', 'into', 'from', 'were', 'had']),
  es: new Set(['el', 'los', 'las', 'y', 'por', 'pero', 'sus', 'estaba', 'hacia', 'cuando', 'desde', 'muy']),
  fr: new Set(['le', 'les', 'et', 'des', 'dans', 'est', 'était', 'sur', 'qui', 'pas', 'du', 'au', 'une', 'elle']),
  pt: new Set(['os', 'um', 'não', 'em', 'ao', 'pelo', 'pela', 'seus', 'suas', 'muito', 'então', 'estava']),
  de: new Set(['der', 'das', 'und', 'ein', 'eine', 'ist', 'nicht', 'mit', 'den', 'dem', 'im', 'zu', 'sich', 'auf']),
  it: new Set(['il', 'gli', 'di', 'che', 'nel', 'della', 'dei', 'alla', 'sul', 'uno', 'erano', 'questo', 'non']),
}
function languageOk(body: string, language: Language): boolean {
  const letters = body.match(/\p{L}/gu) ?? []
  const latin = body.match(/\p{Script=Latin}/gu) ?? []
  if (letters.length === 0 || latin.length / letters.length < 0.9) return false

  const tokens = words(body)
  const count = (lang: Language) => tokens.filter((t) => FUNCTION_WORDS[lang].has(t)).length
  const mine = count(language)
  const others = (Object.keys(FUNCTION_WORDS) as Language[]).filter((l) => l !== language).map(count)
  return mine >= 2 && mine > Math.max(...others)
}

// --- 2b. 3–5 sentences ---------------------------------------------------------
const sentenceCount = (body: string) =>
  body
    .trim()
    .split(/(?<=[.!?…]["”»’)]*)\s+/u)
    .filter((s) => /\p{L}/u.test(s)).length

// --- 3. ingredients --------------------------------------------------------------
function wordUsed(body: string, word: string): boolean {
  const forms = [escapeRe(word) + '(?:s|es)?']
  if (word.endsWith('y')) forms.push(escapeRe(word.slice(0, -1)) + 'ies')
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${forms.join('|')})(?![\\p{L}\\p{N}])`, 'u').test(body)
}
function ingredientsOk(story: AiStory, ctx: OutputContext): boolean {
  const body = clean(story.body)
  if (ctx.language === 'en') return ctx.words.every((w) => wordUsed(body, clean(w)))
  // Other languages: the model commits to a translated form per word; each must appear.
  return story.ingredients.length === ctx.words.length && story.ingredients.every((i) => i.trim() && body.includes(clean(i.trim())))
}

// --- 10. in character, third person ---------------------------------------------
/** Assistant/meta talk, anywhere. English runs for every language (it leaks most). */
const META: Record<Language, string[]> = {
  en: ['as an ai', 'language model', 'my instructions', 'system prompt', 'you asked', 'your request', 'campfire keeper'],
  es: ['como ia', 'como una ia', 'modelo de lenguaje', 'mis instrucciones', 'tu solicitud'],
  fr: ["en tant qu'ia", 'modèle de langage', 'mes instructions', 'votre demande', 'ta demande'],
  pt: ['como uma ia', 'como ia', 'modelo de linguagem', 'minhas instruções', 'seu pedido'],
  de: ['als ki', 'sprachmodell', 'meine anweisungen', 'deine anfrage'],
  it: ["come un'ia", 'come ia', 'modello linguistico', 'le mie istruzioni', 'la tua richiesta'],
}
/** Assistant openers, only at the very start of the title or body ("here's where she vanished" mid-story is fine). */
const OPENERS: Record<Language, string[]> = {
  en: ['sure', "here's", 'here is', 'certainly', 'okay', 'ok', 'of course', 'as requested'],
  es: ['aquí tienes', 'aquí está', 'por supuesto'],
  fr: ['bien sûr', "d'accord"],
  pt: ['aqui está', 'com certeza'],
  de: ['gerne', 'hier ist'],
  it: ['ecco la tua', 'certamente'],
}
/** Refusals, only outside quoted dialogue (a ghost may say "I'm sorry"). */
const REFUSALS = ["i can't", 'i cannot', "i'm sorry", 'i am sorry', "i won't"]
/** First-person words per language; more than 2 outside quotes means the narrator broke third person. */
const FIRST_PERSON: Record<Language, Set<string>> = {
  en: new Set(['i', 'me', 'my', 'mine', 'myself', 'we', 'us', 'our']),
  es: new Set(['yo', 'me', 'mí', 'mi', 'mis', 'conmigo', 'nosotros', 'nosotras', 'nos']),
  fr: new Set(['je', 'j', 'me', 'm', 'moi', 'mon', 'ma', 'mes', 'mien', 'mienne', 'nous']),
  pt: new Set(['eu', 'me', 'mim', 'meu', 'minha', 'meus', 'minhas', 'comigo', 'nós']),
  de: new Set(['ich', 'mich', 'mir', 'mein', 'meine', 'meinen', 'meinem', 'meiner', 'meines', 'wir', 'uns', 'unser']),
  it: new Set(['io', 'me', 'mi', 'mio', 'mia', 'miei', 'mie', 'noi']),
}
const startsWithPhrase = (text: string, phrases: string[]) =>
  phrases.some((p) => new RegExp(`^\\W*${escapeRe(p)}(?![\\p{L}])`, 'u').test(text))

function inCharacter(story: AiStory, language: Language): boolean {
  const title = clean(story.title)
  const body = clean(story.body)
  const both = `${title}\n${body}`
  const meta = language === 'en' ? META.en : [...META.en, ...META[language]]
  if (meta.some((m) => both.includes(m))) return false

  const openers = language === 'en' ? OPENERS.en : [...OPENERS.en, ...OPENERS[language]]
  if (startsWithPhrase(title, openers) || startsWithPhrase(body, openers)) return false

  const narration = outsideQuotes(body)
  if (REFUSALS.some((r) => narration.includes(r))) return false

  const firstPerson = words(narration).filter((t) => FIRST_PERSON[language].has(t)).length
  return firstPerson <= 2
}

/**
 * Output guard (SPEC §7.2). Nothing reaches a user or the cache unless it
 * passes every check. Order: cheap and decisive first; tampering right after
 * the schema so the model's own flag always wins.
 */
export function checkOutput(result: AiResult, ctx: OutputContext): OutputResult {
  if (result.finishReason !== 'STOP') return { ok: false, reason: 'finish' }

  let story: AiStory
  try {
    const parsed = AiStory.safeParse(JSON.parse(result.text))
    if (!parsed.success) return { ok: false, reason: 'schema' }
    story = parsed.data
  } catch {
    return { ok: false, reason: 'schema' }
  }

  if (story.tampering) return { ok: false, reason: 'tampering' }

  const text = `${story.title}\n${story.body}`
  if (MARKUP.test(text)) return { ok: false, reason: 'markup' }

  if (clean(text).includes(clean(ctx.canary))) return { ok: false, reason: 'leak' }
  const leaked = promptShingles(ctx.systemPrompt)
  for (const s of shingles(text)) if (leaked.has(s)) return { ok: false, reason: 'leak' }

  const lineBreaks = (story.body.match(/\n/g) ?? []).length
  if (lineBreaks > 1 || LIST_MARKER.test(story.body) || SPEAKER_LABEL.test(story.body)) {
    return { ok: false, reason: 'format' }
  }

  if (!languageOk(story.body, ctx.language)) return { ok: false, reason: 'language' }

  const n = sentenceCount(story.body)
  if (n < 3 || n > 5) return { ok: false, reason: 'sentences' }

  if (!ingredientsOk(story, ctx)) return { ok: false, reason: 'ingredients' }

  if (!inCharacter(story, ctx.language)) return { ok: false, reason: 'character' }

  return { ok: true, story }
}
