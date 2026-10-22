import type { LanguageId, SettingId } from './catalog.ts'

export interface StoryRequest {
  setting: SettingId
  language: LanguageId
  words: string[]
}

export interface Story {
  id: string
  title: string
  body: string
  spookFactor: number
  setting: string
  words: string[]
}

/** Every way a request can end. Each one has its own state in the scene (SPEC §12). */
export type StoryOutcome =
  | { kind: 'story'; story: Story }
  | { kind: 'invalid' | 'rejected' | 'unavailable'; message: string }
  | { kind: 'rate_limited'; message: string; retryAfterSeconds: number }
  | { kind: 'offline'; message: string }

export const OFFLINE_MESSAGE = "We can't reach the campfire right now. Check your connection and try again."
/** Used when the server's reply isn't one we recognize. Raw server text is never shown. */
const UNKNOWN_REPLY = 'The fire has gone cold for a moment. Our storyteller will return shortly; please try again.'

interface Options {
  fetch?: typeof fetch
  clientId?: string
  signal?: AbortSignal
}

export async function requestStory(req: StoryRequest, opts: Options = {}): Promise<StoryOutcome> {
  const doFetch = opts.fetch ?? fetch
  let res: Response
  try {
    res = await doFetch('/api/story', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(opts.clientId ? { ...req, clientId: opts.clientId } : req),
      signal: opts.signal,
    })
  } catch {
    return { kind: 'offline', message: OFFLINE_MESSAGE }
  }

  let data: unknown
  try {
    data = await res.json()
  } catch {
    return { kind: 'unavailable', message: UNKNOWN_REPLY }
  }
  return parseReply(data)
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const str = (v: unknown): v is string => typeof v === 'string'

function parseReply(d: unknown): StoryOutcome {
  if (!isObj(d)) return { kind: 'unavailable', message: UNKNOWN_REPLY }
  if (d.ok === true && isObj(d.story)) {
    const s = d.story
    if (str(s.id) && str(s.title) && str(s.body) && typeof s.spookFactor === 'number' && str(s.setting) && Array.isArray(s.words)) {
      return {
        kind: 'story',
        story: { id: s.id, title: s.title, body: s.body, spookFactor: s.spookFactor, setting: s.setting, words: s.words.filter(str) },
      }
    }
    return { kind: 'unavailable', message: UNKNOWN_REPLY }
  }
  if (d.ok === false && str(d.message)) {
    if (d.kind === 'invalid' || d.kind === 'rejected' || d.kind === 'unavailable') return { kind: d.kind, message: d.message }
    if (d.kind === 'rate_limited' && typeof d.retryAfterSeconds === 'number' && d.retryAfterSeconds > 0) {
      return { kind: 'rate_limited', message: d.message, retryAfterSeconds: Math.ceil(d.retryAfterSeconds) }
    }
  }
  return { kind: 'unavailable', message: UNKNOWN_REPLY }
}
