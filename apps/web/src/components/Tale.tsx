import type { Story } from '../api.ts'
import { useTypewriter } from '../hooks.ts'
import { Skull } from './Icons.tsx'

/**
 * The story. The typing effect is visual only (aria-hidden); screen readers get
 * the whole story once, from the polite live region, instead of letter by letter.
 */
export function Tale({ story, animate }: { story: Story | null; animate: boolean }) {
  return (
    <section className="tale" aria-label="The tale">
      <div className="sr-only" aria-live="polite">
        {story ? `${story.title}. ${story.body} Spook factor ${story.spookFactor} of 5.` : ''}
      </div>
      {story && <Parchment key={story.id + story.body} story={story} animate={animate} />}
    </section>
  )
}

function Parchment({ story, animate }: { story: Story; animate: boolean }) {
  const { shown, finish } = useTypewriter(story.body, animate)
  const done = shown.length >= story.body.length
  return (
    <article className="parchment" data-done={done}>
      <h2 className="parchment__title">{story.title}</h2>
      <p className="parchment__body" data-typed aria-hidden="true" onClick={finish}>
        {shown}
        {!done && <span className="parchment__nib" />}
      </p>
      <div className="parchment__spook" role="img" aria-label={`Spook factor ${story.spookFactor} of 5`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Skull key={n} lit={n <= story.spookFactor} />
        ))}
      </div>
    </article>
  )
}
