import { useState } from 'react'
import type { Story } from '../api.ts'
import { useTypewriter } from '../hooks.ts'
import { Skull } from './Icons.tsx'

/**
 * The story. The typing effect is visual only (aria-hidden); screen readers get
 * the whole story once, from the polite live region, instead of letter by letter.
 */
export function Tale({
  story,
  animate,
  onReset,
  onRate,
}: {
  story: Story | null
  animate: boolean
  onReset?: () => void
  onRate?: (rating: number) => void
}) {
  return (
    <section className={`tale ${story ? 'tale--active' : ''}`} aria-label="The tale">
      <div className="sr-only" aria-live="polite">
        {story ? `${story.title}. ${story.body} Spook factor ${story.spookFactor} of 5.` : ''}
      </div>
      {story && (
        <Parchment
          key={story.id + story.body}
          story={story}
          animate={animate}
          onReset={onReset}
          onRate={onRate}
        />
      )}
    </section>
  )
}

const VERDICTS: Record<number, string> = {
  1: 'Too tame (1/5). The shadows promise deeper dread next time.',
  2: 'Mild chills (2/5). The fire stirs, seeking darker secrets.',
  3: 'A measured shiver (3/5). Cold dread lingers around the circle.',
  4: 'A terrifying tale (4/5). The embers crackle in fierce approval.',
  5: 'Pure bone-chilling horror (5/5). The Campfire Keeper nods into the dark.',
}

function Parchment({
  story,
  animate,
  onReset,
  onRate,
}: {
  story: Story
  animate: boolean
  onReset?: () => void
  onRate?: (rating: number) => void
}) {
  const { shown, finish, isDone } = useTypewriter(story.body, animate)
  const [userRating, setUserRating] = useState<number | null>(null)
  const [hoverRating, setHoverRating] = useState<number | null>(null)

  const activeRating = hoverRating ?? userRating ?? story.spookFactor

  const handleRate = (n: number) => {
    setUserRating(n)
    onRate?.(n)
  }

  return (
    <article className="parchment" data-done={isDone}>
      <header className="parchment__header">
        <span className="parchment__badge">Tale of the Damned</span>
        <h2 className="parchment__title">{story.title}</h2>
      </header>
      <div className="parchment__content" onClick={finish} title={isDone ? undefined : 'Click to reveal immediately'}>
        <p className="parchment__body" data-typed aria-hidden="true">
          {shown}
          {!isDone && <span className="parchment__nib" aria-hidden="true" />}
        </p>
      </div>
      <footer className="parchment__footer">
        <div className="parchment__spook-container">
          <div className="parchment__spook" role="img" aria-label={`Spook factor ${story.spookFactor} of 5`}>
            <span className="parchment__spook-label">
              {userRating !== null ? 'Your Rating:' : 'Spook Factor:'}
            </span>
            <div className="parchment__skulls">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`skull-btn ${userRating === n ? 'skull-btn--selected' : ''}`}
                  onClick={() => handleRate(n)}
                  onMouseEnter={() => setHoverRating(n)}
                  onMouseLeave={() => setHoverRating(null)}
                  onFocus={() => setHoverRating(n)}
                  onBlur={() => setHoverRating(null)}
                  aria-label={`Rate ${n} of 5 skulls`}
                  title={`Rate ${n} of 5 skulls`}
                >
                  <Skull lit={n <= activeRating} />
                </button>
              ))}
            </div>
          </div>
          {userRating !== null && (
            <p className="parchment__verdict" aria-live="polite">
              {VERDICTS[userRating]}
            </p>
          )}
        </div>
        {onReset && (
          <button
            type="button"
            className="rekindle-btn"
            onClick={onReset}
            aria-label="Rekindle the fire and tell another tale"
          >
            <span className="rekindle-btn__flame">🔥</span>
            <span>Rekindle the Fire</span>
          </button>
        )}
      </footer>
    </article>
  )
}
