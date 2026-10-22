/** Small inline glyphs, decorative unless given a label. */
export function Skull({ lit }: { lit: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={lit ? 'skull skull--lit' : 'skull'} aria-hidden="true">
      <path d="M12 2.5c-5 0-8.5 3.4-8.5 8 0 2.9 1.4 4.8 3 5.9V19a1.5 1.5 0 0 0 1.5 1.5h1V18h1.5v2.5h3V18H15v2.5h1a1.5 1.5 0 0 0 1.5-1.5v-2.6c1.6-1.1 3-3 3-5.9 0-4.6-3.5-8-8.5-8Zm-3.3 10.9a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2Zm6.6 0a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2ZM12 16.2l-1.2-2h2.4l-1.2 2Z" />
    </svg>
  )
}

export function Eye() {
  return (
    <svg viewBox="0 0 32 20" className="glyph glyph--eye" aria-hidden="true">
      <path d="M2 10C6 3.5 11 1 16 1s10 2.5 14 9c-4 6.5-9 9-14 9S6 16.5 2 10Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16" cy="10" r="4.6" className="glyph__iris" />
    </svg>
  )
}

export function Hourglass() {
  return (
    <svg viewBox="0 0 20 28" className="glyph glyph--hourglass" aria-hidden="true">
      <path d="M3 2h14M3 26h14M5 2c0 7 10 7 10 12S5 19 5 26M15 2c0 7-10 7-10 12s10 5 10 12" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7.5 23h5L10 19.5Z" className="glyph__sand" />
    </svg>
  )
}
