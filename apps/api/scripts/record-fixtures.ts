/**
 * Records real Gemini HTTP responses into test/fixtures/gemini/ so adapter
 * tests check our parsing against what Gemini actually sends.
 * Uses quota. Run manually: `vpr record:fixtures` (needs GEMINI_API_KEY in ../../.env).
 * Saves only { status, body }: no headers, no request, so the key can't be captured.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { buildRequestBody, geminiUrl } from '../src/ai/geminiClient.ts'
import { buildSystemPrompt, type PromptInput } from '../src/ai/systemPrompt.ts'

const apiKey = process.env.GEMINI_API_KEY
const model = process.env.GEMINI_MODEL
if (!apiKey || !model) throw new Error('GEMINI_API_KEY and GEMINI_MODEL must be set')

const outDir = new URL('../test/fixtures/gemini/', import.meta.url)
mkdirSync(outDir, { recursive: true })

const config = { systemPrompt: buildSystemPrompt('canary-fixture'), maxOutputTokens: 300 }

async function record(name: string, input: PromptInput, opts: { key?: string; model?: string } = {}) {
  const res = await fetch(geminiUrl(opts.model ?? model!), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': opts.key ?? apiKey! },
    body: JSON.stringify(buildRequestBody(config, input)),
  })
  const body: unknown = await res.json().catch(() => null)
  const json = JSON.stringify({ status: res.status, body }, null, 2)
  if (json.includes(apiKey!)) throw new Error(`refusing to save ${name}: contains the API key`)
  writeFileSync(new URL(`${name}.json`, outDir), json + '\n')
  console.log(`${name}: HTTP ${res.status}`)
}

const attic: PromptInput = { setting: 'haunted-attic', language: 'en', words: ['teacup', 'lullaby', 'rust'], avoid: [] }

await record('story-en', attic)
await record('story-es', { ...attic, setting: 'foggy-graveyard', language: 'es', words: ['lantern', 'crow'] })
await record('error-bad-key', attic, { key: 'not-a-real-key' })
await record('error-bad-model', attic, { model: 'no-such-model-xyz' })
