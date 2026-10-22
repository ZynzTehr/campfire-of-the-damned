/** All user-facing copy (SPEC §13). The server picks a random line per kind. */
export const MESSAGES = {
  rejected: [
    "Nice try, mortal. The spirits don't take orders from the living.",
    "The fire hisses. It knows what you're up to.",
    'Those aren\'t ingredients, those are instructions. The Campfire Keeper is not amused.',
    'Clever. Not clever enough. Three honest words, please.',
  ],
  invalid: ['The spell needs 1 to 3 single words, letters only. Try again.'],
  rate_limited: ['Even ghosts need a breather. Come back in {n} seconds.'],
  unavailable: [
    'The fire has gone cold for a moment. Our storyteller will return shortly; please try again.',
    'A chill wind cut through the camp and the tale was lost. Give it another try in a minute.',
  ],
} as const

export type MessageKind = keyof typeof MESSAGES

export function pickMessage(kind: MessageKind, random: () => number = Math.random): string {
  const lines = MESSAGES[kind]
  return lines[Math.floor(random() * lines.length) % lines.length]!
}
