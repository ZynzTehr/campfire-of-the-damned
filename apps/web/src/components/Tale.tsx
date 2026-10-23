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
}: {
  story: Story | null
  animate: boolean
  onReset?: () => void
}) {
  return (
    <section className={`tale ${story ? 'tale--active' : ''}`} aria-label="The tale">
      <div className="sr-only" aria-live="polite">
        {story ? `${story.title}. ${story.body} Spook factor ${story.spookFactor} of 5.` : ''}
      </div>
      {story && <Parchment key={story.id + story.body} story={story} animate={animate} onReset={onReset} />}
    </section>
  )
}

function Parchment({
  story,
  animate,
  onReset,
}: {
  story: Story
  animate: boolean
  onReset?: () => void
}) {
  const { shown, finish, isDone } = useTypewriter(story.body, animate)

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
        <div className="parchment__spook" role="img" aria-label={`Spook factor ${story.spookFactor} of 5`}>
          <span className="parchment__spook-label">Spook Factor:</span>
          <div className="parchment__skulls">
            {[1, 2, 3, 4, 5].map((n) => (
              <Skull key={n} lit={n <= story.spookFactor} />
            ))}
          </div>
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
