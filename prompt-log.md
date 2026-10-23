# Prompt Log

Local prompt history and build log for tracking iterations, model calls, decisions, and guardrail validations.

---

## Session: 2026-10-21

### Entry 1

- **Timestamp:** 2026-10-21 11:29:44
- **Prompt:**
  > [Day Brief: Single AI feature with control + reliability, back-end AI call, system prompt, 3 guardrails (input, output, failure), cost cap, GitHub ready]
  > - put this in requirements.md file
- **Goal:** Initialize `requirements.md` with the Day Brief and project rubric, and brainstorm viable, reliable Halloween-themed AI feature concepts.
- **Action Taken:** Created `requirements.md` containing the Day Brief, Build Plan, Build Loop, and Control Checklist.

---

### Entry 2

- **Timestamp:** 2026-10-21 11:34:35
- **Prompt:**
  > - start a prompt-log file as well
- **Goal:** Initialize `prompt-log.md` in the project root to satisfy the Control Checklist requirement ("Prompt Log current").
- **Action Taken:** Created `prompt-log.md` tracking user prompts, decisions, and actions taken.

---

### Entry 3

- **Timestamp:** 2026-10-22 07:54:18
- **Prompt:**
  > need ideas for this week's project. i thought about making a story generator, but i don't know yet. main requirement is that it has to be halloween themed
- **Goal:** Brainstorm Halloween project ideas (leaning story generator) that fit the spec: one AI call, system prompt, 3 guardrails, cost cap.
- **Action Taken:** Proposed story-generator variants and alternatives, ranked by how easy each is to guard and demo. No code yet; decision pending.

---

### Entry 4

- **Timestamp:** 2026-10-22 09:14:28
- **Prompt:**
  > i've decided on the story generator. what stack should we go with? there are some things we need to consider before moving on:
  > - like no repetitive stories, maybe a cache for storage of stories to save on token (should we use a server for this to be able to have less repetitiveness across different users. if we use localstorage, users would see older stories again and again).
  > - what stack to use
- **Goal:** Determine project tech stack and server-side caching/anti-repetition architecture adhering to the Day Brief (secret API key on backend, 3 guardrails, cost-aware).
- **Action Taken:** Formulated recommendations for stack (Node/Express vs Python/FastAPI) and server-side cache design with anti-repetition.

---

### Entry 5

- **Timestamp:** 2026-10-22 10:04:41
- **Prompt:**
  > - I have Vite+; let's use that.
  > - Let's use React TypeScript, Tailwind 4.0 for scaffolding, and custom CSS for styles.
  > - I have Neon; we can use that.
  > - What AI API should we use? I want something reliable but cheap or free. Would Gemini be good enough for this?
  > - Let's break this down into phases: backend first, then testing, and the frontend towards the end.
  > - Create a branch for each phase; we'll work on a single phase at a time.
  > - The frontend should be very expressive and very immersive. Users should get a polite message when the connection to the API breaks (AI or backend). Since we're protecting ourselves from prompt injection and other ways to abuse our system, I want a cheeky message sent back to the user to let them know they're doing something they're not supposed to.
  > - TDD should be a high priority. Consider attack vectors and edge cases; let's not just test for things that would pass based on what we created. Consider the effort necessary to break or compromise our system versus the reward to potential attackers.
  > - Create a spec file with all the relevant information to work from.
- **Goal:** Lock the stack, pick the AI provider, define phases and branches, and write a spec covering guardrails, threat model, and test plan.
- **Action Taken:** Created `SPEC.md` (stack: Vite+ / React TS / Tailwind 4 layout + custom CSS / Hono API / Zod / Gemini / Neon). Recommended Gemini Flash-Lite with the model id kept in an env var. Wrote an effort-vs-reward threat model and an attack-first test plan. Made the initial commit on `main` and created seven phase branches.

---

### Entry 6

- **Timestamp:** 2026-10-22 10:15:19
- **Prompt:**
  > 1. Gemini, so that we have free usage. If we hit rate limits on a key, we can generate a new one for the demo. We should be fine; I think we have 15 requests per minute on the Gemini free tier?
  > 2. 3–5 sentences feels better. Let's create guardrails for our app with a paid AI API in mind, so that if we move to a paid service in the future there are no runaway costs.
  > 3. Yes.
- **Goal:** Record the decisions and make the cost cap safe for a paid API.
- **Action Taken:** Updated `SPEC.md`. Corrected two assumptions: free-tier limits are per project and per model and change over time, so read them from AI Studio instead of assuming 15 RPM; a new key in the same project shares the same quota. Rewrote the cost cap as 11 layers: kill switch, prompt and output token caps, per-IP and app-wide limits, concurrency cap, max 2 attempts per request, daily call cap, daily/monthly dollar caps with reservation before each call, and fail-closed config validation. Added shadow-cost tracking on the free tier, parallel-overshoot tests, and a Neon usage schema with atomic reservation. Resolved the open questions.

---

### Entry 7

- **Timestamp:** 2026-10-22 10:21:30
- **Prompt:**
  > When a user prompts, did you consider a user trying to get our AI to assume a character personality, or to respond in a way that falls outside our intent for this app?
- **Goal:** Check whether the spec covers persona hijacking and out-of-intent output, and close the gaps.
- **Action Taken:** Only partly covered before (generic injection rules, no persona or format/language checks). Added §7.4 "Intent boundary" to `SPEC.md`: words may flavor the story but can't change narrator, format, language, rating, or purpose. Added prompt rule 9, a `tampering` flag in the output schema, sorted JSON word lists, a cross-slot phrase check, and output checks for prose format, English, in-character voice, and third-person narration. Added a threat-model row and a persona/drift test suite with over-blocking checks.
- **Mistakes caught in my own draft:** (1) blocking `dan` and `mode` as single words would have rejected a ghost named Dan; narrowed to `dan mode` / `developer mode`. (2) Banning `rules` and `here's` anywhere would reject normal prose; limited to position-specific checks. (3) Sorting words to break up sentences can *create* a phrase (`as act dan` → `act as dan`); the phrase check now runs on both the typed and the sorted order, with a test.

---

### Entry 8

- **Timestamp:** 2026-10-22 10:32:04
- **Prompt:**
  > - Are we using mock data for our tests (API calls, etc.)?
  > - We'll deploy to Vercel, with a local demo as a fallback.
- **Goal:** Define what's faked vs. real in tests, and adapt the design for Vercel.
- **Action Taken:** Added a "Test doubles" table to `SPEC.md` §11: fakes for unit/route tests, recorded real Gemini responses for the adapter, a real Neon test branch for SQL and concurrency, a manual live eval, and smoke tests after deploy. Added a network tripwire so unit tests can't call real APIs. Added §15 Deployment: in-memory limits don't hold on Vercel (instances come and go), so all shared limits move to Neon in production, and the server refuses to start on Vercel with memory stores. Replaced `TRUST_PROXY` with `IP_SOURCE` (Vercel overwrites `x-real-ip`), disabled AI on preview deployments, set `maxDuration: 30` with a 25 s request deadline, and added security headers.
- **Mistake caught in my own draft:** the first local-fallback plan said to demo new stories with Wi-Fi off, which can't work because Gemini is remote. Added `SEED_STORIES` so the offline fallback still serves real stories.

---

### Entry 9

- **Timestamp:** 2026-10-22 10:48:09
- **Prompt:**
  > We could allow stories in a different language; we don't have to prohibit this. If there isn't enough time, we can keep it as a future feature. I don't think it should be that difficult to add, and it might even be more impressive to have that feature at the demo.
  > Begin Phase 1.
- **Goal:** Make story language a supported option without weakening the guardrails, then build the Phase 1 scaffold.
- **Action Taken:**
  - **Language:** added an optional `language` enum to `SPEC.md` (`en | es | fr | pt | de | it`, default `en`, Latin scripts only so the output check stays simple). The language is only ever chosen through this field, never inferred from the words, so typing "spanish" can't switch it. The "English only" output check became "matches the requested language". Fallback if time runs short: set the enum to `["en"]` and hide the picker.
  - **Phase 1 (`phase-1-scaffold`):** Vite+ pnpm workspace with `apps/web` (React TS, Tailwind 4 for layout, custom CSS tokens, jsdom tests) and `apps/api` (Hono, strict TS, Node runs the `.ts` sources directly). Both apps have a network tripwire in test setup. Tests were written first and seen failing: web (one `h1`, no network on render) and API health (exact `{"ok":true}` body, JSON 404 for unknown routes, traversal paths, and wrong methods; a thrown error carrying a fake `DATABASE_URL` returns a generic 500 with no secret). Results: 11/11 tests green, `tsc` clean, live `curl` against the running server checked, `.env.example` committed with placeholders only, `.env` confirmed git-ignored, secret scan of the staged diff clean.
- **Problems hit:** `vp create vite` hung on an interactive prompt, and `vp create --directory` refuses paths outside the current folder. Fixed by running `create-vite` non-interactively and then `vp migrate` from the workspace root.

---

### Entry 10

- **Timestamp:** 2026-10-22 11:07:43 / 11:18:08
- **Prompt:**
  > Push it to GitHub.
  >
  > Created a Gemini API key; it's in the `.env` file.
- **Goal:** Publish Phase 1, then get the AI key working for Phase 2.
- **Action Taken:** Scanned the unpushed commits and pushed `main` to GitHub. Checked the key by listing the available models (HTTP 200) without printing it, and set `GEMINI_MODEL=gemini-3.5-flash-lite` (newest stable Flash-Lite) in `.env`. Switched to `phase-2-ai-call` and fast-forwarded it to `main`. Turned the ad hoc secret scan into `scripts/scan-secrets.sh` (`vpr scan:secrets`). It checks tracked and staged files for both Google key formats, Postgres URLs with passwords, and tracked `.env` files. Proved it works both ways: a canary file with a fake key fails the scan, and the clean tree passes. Rescanned all git history with the new patterns: 0 matches.
- **Mistake caught in my own work:** the secret scan I ran before the push only matched `AIza…` keys, but the real key uses the newer `AQ.` format, so the scan would have missed it. Nothing leaked; the key was never committed. Also, opening `.env` in the editor sent the key into the chat, so it should be rotated after the demo.

---

### Entry 11

- **Timestamp:** 2026-10-22 11:45:03
- **Prompt:**
  > Begin Phase 2.
- **Goal:** Make the real AI call work end to end (system prompt in code, structured output, `POST /api/story`), test it with fakes and recorded real responses, judge real outputs, and commit before any guardrails.
- **Action Taken:**
  - **Probed the real API first.** `thinkingBudget: 0` returns HTTP 400 on Gemini 3.x (`thinkingLevel: "minimal"` works). Without schema bounds the model returned `spookFactor: 9`. Responses carry a `thoughtSignature` part. A bad key returns 400 `API_KEY_INVALID`, not 401.
  - **Built:**
    - `story.ts`: Zod request and output schemas.
    - `ai/systemPrompt.ts`: the system prompt in code, with a boot-time canary. Words are sorted and JSON-encoded, and the language comes only from the request field.
    - `ai/geminiClient.ts`: a REST adapter with an injectable `fetch`, chosen instead of the SDK so tests can replay real responses.
    - `ai/fakeClient.ts`, `messages.ts`, and the `POST /api/story` route.
  - **Tests:** written first and seen failing where it applied: prompt builder, 24 adapter tests against 4 recorded real fixtures plus every failure kind, and 35 route tests. Result: 88/88 green.
  - **Real calls:** real `curl` calls returned stories in English and Spanish.
  - **Live eval:** ran 16 real calls through `vpr eval` and judged them by hand. Persona, format, and language attacks all held. Measured cost was about $0.0004–0.0005 per call (shadow). Two of 16 calls hit the 10 s timeout, which is noted for Phase 3.
- **Problems found by judging real output, and fixed:** French and German stories drifted into first person ("J'ai voulu fuir"), the narrator named itself in the story, and the slug "sunken-lighthouse" leaked into the prose. Tightened prompt rule 9 and sent settings as readable phrases. The re-eval showed 0 first-person uses, 0 narrator mentions, and 0 slugs. Also learned that the planned third-person output check needs pronoun lists for every supported language, not just English and Spanish (Phase 3).
- **Mistakes caught in my own work:**
  1. I piped the secret scan through `tail`, which hid its failing exit code, so a commit with a key-shaped fake test key went through. Renamed the fake key and amended the unpushed commit. Gating commands are no longer piped.
  2. The `vp run` task cache replayed a stale "typecheck passed" after new files were added. I turned the cache off and proved `tsc` now catches a deliberately planted type error.
  3. I wrote the prompt module before running its tests red, so I checked them by mutation instead: removing the sort made 2 tests fail.

---

### Entry 12

- **Timestamp:** 2026-10-22 13:11:00
- **Prompt:**
  > Push to GitHub. Begin Phase 3.
- **Goal:** Add the three guardrail layers (input, output, failure) with attack-first tests, prove each guard is load-bearing, try to break the live app by hand, and record any deviations from the spec.
- **Action Taken:**
  - **Input guard** (`guards/input.ts`): 1 KB body cap (413), JSON only (415), a strict shape check, and word normalization (NFKC, invisible characters stripped, curly apostrophes straightened). It then checks markup, steering words, and steering phrases (in typed **and** sorted order), Cyrillic/Greek look-alikes folded for matching, and a profanity list, and only then the word regex.
  - **Output guard** (`guards/output.ts`): finish reason, schema, the model's own tampering flag, markup, prompt and canary leak, prose format, requested language, 3–5 sentences, ingredients used, in character and third person. Real Phase 2 stories are fixtures: the good ones must pass, and the real French and German first-person drift must fail.
  - **Failure handling** (`app.ts`): at most 2 AI calls per request, shared between retry and regeneration. Retries only on timeout, 5xx (with 200–600 ms jitter), or network errors; never on 429 or auth errors. Tampering is rejected and not regenerated. 25 s request deadline. Logs carry only kinds and reasons. Per-attempt timeout raised from 10 s to 12 s.
  - **Tests:** 334 green, plus `tsc`. A mutation script broke 9 guards one at a time (sorted-phrase check, confusable fold, invisible-character strip, markup reject, quote stripping, attempt cap, retry on 429, regenerate on tampering, deadline race); each made real assertions fail.
  - **Manual break attempts against the live server:** "ignore previous instructions", a zero-width `ig​nore`, Cyrillic `іgnоrе`, "act as", sorted `as`/`act`/`dan`, `</INGREDIENTS>`, an extra `system` field, a 2 KB body, text/plain, broken JSON, and GET all got the right 400/413/415/404 with no AI call. Legit English stories and `don't`/`jack-o'-lantern` got 200.
- **Found live:** `gemini-3.5-flash-lite` is very slow right now: 9–21 s even for "say hi" (all model time; connect is 0.04 s). Every story timed out, and the app correctly retried once and returned a polite 503 inside the deadline. `gemini-3.5-flash` answered in about 1 s but hit free-tier 429s after a handful of calls (no retry, as designed), and once returned 5xx twice (retried, then 503). All three failure paths were seen working against the real API.
- **Mistakes caught in my own work:**
  1. The default fake story ("teacup, lullaby, rust") failed the new ingredients check for any other words, so 20+ tests returned 503. Added a fake that writes its story from the request's own words.
  2. **Real bug:** after a timeout at the deadline, the retry got an already-aborted signal. Its abort event never fires, so the request hung forever. Fixed by never starting an attempt past the deadline and racing each call against it. Added a test for a client that ignores its signal.
  3. A secrets test called `res.clone()` after the body was already read, so it failed for the wrong reason.
  4. The secret scan only covers tracked files, so new files are staged before scanning.
  5. In zsh, `$m:generateContent` is read as a variable modifier, which gave a fake 404 while comparing models. Fixed by writing `${m}`.

---

### Entry 13

- **Timestamp:** 2026-10-22 13:24:49
- **Prompt:**
  > The flash model has 10 RPM, 250,000 TPM, and is typically capped at 1,500 RPD (resets at midnight Pacific time). Flash-lite shows 15 RPM, but not the others.
- **Goal:** Use the real free-tier limits to choose the demo model and set the app-wide caps, then build Phase 4 (the cost cap, SPEC §8).
- **Action Taken:**
  - **Model:** checked latency again before switching. Flash-lite had recovered (0.76 s, against 1.0 s for flash), so the 9–21 s calls were a temporary slowdown on Google's side. Kept flash-lite: higher RPM, lower cost, and the prompt was tuned on it. Switching is one line (`GEMINI_MODEL`, plus `APP_RPM_CAP=8` for flash).
  - **Caps:** `APP_RPM_CAP=12` (80% of 15) and `APP_RPD_CAP=1000` (under flash's ~1,500; flash-lite's RPD isn't shown, so I assumed it is no lower). App-wide caps count AI calls, not requests, because a retry uses Google quota too.
  - **Built:**
    - `config.ts`: fail-closed config. Every cost setting must be present, a plain number, above 0 and under a ceiling. All problems are reported by name and never with a value.
    - `limits/store.ts`: an atomic memory store.
    - `limits/costGate.ts`: kill switch, prompt ceiling, per-IP and app-wide limits, concurrency leases, and worst-case reservation reconciled from usage metadata, with Pacific-day budgets in micro-dollars. Cache-only "resting" mode, 429 with `Retry-After`, and per-call cost logs with 80% warnings.
  - **Tests:** 423 green plus `tsc`. 65 config tests. Cost tests include a parallel-overshoot test (20 concurrent requests; only the 3 that fit the budget reach the AI) and a concurrency peak test. 14 cost-layer mutations were all caught.
  - **Live:**
    - The server refused to start with the old `.env`, listing 16 missing settings by name.
    - 5 real stories took 1.0–2.5 s each and cost **$0.000426–0.000484** each (527 tokens in, 107–130 out).
    - The 6th request from the same IP got a 429 in 1.5 ms with "Come back in 53 seconds".
    - `AI_ENABLED=false` returned the resting message with no AI call.
- **Decision:** on a timeout or network error the reservation keeps the worst case (Google may have billed it). On an error status it is released. This refines SPEC §8.2, which said "release on failure".
- **Mistakes caught in my own work:**
  1. With the SPEC default `MAX_PROMPT_TOKENS=600`, every call would have been refused (the chars ÷ 3 estimate of the real prompt is ~690). Found by measuring before writing code.
  2. A constructor with TypeScript parameter properties passed every test, but `tsc` showed that Node, which runs our `.ts` by stripping types, would have crashed at startup. Changed to plain fields.
  3. The "no daily $ check" mutation survived: every dollar test set daily = monthly, so the monthly check covered for it. Separated the caps in two tests.
  4. **Repeated a Phase 2 mistake:** I piped the mutation script into `head`, which killed it partway through and left a mutation ("no reconcile") in `store.ts`, so the suite went red. Restored the line and made both mutation scripts restore files on INT/TERM/PIPE/HUP too. Rule: never pipe a script that modifies files.
  5. The overshoot test expected 17 "resting" refusals and got 7 resting plus 10 "busy" (concurrency). The behavior was correct (3 calls, spend under the cap); the expectation was wrong.

---

### Entry 14

- **Timestamp:** 2026-10-22 14:10:10
- **Prompt:**
  > It seemed like you were stuck in a loop, so I stopped the process. Continue and tell me what went wrong.
- **Goal:** Explain the stall and continue Phase 4.
- **What went wrong:** it wasn't a loop. A single file-write tool call hung: the file reached the disk at 13:33 and was complete, but the editor never reported back, so I waited until the cancel at 14:09. An earlier small write had taken 5 minutes the same way. The hang was in the IDE's step after writing (diff or format), not in the code or the repo. Nothing was lost or run twice.
- **Action Taken:** checked the file was intact, then switched to writing files with shell heredocs and `perl` edits for the rest of Phase 4. There were no further stalls.

---

### Entry 15

- **Timestamp:** 2026-10-22 15:14:30
- **Prompt:**
  > Push to GitHub. Begin Phase 6.
- **Goal:** Push Phases 3–4, then build the frontend (SPEC §12): an immersive campfire scene where every API outcome looks different, without weakening anything the backend guarantees.
- **Action Taken:**
  - **Push:** secret scan clean, then `main` (Phases 1–4, `00adb03`) pushed to GitHub. Started branch `phase-6-frontend`.
  - **Design plan** (frontend-design skill): the fire is the one bold element and reacts to every state, with five moods: idle, flare (waiting), dim (unavailable/offline), cold (rejected: teal flame, an eye glances about), smoulder (rate-limited: hourglass and live countdown). Night-forest palette tinted by the chosen setting. IM Fell English for the story, Alegreya Sans for controls. One centered column. Avoided all-caps labels, arrow buttons and a SaaS card grid.
  - **Built:**
    - `api.ts`: one `requestStory()` that turns every response into a typed outcome (`story | invalid | rejected | unavailable | rate_limited | offline`). It parses defensively and never shows raw server text.
    - `catalog.ts`: settings, languages and the word rule, with a test that fails if they drift from the API's lists.
    - `hooks.ts`: reduced motion, countdown, typewriter, pause-when-hidden, stable client id.
    - Components: `Fire`, `Tale` (live region plus typed copy), `SoundToggle` (generated crackle, off by default), `Treeline`, glyphs.
    - `styles/tokens.css` and `styles/app.css`: all visuals. Fonts are self-hosted via Fontsource, so no third-party font requests.
  - **Tests:** 44 web tests. They cover each outcome's message and mood, the countdown, client-side word checks, reduced motion and the network tripwire, and that only filled words are sent. Production build and `tsc -b` clean.
  - **Live check in a real browser:** real story at desktop; rejected state ("Clever. Not clever enough. Three honest words, please." with a teal fire); invalid caught client-side with no request; mobile 390 px layout.
- **Mistakes caught in my own work:**
  1. **Countdown bug:** after a 429 the fire went straight back to idle instead of smouldering. The countdown hook still held the previous wait's `0` for one render, and the "wait is over" effect fired on it. A test caught it. Fixed by making the hook remember which wait its state belongs to.
  2. `tsc -b` failed on the test file (untyped `vi.fn` made `mock.calls` an empty tuple) even though every test passed. Vitest doesn't type-check, so the build is part of the gate.
  3. First screenshots: the forest and fog sat at the bottom of the long page, behind the form, so they were invisible at the top. Made the scene layers `fixed`. The moon rendered as a grey smudge (removed), and the far trees came out lighter than the sky (darkened).
  4. A browser subagent was pointed at port 5173, which was another of the user's apps. Moved this app to 5180 instead of stopping it.

---

### Entry 16

- **Timestamp:** 2026-10-22 17:10:10
- **Prompt:**
  > Configure this repository to deploy on Vercel as a project with multiple services (suggested `vercel.json` with `api` = `apps/api` Hono and `web` = `apps/web` Vite, `/api/(.*)` → api, `/(.*)` → web). Add bindings for internal services, update the code to match the routing and bindings, and confirm service names, public routes and bindings before finishing.
- **Goal:** Phase 7 wiring: one Vercel project with two services, without weakening the guardrails.
- **Action Taken:**
  - Read Vercel's services, routing, config-reference and Hono docs first. Key fact: a service receives the **original path** (`/api/story`), which already matches the API's `basePath('/api')`, so no path changes were needed.
  - **Entry point:** Vercel's Hono detection would have picked `src/app.ts` (a factory, not an app) or `src/server.ts` (starts a Node server and calls `process.exit`). Added `src/vercel.ts` and set `entrypoint` explicitly. Moved the wiring into `src/wire.ts`, shared by `server.ts` and `vercel.ts`.
  - **Fail closed on Vercel:** a bad config answers every `/api` route with the polite resting 503 instead of a raw 500. Problem names (never values) go to the logs.
  - **Client IP:** new config rule: on Vercel `IP_SOURCE` must be `vercel`. Otherwise every visitor shares the proxy's address and one person could rate-limit everyone. Only `x-real-ip` is read; `x-forwarded-for` is never trusted.
  - **No bindings:** the web app is static (the browser calls `/api` through the public rewrite), and the API calls only external services.
  - **Security headers** from SPEC §15 added to `vercel.json`. The production build was served with that exact CSP and checked in a real browser: no violations, story generated.
  - **Tests:** 434 API tests (+11) and `tsc` clean; 3 of 3 wiring mutations caught (socket IP on Vercel, trusting `x-forwarded-for`, crashing on bad config).
- **Open:** until Phase 5 (Neon), the deployed API answers "resting" by design (config requires `STORE=neon` on Vercel). Not deployed yet; service names, routes and bindings are waiting for the user's confirmation.
- **Mistakes caught in my own work:**
  1. My first test expected the config problem in the error message; `ConfigError` keeps problems in `.problems` and has a generic message. Fixed the test.
  2. My new test file imported `VALID_ENV` from `config.test.ts`, which would have run every config test twice. Moved it to `test/env.ts`.

### Entry 17

- **Timestamp:** 2026-10-22 17:36:40
- **Prompt:**
  > (Answering "Phase 5 or deploy first?") Build Phase 5 (Neon) first, then deploy.
  >
  > Set up Neon: 1. `npm i -g neon@latest` 2. `neon init -y --org-id org-quiet-leaf-53379359 --project-id old-field-77930437 --branch production --services postgres` 3. `neon deploy` 4. Wire each service into the code following the Neon skills. 5. Prove it works: the build must pass, then start the app and test each wired service end to end. 6. Report what changed, the command output that proves step 5, and anything that failed.
- **Goal:** Shared limits in Neon, so rate limits, the budget and the concurrency cap hold across Vercel instances (required before the deploy can serve stories).
- **Action Taken:**
  - Ran the three Neon commands. `neon init` failed until I ran it with `npm_config_force=true`: the repo's `devEngines` (pnpm) makes every npm call in the repo exit with `EBADDEVENGINES`. `neon deploy` reported no changes and pulled `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and `NEON_BRANCH` into `.env`.
  - Created a Neon branch `test` for integration tests (production is never used by tests).
  - Followed the Neon skill for Vercel: `pg` (node-postgres) plus `attachDatabasePool` from `@vercel/functions`; pooled URL for the app, unpooled URL for migrations; schema as code (`migrations/001_limits.sql`, `src/migrate.ts`, `scripts/migrate.ts`).
  - Wrote the LimitStore contract test first (13 cases, including parallel overshoot), then `NeonLimitStore`. Locks: row locks for the budget, advisory locks for rate limits and leases, `DELETE … RETURNING` for settle-once.
  - Config: `STORE=neon` is allowed and requires `DATABASE_URL`; `STORE=memory` ignores it. `wire.ts` builds the pool and store; `vercel.ts` attaches the pool.
  - Proof: 467 API tests (+33) and `tsc` clean; 44 web tests; root build clean; 4 of 4 lock mutations caught by the Neon contract. Migrated production (a second run says "up to date"). With `STORE=neon` locally: a story was served; the rows in production matched the cost log to the micro-dollar; after a server restart the per-IP limit still returned 429 and the day's total carried on ($0.002269, 5 calls).
- **Deferred:** the story cache, seen-tracking, AVOID list, near-duplicate check and degraded mode. If Neon fails mid-request, requests fail closed with a 503.
- **Mistakes caught in my own work:**
  1. The contract test's lease cleanup was fired without `await`, so it could race the lease tests. Caught on review before the first run; moved it to an awaited `beforeEach`.
  2. My first `reserve` used one global advisory lock and 9 round trips. The 20-way parallel test timed out (over 5 s from a laptop). Cut it to 5 round trips by locking the day and month rows with upsert … `RETURNING`: 2.2 s, still exactly 3 of 20.
  3. My first mutation script for the reserve lock was garbled, so I skipped that mutation and redid it cleanly (caught).
  4. I stopped the API server at the same moment as a request loop, which cut off two requests. The orphaned lease stayed held until its 30 s expiry: an accidental demonstration that a crashed request can't hold a slot forever.
  5. My config and wiring tests used fake database URLs with a username and password in them. The secret scan blocked the commit (it matches any URL with credentials). Switched to credential-free fakes; the scan stays strict. (Writing the URL shape into this entry tripped the scan a second time.)

### Entry 18

- **Timestamp:** 2026-10-22 18:02:30
- **Prompt:**
  > Deployed to Vercel but got `TypeError: Cannot read properties of undefined (reading 'readFile') at doTypeCheck ... @vercel/backends/dist/index.mjs:975:57 ... Using TypeScript 7.0.2 (local user-provided)`.
- **Goal:** Fix Vercel's backend builder failure on TypeScript 7.x compiler API changes.
- **Action Taken:**
  - Diagnosed that `@vercel/backends` typecheck expects the legacy `ts.sys.readFile` API, which changed in TypeScript 7.x.
  - Aligned the catalog's TypeScript dependency in `pnpm-workspace.yaml` to `~6.0.3` (which matches `apps/web`).
  - Ran `pnpm install`, verified clean `tsc` and 467/467 passing API tests, 44/44 web tests, and full monorepo build.
- **Mistakes caught in my own work:**
  - The API had been pinned to TypeScript 7.0.2 via the catalog while `apps/web` was on 6.0.3; harmonizing on 6.0.3 resolves the Vercel builder incompatibility.
