import { describe, expect, it } from 'vite-plus/test'
import { FakeAiClient, storyResult } from '../src/ai/fakeClient.ts'
import { createApp as createAppWithDeps } from '../src/app.ts'
import { MESSAGES } from '../src/messages.ts'

const createApp = () => createAppWithDeps({ ai: new FakeAiClient(storyResult()) })

describe('GET /api/health', () => {
  it('returns 200 { ok: true } as JSON', async () => {
    const res = await createApp().request('/api/health')

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/^application\/json/)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('reveals nothing about dependencies, versions, or environment', async () => {
    const res = await createApp().request('/api/health')
    const text = await res.text()

    // Exact body: any extra field is a map handed to an attacker.
    expect(text).toBe('{"ok":true}')
    expect(res.headers.get('x-powered-by')).toBeNull()
  })

  it('rejects non-GET methods without leaking details', async () => {
    const res = await createApp().request('/api/health', { method: 'POST' })

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ ok: false, kind: 'not_found' })
  })
})

describe('unknown routes', () => {
  it.each(['/api/nope', '/api/../etc/passwd', '/api/health/../../secret', '/', '/api'])(
    '%s returns a JSON 404 with no stack trace',
    async (path) => {
      const res = await createApp().request(path)
      const text = await res.text()

      expect(res.status).toBe(404)
      expect(res.headers.get('content-type')).toMatch(/^application\/json/)
      expect(JSON.parse(text)).toEqual({ ok: false, kind: 'not_found' })
      expect(text).not.toMatch(/at \w+ \(|node_modules|Error:/)
    },
  )
})

describe('unexpected errors', () => {
  it('returns a generic JSON 503 and hides the error message', async () => {
    const app = createApp()
    app.get('/boom', () => {
      throw new Error('DATABASE_URL=postgres://secret@host leaked')
    })

    const res = await app.request('/api/boom')
    const text = await res.text()

    expect(res.status).toBe(503)
    const body = JSON.parse(text) as { ok: boolean; kind: string; message: string }
    expect(body.ok).toBe(false)
    expect(body.kind).toBe('unavailable')
    expect(MESSAGES.unavailable).toContain(body.message)
    expect(text).not.toContain('secret')
    expect(text).not.toContain('DATABASE_URL')
  })
})
