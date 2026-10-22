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
  > - Let's break this down into phases: backend first, then testing, and the frontend last.
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

