import { describe, expect, it, vi } from 'vite-plus/test'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import App from './App.tsx'
import { setReducedMotion } from './test/setup.ts'

const story = {
  id: 's1',
  title: 'The Porcelain Choir',
  body: 'In the attic, a teacup hummed a lullaby. Rust crept along the rafters. The cup was full of something that was not tea.',
  spookFactor: 4,
  setting: 'haunted-attic',
  words: ['teacup', 'rust'],
}
const json = (status: number, body: unknown) => async (_url: string, _init: RequestInit): Promise<Response> => new Response(JSON.stringify(body), { status })

function setup(reply?: (url: string, init: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(reply ?? json(200, { ok: true, story, source: 'ai' }))
  render(<App fetchImpl={fetchMock as unknown as typeof fetch} />)
  const word = (n: number) => screen.getByRole('textbox', { name: `Word ${n}` })
  const tell = () => screen.getByRole('button', { name: /tell the tale/i })
  const scene = () => document.querySelector('[data-mood]') as HTMLElement
  return { fetchMock, word, tell, scene }
}
async function submitWords(t: ReturnType<typeof setup>, ...words: string[]) {
  words.forEach((w, i) => fireEvent.change(t.word(i + 1), { target: { value: w } }))
  await act(async () => {
    fireEvent.click(t.tell())
  })
}

describe('App: first render', () => {
  it('has a single page heading with the app name', () => {
    setup()
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('Campfire of the Damned')
  })

  it('does not call the network until asked', () => {
    const { fetchMock } = setup()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('settings are a labelled radio group, one chosen by default', () => {
    setup()
    const group = screen.getByRole('radiogroup', { name: /where/i })
    const radios = within(group).getAllByRole('radio')
    expect(radios).toHaveLength(6)
    expect(radios.filter((r) => (r as HTMLInputElement).checked)).toHaveLength(1)
  })

  it('choosing a setting changes the scene', () => {
    const t = setup()
    fireEvent.click(screen.getByRole('radio', { name: /sunken lighthouse/i }))
    expect(t.scene().dataset.setting).toBe('sunken-lighthouse')
  })

  it('sound is off by default and the toggle is a real pressed/unpressed button', () => {
    setup()
    expect(screen.getByRole('button', { name: /sound/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('the tale region is a polite live region', () => {
    setup()
    expect(document.querySelector('[aria-live="polite"]')).not.toBeNull()
  })
})

describe('App: telling a tale', () => {
  it('sends the setting, language and only the filled-in words, then shows the story', async () => {
    const t = setup()
    fireEvent.click(screen.getByRole('radio', { name: /haunted attic/i }))
    fireEvent.change(screen.getByRole('combobox', { name: /language/i }), { target: { value: 'es' } })
    await submitWords(t, ' teacup ', '', 'rust')

    expect(JSON.parse(t.fetchMock.mock.calls[0]![1].body as string)).toMatchObject({ setting: 'haunted-attic', language: 'es', words: ['teacup', 'rust'] })
    expect(await screen.findByRole('heading', { name: story.title })).toBeInTheDocument()
    expect(screen.getAllByText(story.body).length).toBeGreaterThan(0)
    expect(screen.getByRole('img', { name: 'Spook factor 4 of 5' })).toBeInTheDocument()
  })

  it('sends a stable client id kept in localStorage', async () => {
    const t = setup()
    await submitWords(t, 'crow')
    await submitWords(t, 'crow')
    const ids = t.fetchMock.mock.calls.map((c) => JSON.parse(c[1].body as string).clientId)
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/)
    expect(ids[1]).toBe(ids[0])
  })

  it('while waiting, the button says so and cannot be pressed twice', async () => {
    let resolve!: (r: Response) => void
    const t = setup(() => new Promise<Response>((r) => (resolve = r)))
    fireEvent.change(t.word(1), { target: { value: 'crow' } })
    fireEvent.click(t.tell())
    const busy = screen.getByRole('button', { name: /listening/i })
    expect(busy).toBeDisabled()
    expect(t.scene().dataset.mood).toBe('flare')
    fireEvent.click(busy)
    expect(t.fetchMock).toHaveBeenCalledTimes(1)
    await act(async () => resolve(new Response(JSON.stringify({ ok: true, story, source: 'ai' }), { status: 200 })))
  })

  it('with motion allowed, the story types out visually but screen readers get it whole', async () => {
    setReducedMotion(false)
    const t = setup()
    await submitWords(t, 'crow')
    const live = document.querySelector('[aria-live="polite"]')!
    expect(live.textContent).toContain(story.body)
    const typed = document.querySelector('[data-typed]')!
    expect(typed).toHaveAttribute('aria-hidden', 'true')
    expect(typed.textContent!.length).toBeLessThan(story.body.length)
  })
})

describe('App: problems are shown in the scene, never as a blank page', () => {
  it('no words → a hint, no request', async () => {
    const t = setup()
    await submitWords(t)
    expect(screen.getByText(/at least one word/i)).toBeInTheDocument()
    expect(t.fetchMock).not.toHaveBeenCalled()
  })

  it('a word the server would refuse → a hint on that word, no request', async () => {
    const t = setup()
    await submitWords(t, 'old house')
    expect(t.word(1)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(/one word each/i)).toBeInTheDocument()
    expect(t.fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['rejected', 400, 'cold', 'Nice try, mortal.'],
    ['unavailable', 503, 'dim', 'The fire has gone cold for a moment.'],
    ['invalid', 400, 'idle', 'The spell needs 1 to 3 single words.'],
  ])('%s → the server\'s message, fire mood %s', async (kind, status, mood, message) => {
    const t = setup(json(status, { ok: false, kind, message }))
    await submitWords(t, 'crow')
    expect(screen.getByRole('status')).toHaveTextContent(message)
    expect(t.scene().dataset.mood).toBe(mood)
  })

  it('offline → the connection message, fire dims', async () => {
    const t = setup(async () => {
      throw new TypeError('Failed to fetch')
    })
    await submitWords(t, 'crow')
    expect(screen.getByRole('status')).toHaveTextContent(/can't reach the campfire/i)
    expect(t.scene().dataset.mood).toBe('dim')
  })

  it('rate limited → a live countdown; the button waits it out', async () => {
    vi.useFakeTimers()
    try {
      const t = setup(json(429, { ok: false, kind: 'rate_limited', message: 'Even ghosts need a breather. Come back in 3 seconds.', retryAfterSeconds: 3 }))
      await submitWords(t, 'crow')
      expect(t.scene().dataset.mood).toBe('smoulder')
      expect(screen.getByRole('button', { name: /wait 3/i })).toBeDisabled()
      await act(async () => vi.advanceTimersByTime(1000))
      expect(screen.getByRole('button', { name: /wait 2/i })).toBeDisabled()
      await act(async () => vi.advanceTimersByTime(2000))
      expect(t.tell()).toBeEnabled()
    } finally {
      vi.useRealTimers()
    }
  })
})
