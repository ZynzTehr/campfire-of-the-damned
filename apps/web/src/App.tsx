import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { requestStory, type Story, type StoryOutcome } from './api.ts'
import { checkWord, LANGUAGES, SETTINGS, type LanguageId, type SettingId } from './catalog.ts'
import { Fire, type Mood } from './components/Fire.tsx'
import { Eye, Hourglass } from './components/Icons.tsx'
import { SoundToggle } from './components/SoundToggle.tsx'
import { Tale } from './components/Tale.tsx'
import { Treeline } from './components/Treeline.tsx'
import { getClientId, useCountdown, usePauseWhenHidden, useReducedMotion } from './hooks.ts'
import './styles/app.css'

type Notice = { tone: 'hint' | 'rejected' | 'unavailable' | 'rate_limited'; text: string }

/** How the fire looks after each outcome (SPEC §12: the scene reacts). */
const MOOD: Record<Exclude<StoryOutcome['kind'], 'story'>, Mood> = {
  invalid: 'idle',
  rejected: 'cold',
  unavailable: 'dim',
  offline: 'dim',
  rate_limited: 'smoulder',
}

export default function App({ fetchImpl }: { fetchImpl?: typeof fetch } = {}) {
  const [setting, setSetting] = useState<SettingId>('haunted-attic')
  const [language, setLanguage] = useState<LanguageId>('en')
  const [words, setWords] = useState(['', '', ''])
  const [badWords, setBadWords] = useState<boolean[]>([false, false, false])
  const [busy, setBusy] = useState(false)
  const [mood, setMood] = useState<Mood>('idle')
  const [story, setStory] = useState<Story | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [wait, setWait] = useState({ seconds: 0, at: 0 })
  const left = useCountdown(wait.seconds, wait.at)
  const reducedMotion = useReducedMotion()
  usePauseWhenHidden()

  const scene = useRef<HTMLDivElement>(null)
  useParallax(scene, reducedMotion)

  useEffect(() => {
    if (left === 0 && mood === 'smoulder') setMood('idle')
  }, [left, mood])

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      if (busy || left > 0) return
      const filled = words.map((w) => w.trim()).filter(Boolean)
      if (filled.length === 0) {
        setNotice({ tone: 'hint', text: 'Give the fire at least one word.' })
        return
      }
      const bad = words.map((w) => w.trim() !== '' && !checkWord(w))
      setBadWords(bad)
      if (bad.some(Boolean)) {
        setNotice({ tone: 'hint', text: "One word each: letters, numbers, apostrophes or hyphens, up to 24 characters." })
        return
      }

      setBusy(true)
      setMood('flare')
      setNotice(null)
      const out = await requestStory({ setting, language, words: filled }, { fetch: fetchImpl, clientId: getClientId() })
      setBusy(false)
      if (out.kind === 'story') {
        setStory(out.story)
        setMood('idle')
        return
      }
      setMood(MOOD[out.kind])
      const tone = out.kind === 'invalid' ? 'hint' : out.kind === 'offline' ? 'unavailable' : out.kind
      setNotice({ tone, text: out.message })
      if (out.kind === 'rate_limited') setWait({ seconds: out.retryAfterSeconds, at: Date.now() })
    },
    [busy, left, words, setting, language, fetchImpl],
  )

  const hue = SETTINGS.find((s) => s.id === setting)!.hue
  const buttonLabel = busy ? 'The fire is listening…' : left > 0 ? `Wait ${left} s` : 'Tell the tale'

  return (
    <div ref={scene} className="scene" data-mood={mood} data-setting={setting} style={{ '--hue': hue } as React.CSSProperties}>
      <div className="scene__sky" aria-hidden="true" />
      <Treeline className="scene__trees scene__trees--far" seed={7} height={220} />
      <div className="scene__fog scene__fog--back" aria-hidden="true" />
      <Treeline className="scene__trees scene__trees--near" seed={31} height={160} />
      <div className="scene__fog scene__fog--front" aria-hidden="true" />
      <div className="scene__vignette" aria-hidden="true" />

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-3xl flex-col items-center px-5 pt-8 pb-12 sm:pt-12">
        <header className="flex w-full items-start justify-between gap-4">
          <div>
            <h1 className="masthead">Campfire of the Damned</h1>
            <p className="lede mt-2">Choose where we sit and give the fire up to three words. It will tell you a tale.</p>
          </div>
          <SoundToggle />
        </header>

        <div className="mt-8 flex w-full flex-1 flex-col items-center justify-end gap-2">
          <Tale story={story} animate={!reducedMotion} />
          <Fire />
          <p role="status" className="notice" data-tone={notice?.tone ?? 'none'}>
            {notice?.tone === 'rejected' && <Eye />}
            {notice?.tone === 'rate_limited' && <Hourglass />}
            <span>{notice?.text ?? ''}</span>
          </p>
        </div>

        <form className="ritual mt-6 flex w-full flex-col gap-6" onSubmit={onSubmit} noValidate>
          <div role="radiogroup" aria-labelledby="where" className="flex flex-col gap-3">
            <span id="where" className="ritual__label">
              Where are we sitting?
            </span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SETTINGS.map((s) => (
                <label key={s.id} className="place" style={{ '--place-hue': s.hue } as React.CSSProperties}>
                  <input
                    type="radio"
                    name="setting"
                    value={s.id}
                    checked={setting === s.id}
                    onChange={() => setSetting(s.id)}
                    aria-describedby={`line-${s.id}`}
                    className="sr-only"
                  />
                  <span className="place__name">{s.name}</span>
                  <span id={`line-${s.id}`} className="place__line" aria-hidden="true">
                    {s.line}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="ritual__label">Your words</legend>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {words.map((w, i) => (
                <input
                  key={i}
                  type="text"
                  className="stone"
                  aria-label={`Word ${i + 1}`}
                  aria-invalid={badWords[i]}
                  placeholder={['a lantern', 'a crow', 'rust'][i]}
                  maxLength={24}
                  autoComplete="off"
                  value={w}
                  onChange={(e) => {
                    const next = [...words]
                    next[i] = e.target.value
                    setWords(next)
                    if (badWords[i]) setBadWords(badWords.map((b, j) => (j === i ? false : b)))
                  }}
                />
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end sm:justify-between">
            <label className="flex flex-col gap-2">
              <span className="ritual__label">Language</span>
              <select className="tongue" value={language} onChange={(e) => setLanguage(e.target.value as LanguageId)}>
                {LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="summon" disabled={busy || left > 0}>
              {buttonLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/** Gentle depth on pointer move: far trees move less than near ones. Off with reduced motion. */
function useParallax(ref: React.RefObject<HTMLDivElement | null>, off: boolean) {
  useEffect(() => {
    const el = ref.current
    if (!el || off) return
    let frame = 0
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        el.style.setProperty('--px', ((e.clientX / window.innerWidth) * 2 - 1).toFixed(3))
        el.style.setProperty('--py', ((e.clientY / window.innerHeight) * 2 - 1).toFixed(3))
      })
    }
    window.addEventListener('pointermove', move)
    return () => {
      window.removeEventListener('pointermove', move)
      cancelAnimationFrame(frame)
    }
  }, [ref, off])
}
