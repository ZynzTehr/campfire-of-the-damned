# Project Requirements & Day Brief

## Day Brief

Today you build the thing this whole program is named for: an app with AI inside it — and not a fragile demo, a reliable one. Your feature calls an AI model, behaves consistently (system prompt), stays affordable (cost cap), and holds up when users get weird (guardrails).

The grade is control + reliability. A single AI feature that works, guards its failures, and that you can fully explain — including the AI call in your data flow — beats a flashier one that falls over. Remember the demo: show it working, explain the AI call, and name your failure mode + guardrail.

## Your Build Plan

Re-confirm before you start:

- **My AI feature:** ____________ (what it does for the user)
- **My system prompt (role + rule):** ____________
- **Likely failure mode:** ____________
- **My three guardrails:** input ____ / output ____ / failure ____

### The Spec

- Halloween themed app.
- Calls an AI API on the back end (key secret) + shows the result.
- System prompt in code.
- One guardrail each for bad input, bad output, failure.
- Cost-aware (capped input; you know rough cost).
- On GitHub, no secrets committed.

## The Build Loop (controlled loop, all day)

`ask → review the diff → accept → run → verify (incl. the AI output) → commit`

1. Ask for one piece at a time: the AI call → the system prompt → each guardrail → the cost cap.
2. Review the diff — find the AI call, the system prompt, the guard. Explain before accepting.
3. Verify — run it; judge the AI's actual output; try to break it and confirm the guard holds.
4. Commit each working piece. Key stays out of every commit.
5. Get the AI call working and committed before adding guardrails. Then attack it and guard what breaks.

## Control Checklist (keep this next to you)

- [ ] I reviewed every diff before accepting it.
- [ ] I can explain my data flow including the AI call.
- [ ] The AI feature works and I judged the output quality (not just "it ran").
- [ ] I have a guardrail for bad input, bad output, and failure.
- [ ] I capped input and know roughly what a call costs.
- [ ] My API key is git-ignored — NOT in any commit.
- [ ] Small commits + Prompt Log current + one agent mistake caught.

## When You Get Stuck

The "I'm Stuck" ladder, agent edition:

1. Read the error message.
2. Paste the exact error to model; ask it to explain + fix; review the fix.
3. Ask a peer.
4. Ask the TA.

AI-API errors are common (auth, model id, rate limit). If the agent loops, git back to your last working commit and take a smaller step.

## End-of-Day Self-Check (demo-ready?)

By end of day, aim to have:

- [ ] A working AI feature with a system prompt in code.
- [ ] One guardrail each for input, output, failure — tested by trying to break it.
- [ ] Cost cap in place + a rough cost figure in mind.
- [ ] Pushed to GitHub, key NOT committed.
- [ ] Data-flow (with the AI call) + failure-mode + guardrail ready to explain.
- [ ] A rough 2-minute demo in mind.

Not done? Note where you are. Day 5 opens with a short finish-up window.

Tomorrow (Day 5) is a short day: demo your AI feature, explain the AI call, name your failure mode + guardrail, close the week. Next week is the Phase 2 gate — this is your rehearsal.
