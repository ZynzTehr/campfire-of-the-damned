/** Mirrors the API's enums (apps/api/src/story.ts); catalog.test.ts fails if they drift. */
export const SETTINGS = [
  { id: 'haunted-attic', name: 'Haunted attic', line: 'Dust, rafters, and a chair that rocks on its own.', hue: 32 },
  { id: 'abandoned-asylum', name: 'Abandoned asylum', line: 'Peeling paint and doors that lock from outside.', hue: 95 },
  { id: 'foggy-graveyard', name: 'Foggy graveyard', line: 'Leaning stones and a bell that rings itself.', hue: 205 },
  { id: 'cursed-carnival', name: 'Cursed carnival', line: 'Rusted rides still turning after closing time.', hue: 352 },
  { id: 'sunken-lighthouse', name: 'Sunken lighthouse', line: 'A lamp that still burns for ships long gone.', hue: 178 },
  { id: 'witchs-cottage', name: "Witch's cottage", line: 'Drying herbs and a kettle that never cools.', hue: 280 },
] as const

export type SettingId = (typeof SETTINGS)[number]['id']

export const LANGUAGES = [
  { id: 'en', name: 'English' },
  { id: 'es', name: 'Español' },
  { id: 'fr', name: 'Français' },
  { id: 'pt', name: 'Português' },
  { id: 'de', name: 'Deutsch' },
  { id: 'it', name: 'Italiano' },
] as const

export type LanguageId = (typeof LANGUAGES)[number]['id']

/** Same rule as the API: letters or digits, then letters, digits, ' or -, up to 24 characters. */
export const WORD_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}'-]{0,23}$/u

export function checkWord(raw: string): boolean {
  return WORD_PATTERN.test(raw.normalize('NFKC').replace(/[\u2018\u2019\u02BC]/g, "'").trim())
}
