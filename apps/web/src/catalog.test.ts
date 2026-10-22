import { describe, expect, it } from 'vite-plus/test'
import { LANGUAGES as API_LANGUAGES, SETTINGS as API_SETTINGS, WORD_REGEX as API_WORD_REGEX } from '../../api/src/story.ts'
import { LANGUAGES, SETTINGS, WORD_PATTERN, checkWord } from './catalog.ts'

describe('the web catalog matches the API contract', () => {
  it('offers exactly the settings the API accepts, in order', () => {
    expect(SETTINGS.map((s) => s.id)).toEqual([...API_SETTINGS])
  })
  it('offers exactly the languages the API accepts', () => {
    expect(LANGUAGES.map((l) => l.id)).toEqual([...API_LANGUAGES])
  })
  it('validates words with the same rule as the API', () => {
    expect(WORD_PATTERN.source).toBe(API_WORD_REGEX.source)
  })
})

describe('checkWord (instant feedback; the server still decides)', () => {
  it.each(['lantern', "don't", "jack-o'-lantern", 'café', 'Ñandú', '13th', '  crow  '])('accepts %j', (w) => {
    expect(checkWord(w)).toBe(true)
  })
  it.each(['old house', 'bat!', '<b>', 'a'.repeat(25), '-dash'])('refuses %j', (w) => {
    expect(checkWord(w)).toBe(false)
  })
})
