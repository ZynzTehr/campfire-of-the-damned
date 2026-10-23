import { useEffect, useState } from 'react'

const REDUCED = '(prefers-reduced-motion: reduce)'

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia(REDUCED).matches)
  useEffect(() => {
    const mq = window.matchMedia(REDUCED)
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

/** Seconds left, ticking once a second; 0 when done. `key` restarts it. */
export function useCountdown(seconds: number, key: unknown): number {
  // State remembers which wait it belongs to, so a new wait reads as full on its first render
  // instead of showing the previous wait's 0 for one frame.
  const [state, setState] = useState({ key, left: seconds })
  const left = state.key === key ? state.left : seconds
  useEffect(() => {
    const setLeft = (n: number) => setState({ key, left: n })
    setLeft(seconds)
    if (seconds <= 0) return
    const started = Date.now()
    const id = setInterval(() => {
      const remaining = Math.max(0, seconds - Math.floor((Date.now() - started) / 1000))
      setLeft(remaining)
      if (remaining === 0) clearInterval(id)
    }, 1000)
    return () => clearInterval(id)
  }, [seconds, key])
  return left
}

/** Reveals text with deliberate horror pacing, pausing on punctuation for tension. */
export function useTypewriter(text: string, enabled: boolean): { shown: string; finish: () => void; isDone: boolean } {
  const [count, setCount] = useState(enabled ? 0 : text.length)

  useEffect(() => {
    if (!enabled) {
      setCount(text.length)
      return
    }
    setCount(0)

    let timer: ReturnType<typeof setTimeout> | undefined

    function step(current: number) {
      if (current >= text.length) return

      const next = current + 1
      setCount(next)

      if (next >= text.length) return

      const char = text[current]
      let delay = 44

      if (char === '.' || char === '!' || char === '?') {
        delay = 480
      } else if (char === '…' || char === '—') {
        delay = 580
      } else if (char === ',' || char === ';' || char === ':') {
        delay = 200
      }

      timer = setTimeout(() => step(next), delay)
    }

    timer = setTimeout(() => step(0), 100)

    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [text, enabled])

  return {
    shown: text.slice(0, count),
    finish: () => setCount(text.length),
    isDone: count >= text.length,
  }
}

/** Pauses every CSS animation while the tab is hidden (SPEC §12: effects pause when hidden). */
export function usePauseWhenHidden(): void {
  useEffect(() => {
    const sync = () => {
      document.documentElement.dataset.hidden = String(document.hidden)
    }
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])
}

const CLIENT_ID_KEY = 'cotd-client-id'

/** Random id kept in this browser so the server can avoid repeating a story. Not identity. */
export function getClientId(): string | undefined {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(CLIENT_ID_KEY, id)
    }
    return id
  } catch {
    return undefined
  }
}
