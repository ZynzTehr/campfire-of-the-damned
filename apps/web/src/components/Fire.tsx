import { useMemo } from 'react'

export type Mood = 'idle' | 'flare' | 'dim' | 'cold' | 'smoulder'

/** The campfire. Purely decorative: every state it shows is also said in words. */
export function Fire() {
  const embers = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        x: ((i * 37) % 100) - 50,
        drift: ((i * 53) % 60) - 30,
        delay: (i * 0.41) % 4,
        dur: 3 + ((i * 7) % 30) / 10,
      })),
    [],
  )
  return (
    <div className="fire" aria-hidden="true">
      <div className="fire__glow" />
      <div className="fire__smoke">
        <span />
        <span />
        <span />
      </div>
      <div className="fire__flames">
        <span className="flame flame--outer" />
        <span className="flame flame--left" />
        <span className="flame flame--right" />
        <span className="flame flame--mid" />
        <span className="flame flame--core" />
      </div>
      <div className="fire__embers">
        {embers.map((e, i) => (
          <span
            key={i}
            style={{ '--x': `${e.x}px`, '--drift': `${e.drift}px`, '--delay': `${e.delay}s`, '--dur': `${e.dur}s` } as React.CSSProperties}
          />
        ))}
      </div>
      <svg className="fire__logs" viewBox="0 0 240 60">
        <rect x="18" y="22" width="204" height="22" rx="11" transform="rotate(-9 120 33)" />
        <rect x="18" y="22" width="204" height="22" rx="11" transform="rotate(9 120 33)" />
        <ellipse cx="120" cy="46" rx="96" ry="9" className="fire__coals" />
      </svg>
    </div>
  )
}
